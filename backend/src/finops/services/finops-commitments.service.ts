import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import { FinopsCreditGrant } from '../../db/entites/finops-credit-grant.entity';
import { FinopsCreditConsumption } from '../../db/entites/finops-credit-consumption.entity';
import { FinopsCommitmentSnapshot } from '../../db/entites/finops-commitment-snapshot.entity';
import { FinopsCommitmentRecommendation } from '../../db/entites/finops-commitment-recommendation.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import { findCloudAccountForTenant } from '../utils/find-cloud-account';
import { andWhereServiceLevelCost } from '../utils/service-level-cost';
import type {
    FinopsCommitmentRecommendationEntry,
    FinopsCommitmentUtilizationEntry,
    FinopsCreditConsumptionEntry,
    FinopsCreditGrantEntry,
    IFinopsProvider,
} from '../providers/finops-provider.interface';

export type CreditGrantStatus = 'active' | 'expiring' | 'expired' | 'exhausted';

export interface CreditGrantServiceUsage {
    service: string;
    amount: number;
}

export interface CreateCreditGrantDto {
    cloudAccountId: string;
    name: string;
    totalAmount: number;
    currency?: string;
    startsAt: string;
    expiresAt?: string | null;
    notes?: string | null;
    services: string[];
}

export interface UpdateCreditGrantDto {
    name?: string;
    totalAmount?: number;
    currency?: string;
    startsAt?: string;
    expiresAt?: string | null;
    notes?: string | null;
    services?: string[];
}

export interface CommitmentsFilter {
    cloudAccountId?: string;
    provider?: string;
    periodStart?: string;
    periodEnd?: string;
}

const COVERAGE_RESERVE_THRESHOLD = 80;
const UTILIZATION_UNDERUSED_THRESHOLD = 90;
const EXPIRING_SOON_DAYS = 30;
const DEFAULT_LOOKBACK_DAYS = 30;

@Injectable()
export class FinopsCommitmentsService {
    private readonly logger = new Logger(FinopsCommitmentsService.name);

    constructor(
        @InjectRepository(FinopsCreditGrant)
        private readonly grantRepo: Repository<FinopsCreditGrant>,

        @InjectRepository(FinopsCreditConsumption)
        private readonly consumptionRepo: Repository<FinopsCreditConsumption>,

        @InjectRepository(FinopsCommitmentSnapshot)
        private readonly snapshotRepo: Repository<FinopsCommitmentSnapshot>,

        @InjectRepository(FinopsCommitmentRecommendation)
        private readonly recommendationRepo: Repository<FinopsCommitmentRecommendation>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,

        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,
    ) {}

    /**
     * Soft-fail collector hook called from FinopsProcessor after cost ingest.
     */
    async syncFromProvider(
        organizationId: string,
        cloudAccountId: string,
        cloudProvider: string,
        provider: IFinopsProvider,
        providerCreds: { credentials: Record<string, unknown>; cloudAccountId: string },
        periodStart: string,
        periodEnd: string,
        lookbackDays = DEFAULT_LOOKBACK_DAYS,
        reconcileStale = false,
    ): Promise<void> {
        try {
            if (provider.collectCreditGrants) {
                const grants = await provider.collectCreditGrants(providerCreds);
                await this.upsertImportedGrants(organizationId, cloudAccountId, cloudProvider, grants);
            }
        } catch (error) {
            this.logger.warn(
                `[commitments] credit grant import failed for ${cloudAccountId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        try {
            const creditEntries = await provider.collectCreditConsumption(providerCreds, periodStart, periodEnd);
            await this.upsertCreditConsumptions(organizationId, cloudAccountId, cloudProvider, creditEntries);
        } catch (error) {
            this.logger.warn(
                `[commitments] credit sync failed for ${cloudAccountId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        try {
            const utilization = await provider.collectCommitmentUtilization(providerCreds, lookbackDays);
            await this.upsertSnapshots(organizationId, cloudAccountId, cloudProvider, utilization);
        } catch (error) {
            this.logger.warn(
                `[commitments] utilization sync failed for ${cloudAccountId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        try {
            const recommendations = await provider.collectCommitmentRecommendations(providerCreds, lookbackDays);
            await this.upsertRecommendations(
                organizationId,
                cloudAccountId,
                cloudProvider,
                recommendations,
                reconcileStale,
            );
        } catch (error) {
            this.logger.warn(
                `[commitments] recommendations sync failed for ${cloudAccountId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    async upsertCreditConsumptions(
        organizationId: string,
        cloudAccountId: string,
        provider: string,
        entries: FinopsCreditConsumptionEntry[],
    ): Promise<number> {
        let upserted = 0;
        for (const entry of entries) {
            if (!entry.date || !entry.label || entry.amount <= 0) continue;
            await this.consumptionRepo.upsert(
                {
                    organizationId,
                    cloudAccountId,
                    provider,
                    amount: entry.amount,
                    currency: entry.currency || 'USD',
                    date: entry.date,
                    label: entry.label.slice(0, 255),
                    rawMetadata: entry.rawMetadata ?? null,
                } as Parameters<Repository<FinopsCreditConsumption>['upsert']>[0],
                {
                    conflictPaths: ['cloudAccountId', 'date', 'label', 'currency'],
                    skipUpdateIfNoValuesChanged: true,
                },
            );
            upserted += 1;
        }
        return upserted;
    }

    async upsertImportedGrants(
        organizationId: string,
        cloudAccountId: string,
        provider: string,
        entries: FinopsCreditGrantEntry[],
    ): Promise<number> {
        let upserted = 0;
        for (const entry of entries) {
            const externalId = entry.externalId.trim().slice(0, 128);
            if (!externalId) continue;

            const existing = await this.grantRepo.findOne({
                where: { organizationId, cloudAccountId, externalId },
            });

            // Crédito que já chegou esgotado ou vencido não entra. O que já
            // acompanhávamos continua gravado e passa para o histórico.
            if (!existing && !isOpenCreditWithBalance(entry)) continue;

            const payload = {
                organizationId,
                cloudAccountId,
                provider,
                externalId,
                name: entry.name.trim().slice(0, 255),
                totalAmount: entry.totalAmount,
                reportedRemaining: entry.reportedRemaining,
                currency: (entry.currency || 'USD').toUpperCase(),
                startsAt: entry.startsAt,
                expiresAt: entry.expiresAt,
                services: entry.appliesToAllServices ? [] : entry.services,
                appliesToAllServices: entry.appliesToAllServices,
                providerUsage: entry.usageByService,
                notes: entry.notes,
                source: 'imported' as const,
            };

            if (existing) {
                Object.assign(existing, payload);
                await this.grantRepo.save(existing);
            } else {
                await this.grantRepo.save(this.grantRepo.create(payload));
            }
            upserted += 1;
        }
        return upserted;
    }

    async upsertSnapshots(
        organizationId: string,
        cloudAccountId: string,
        provider: string,
        entries: FinopsCommitmentUtilizationEntry[],
    ): Promise<number> {
        const syncedAt = new Date();
        let upserted = 0;
        for (const entry of entries) {
            await this.snapshotRepo.upsert(
                {
                    organizationId,
                    cloudAccountId,
                    provider,
                    commitmentType: entry.commitmentType,
                    externalId: entry.externalId.slice(0, 512),
                    name: entry.name,
                    utilizationPercent: entry.utilizationPercent,
                    coveragePercent: entry.coveragePercent,
                    usedCommitment: entry.usedCommitment,
                    unusedCommitment: entry.unusedCommitment,
                    hourlyCommitment: entry.hourlyCommitment,
                    monthlyCommitment: entry.monthlyCommitment,
                    term: entry.term,
                    currency: entry.currency || 'USD',
                    lookbackDays: entry.lookbackDays,
                    rawMetadata: entry.rawMetadata ?? null,
                    syncedAt,
                } as Parameters<Repository<FinopsCommitmentSnapshot>['upsert']>[0],
                {
                    conflictPaths: ['cloudAccountId', 'commitmentType', 'externalId'],
                    skipUpdateIfNoValuesChanged: true,
                },
            );
            upserted += 1;
        }
        return upserted;
    }

    async upsertRecommendations(
        organizationId: string,
        cloudAccountId: string,
        provider: string,
        entries: FinopsCommitmentRecommendationEntry[],
        reconcileStale = false,
    ): Promise<number> {
        const syncedAt = new Date();
        let upserted = 0;
        const keysByType = new Map<string, string[]>();
        for (const entry of entries) {
            const key = entry.recommendationKey.slice(0, 255);
            const list = keysByType.get(entry.commitmentType) ?? [];
            list.push(key);
            keysByType.set(entry.commitmentType, list);
            await this.recommendationRepo.upsert(
                {
                    organizationId,
                    cloudAccountId,
                    provider,
                    commitmentType: entry.commitmentType,
                    recommendationKey: key,
                    lookbackDays: entry.lookbackDays,
                    term: entry.term,
                    paymentOption: entry.paymentOption,
                    estimatedMonthlySavings: entry.estimatedMonthlySavings,
                    estimatedSavingsPercentage: entry.estimatedSavingsPercentage,
                    recommendedHourlyCommitment: entry.recommendedHourlyCommitment,
                    eligible: entry.eligible,
                    ineligibleReason: entry.ineligibleReason,
                    summary: entry.summary,
                    currency: entry.currency || 'USD',
                    rawMetadata: entry.rawMetadata ?? null,
                    syncedAt,
                } as Parameters<Repository<FinopsCommitmentRecommendation>['upsert']>[0],
                {
                    conflictPaths: ['cloudAccountId', 'commitmentType', 'recommendationKey'],
                    skipUpdateIfNoValuesChanged: true,
                },
            );
            upserted += 1;
        }

        if (reconcileStale) {
            for (const [commitmentType, keys] of keysByType) {
                if (keys.length === 0) continue;
                await this.recommendationRepo
                    .createQueryBuilder()
                    .delete()
                    .where('cloud_account_id = :cloudAccountId', { cloudAccountId })
                    .andWhere('commitment_type = :commitmentType', { commitmentType })
                    .andWhere('recommendation_key NOT IN (:...keys)', { keys })
                    .execute();
            }
        }

        return upserted;
    }

    // ─── Credits CRUD ────────────────────────────────────────────────────────

    async createGrant(organizationId: string, dto: CreateCreditGrantDto): Promise<Record<string, unknown>> {
        const account = await this.requireCloudAccount(dto.cloudAccountId, organizationId);
        this.assertDate(dto.startsAt, 'startsAt');
        if (dto.expiresAt) this.assertDate(dto.expiresAt, 'expiresAt');
        if (dto.totalAmount <= 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.CREDIT_GRANT_INVALID_AMOUNT);
        }
        const services = normalizeServices(dto.services);
        if (services.length === 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.CREDIT_GRANT_SERVICES_REQUIRED);
        }

        const grant = this.grantRepo.create({
            organizationId,
            cloudAccountId: dto.cloudAccountId,
            provider: account.provider,
            name: dto.name.trim(),
            totalAmount: dto.totalAmount,
            currency: (dto.currency ?? 'USD').toUpperCase(),
            startsAt: dto.startsAt,
            expiresAt: dto.expiresAt ?? null,
            notes: dto.notes?.trim() || null,
            services,
            appliesToAllServices: false,
            externalId: null,
            reportedRemaining: null,
            providerUsage: null,
            source: 'manual',
        });

        const saved = await this.grantRepo.save(grant);
        return this.enrichGrant(saved);
    }

    async updateGrant(
        organizationId: string,
        grantId: string,
        dto: UpdateCreditGrantDto,
    ): Promise<Record<string, unknown>> {
        const grant = await this.grantRepo.findOne({ where: { id: grantId, organizationId } });
        if (!grant) throw new NotFoundException(ErrorMessages.FINOPS.CREDIT_GRANT_NOT_FOUND);

        if (dto.name != null) grant.name = dto.name.trim();
        if (dto.totalAmount != null) {
            if (dto.totalAmount <= 0) {
                throw new BadRequestException(ErrorMessages.FINOPS.CREDIT_GRANT_INVALID_AMOUNT);
            }
            grant.totalAmount = dto.totalAmount;
        }
        if (dto.currency != null) grant.currency = dto.currency.toUpperCase();
        if (dto.startsAt != null) {
            this.assertDate(dto.startsAt, 'startsAt');
            grant.startsAt = dto.startsAt;
        }
        if (dto.expiresAt !== undefined) {
            if (dto.expiresAt) this.assertDate(dto.expiresAt, 'expiresAt');
            grant.expiresAt = dto.expiresAt;
        }
        if (dto.notes !== undefined) grant.notes = dto.notes?.trim() || null;
        if (dto.services !== undefined) {
            const services = normalizeServices(dto.services);
            if (services.length === 0) {
                throw new BadRequestException(ErrorMessages.FINOPS.CREDIT_GRANT_SERVICES_REQUIRED);
            }
            grant.services = services;
        }

        const saved = await this.grantRepo.save(grant);
        return this.enrichGrant(saved);
    }

    async listAccountServices(organizationId: string, cloudAccountId: string): Promise<{ services: string[] }> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const qb = this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.service', 'service')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere(`r.service <> ''`)
            .groupBy('r.service')
            .orderBy('r.service', 'ASC');
        andWhereServiceLevelCost(qb, 'r');

        const rows = await qb.getRawMany<{ service: string }>();
        return { services: rows.map((row) => row.service).filter(Boolean) };
    }

    async deleteGrant(organizationId: string, grantId: string): Promise<void> {
        const grant = await this.grantRepo.findOne({ where: { id: grantId, organizationId } });
        if (!grant) throw new NotFoundException(ErrorMessages.FINOPS.CREDIT_GRANT_NOT_FOUND);
        await this.grantRepo.remove(grant);
    }

    async listCredits(organizationId: string, filter: CommitmentsFilter = {}) {
        const accountIds = await this.resolveAccountIds(organizationId, filter);
        if (accountIds.length === 0) {
            return { grants: [], consumptions: [], totals: this.emptyCreditTotals() };
        }

        const grants = await this.grantRepo.find({
            where: { organizationId, cloudAccountId: In(accountIds) },
            order: { expiresAt: 'ASC', createdAt: 'DESC' },
        });

        const periodStart = filter.periodStart;
        const periodEnd = filter.periodEnd;
        const consumptionWhere: Record<string, unknown> = {
            organizationId,
            cloudAccountId: In(accountIds),
        };
        if (periodStart && periodEnd) {
            consumptionWhere.date = Between(periodStart, periodEnd);
        }

        const consumptions = await this.consumptionRepo.find({
            where: consumptionWhere,
            order: { date: 'DESC' },
            take: 500,
        });

        const enrichedGrants = await Promise.all(grants.map((g) => this.enrichGrant(g)));
        const openGrants = enrichedGrants.filter(
            (grant) => grant.status === 'active' || grant.status === 'expiring',
        );

        const totalGranted = openGrants.reduce((s, g) => s + Number(g.totalAmount), 0);
        const totalRemaining = openGrants.reduce((sum, grant) => sum + Number(grant.remainingAmount), 0);
        const consumedInPeriod = openGrants.reduce((sum, grant) => {
            if (!grantOverlapsPeriod(String(grant.startsAt ?? ''), grant.expiresAt as string | null, periodStart, periodEnd)) {
                return sum;
            }
            return sum + Number(grant.consumedAmount);
        }, 0);
        const expiringSoon = openGrants.filter((g) => g.status === 'expiring').length;

        return {
            grants: enrichedGrants,
            consumptions: consumptions.map((c) => ({
                id: c.id,
                cloudAccountId: c.cloudAccountId,
                provider: c.provider,
                amount: Number(c.amount),
                currency: c.currency,
                date: c.date,
                label: c.label,
            })),
            totals: {
                totalGranted,
                totalRemaining,
                consumedInPeriod,
                expiringSoon,
                currency: String(enrichedGrants[0]?.currency ?? consumptions[0]?.currency ?? 'USD'),
            },
        };
    }

    async listUtilization(organizationId: string, filter: CommitmentsFilter = {}) {
        const accountIds = await this.resolveAccountIds(organizationId, filter);
        if (accountIds.length === 0) return { items: [] };

        const items = await this.snapshotRepo.find({
            where: { organizationId, cloudAccountId: In(accountIds) },
            order: { syncedAt: 'DESC' },
        });

        return {
            items: items.map((s) => ({
                id: s.id,
                cloudAccountId: s.cloudAccountId,
                provider: s.provider,
                commitmentType: s.commitmentType,
                externalId: s.externalId,
                name: s.name,
                utilizationPercent: s.utilizationPercent != null ? Number(s.utilizationPercent) : null,
                coveragePercent: s.coveragePercent != null ? Number(s.coveragePercent) : null,
                usedCommitment: s.usedCommitment != null ? Number(s.usedCommitment) : null,
                unusedCommitment: s.unusedCommitment != null ? Number(s.unusedCommitment) : null,
                hourlyCommitment: s.hourlyCommitment != null ? Number(s.hourlyCommitment) : null,
                monthlyCommitment: s.monthlyCommitment != null ? Number(s.monthlyCommitment) : null,
                term: s.term,
                currency: s.currency,
                lookbackDays: s.lookbackDays,
                syncedAt: s.syncedAt,
            })),
        };
    }

    async listRecommendations(organizationId: string, filter: CommitmentsFilter = {}) {
        const accountIds = await this.resolveAccountIds(organizationId, filter);
        if (accountIds.length === 0) return { items: [] };

        const items = await this.recommendationRepo.find({
            where: { organizationId, cloudAccountId: In(accountIds) },
            order: { estimatedMonthlySavings: 'DESC', syncedAt: 'DESC' },
        });

        return {
            items: items.map((r) => ({
                id: r.id,
                cloudAccountId: r.cloudAccountId,
                provider: r.provider,
                commitmentType: r.commitmentType,
                recommendationKey: r.recommendationKey,
                lookbackDays: r.lookbackDays,
                term: r.term,
                paymentOption: r.paymentOption,
                estimatedMonthlySavings:
                    r.estimatedMonthlySavings != null ? Number(r.estimatedMonthlySavings) : null,
                estimatedSavingsPercentage:
                    r.estimatedSavingsPercentage != null ? Number(r.estimatedSavingsPercentage) : null,
                recommendedHourlyCommitment:
                    r.recommendedHourlyCommitment != null ? Number(r.recommendedHourlyCommitment) : null,
                eligible: r.eligible,
                ineligibleReason: r.ineligibleReason,
                summary: r.summary,
                currency: r.currency,
                syncedAt: r.syncedAt,
            })),
        };
    }

    async getOverview(organizationId: string, filter: CommitmentsFilter = {}) {
        const [credits, utilization, recommendations] = await Promise.all([
            this.listCredits(organizationId, filter),
            this.listUtilization(organizationId, filter),
            this.listRecommendations(organizationId, filter),
        ]);

        const aggregateSnapshots = utilization.items.filter((i) => i.externalId.includes('aggregate'));
        const snapshotsForAvg = aggregateSnapshots.length > 0 ? aggregateSnapshots : utilization.items;

        const utilValues = snapshotsForAvg
            .map((s) => s.utilizationPercent)
            .filter((v): v is number => v != null && Number.isFinite(v));
        const covValues = snapshotsForAvg
            .map((s) => s.coveragePercent)
            .filter((v): v is number => v != null && Number.isFinite(v));

        const avgUtilization =
            utilValues.length > 0 ? utilValues.reduce((a, b) => a + b, 0) / utilValues.length : null;
        const avgCoverage =
            covValues.length > 0 ? covValues.reduce((a, b) => a + b, 0) / covValues.length : null;
        const unusedValues = utilization.items
            .map((item) => item.unusedCommitment)
            .filter((value): value is number => value != null && Number.isFinite(value));
        const unusedCommitment = unusedValues.length > 0 ? unusedValues.reduce((sum, value) => sum + value, 0) : null;

        const eligibleRecs = recommendations.items.filter(
            (r) => r.eligible && (r.estimatedMonthlySavings ?? 0) > 0,
        );
        const potentialMonthlySavings = eligibleRecs.reduce(
            (s, r) => s + (r.estimatedMonthlySavings ?? 0),
            0,
        );

        const canReserveMore =
            avgCoverage != null
                ? avgCoverage < COVERAGE_RESERVE_THRESHOLD && eligibleRecs.length > 0
                : eligibleRecs.length > 0;

        const shouldNotReserveMore =
            (avgUtilization != null && avgUtilization < UTILIZATION_UNDERUSED_THRESHOLD) ||
            eligibleRecs.length === 0;

        return {
            credits: credits.totals,
            commitments: {
                avgUtilizationPercent: avgUtilization,
                avgCoveragePercent: avgCoverage,
                unusedCommitment,
                potentialMonthlySavings,
                canReserveMore,
                shouldNotReserveMore,
                eligibleRecommendations: eligibleRecs.length,
                snapshotCount: utilization.items.length,
                currency: utilization.items[0]?.currency ?? credits.totals.currency ?? 'USD',
            },
            thresholds: {
                coverageReserveThreshold: COVERAGE_RESERVE_THRESHOLD,
                utilizationUnderusedThreshold: UTILIZATION_UNDERUSED_THRESHOLD,
            },
        };
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    private async enrichGrant(grant: FinopsCreditGrant): Promise<Record<string, unknown>> {
        const services = normalizeServices(grant.services);
        const totalAmount = Number(grant.totalAmount);
        const rawRemaining = grant.reportedRemaining as number | string | null;
        const reported = rawRemaining == null || rawRemaining === '' ? null : Number(rawRemaining);

        let consumed: number;
        let remainingAmount: number;
        let eligibleSpend: number;
        let usageByService: CreditGrantServiceUsage[];
        let usageSource: 'provider' | 'services' | 'credits';

        // Saldo do provedor (AWS GetCredits) tem prioridade. A soma local só cobre concessão manual.
        if (reported != null && Number.isFinite(reported)) {
            remainingAmount = Math.max(0, Math.min(totalAmount, reported));
            consumed = Math.max(0, totalAmount - remainingAmount);
            eligibleSpend = consumed;
            usageByService = Array.isArray(grant.providerUsage) ? grant.providerUsage : [];
            usageSource = 'provider';
        } else if (services.length > 0) {
            const usage = await this.sumServiceSpendForGrant(grant, services);
            consumed = Math.min(totalAmount, usage.eligibleSpend);
            remainingAmount = Math.max(0, totalAmount - consumed);
            eligibleSpend = usage.eligibleSpend;
            usageByService = usage.byService;
            usageSource = 'services';
        } else {
            const billUsage = await this.sumConsumptionForGrant(grant);
            consumed = Math.min(totalAmount, billUsage);
            remainingAmount = Math.max(0, totalAmount - consumed);
            eligibleSpend = billUsage;
            usageByService = [];
            usageSource = 'credits';
        }

        const status = this.computeGrantStatus(grant, remainingAmount);

        return {
            id: grant.id,
            cloudAccountId: grant.cloudAccountId,
            provider: grant.provider,
            name: grant.name,
            totalAmount,
            consumedAmount: consumed,
            remainingAmount,
            eligibleSpend,
            usageByService,
            usageSource,
            currency: grant.currency,
            startsAt: calendarDate(grant.startsAt),
            expiresAt: calendarDate(grant.expiresAt),
            notes: grant.notes,
            services,
            appliesToAllServices: grant.appliesToAllServices === true,
            source: grant.source,
            status,
            createdAt: grant.createdAt,
            updatedAt: grant.updatedAt,
        };
    }

    /**
     * Uso = soma do custo positivo dos serviços elegíveis no período da concessão.
     * Prefere granularidade diária para não duplicar o mensal e para respeitar o intervalo.
     */
    private async sumServiceSpendForGrant(
        grant: FinopsCreditGrant,
        services: string[],
    ): Promise<{ eligibleSpend: number; byService: CreditGrantServiceUsage[] }> {
        const { from, toExclusive } = this.grantSpendWindow(grant);
        if (from >= toExclusive) return { eligibleSpend: 0, byService: [] };

        const granularity = await this.resolveSpendGranularity(grant, services, from, toExclusive);
        const qb = this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.service', 'service')
            .addSelect('COALESCE(SUM(r.cost), 0)', 'amount')
            .where('r.organizationId = :orgId', { orgId: grant.organizationId })
            .andWhere('r.cloudAccountId = :accountId', { accountId: grant.cloudAccountId })
            .andWhere('r.granularity = :granularity', { granularity })
            .andWhere('r.currency = :currency', { currency: grant.currency })
            .andWhere('r.service IN (:...services)', { services })
            .andWhere('r.date >= :from', { from })
            .andWhere('r.date < :toExclusive', { toExclusive })
            .andWhere('r.cost > 0')
            .groupBy('r.service')
            .orderBy('r.service', 'ASC');
        andWhereServiceLevelCost(qb, 'r');

        const rows = await qb.getRawMany<{ service: string; amount: string }>();
        const byService = rows
            .map((row) => ({ service: row.service, amount: Number(row.amount) }))
            .filter((row) => row.service && row.amount > 0);
        const eligibleSpend = byService.reduce((sum, row) => sum + row.amount, 0);
        return { eligibleSpend, byService };
    }

    private async resolveSpendGranularity(
        grant: FinopsCreditGrant,
        services: string[],
        from: string,
        toExclusive: string,
    ): Promise<'daily' | 'monthly'> {
        const countFor = async (granularity: 'daily' | 'monthly') => {
            const qb = this.costRecordRepo
                .createQueryBuilder('r')
                .where('r.organizationId = :orgId', { orgId: grant.organizationId })
                .andWhere('r.cloudAccountId = :accountId', { accountId: grant.cloudAccountId })
                .andWhere('r.granularity = :granularity', { granularity })
                .andWhere('r.currency = :currency', { currency: grant.currency })
                .andWhere('r.service IN (:...services)', { services })
                .andWhere('r.date >= :from', { from })
                .andWhere('r.date < :toExclusive', { toExclusive })
                .andWhere('r.cost > 0');
            andWhereServiceLevelCost(qb, 'r');
            return qb.getCount();
        };

        const daily = await countFor('daily');
        if (daily > 0) return 'daily';
        return 'monthly';
    }

    private grantSpendWindow(grant: FinopsCreditGrant): { from: string; toExclusive: string } {
        const today = new Date().toISOString().slice(0, 10);
        const startsAt = calendarDate(grant.startsAt) ?? today;
        const expiresAt = calendarDate(grant.expiresAt);
        const inclusiveEnd = expiresAt && expiresAt < today ? expiresAt : today;
        return { from: startsAt, toExclusive: addUtcDays(inclusiveEnd, 1) };
    }

    private async sumConsumptionForGrant(grant: FinopsCreditGrant): Promise<number> {
        const qb = this.consumptionRepo
            .createQueryBuilder('c')
            .select('COALESCE(SUM(c.amount), 0)', 'total')
            .where('c.organization_id = :orgId', { orgId: grant.organizationId })
            .andWhere('c.cloud_account_id = :accountId', { accountId: grant.cloudAccountId })
            .andWhere('c.date >= :startsAt', { startsAt: calendarDate(grant.startsAt) });

        const expiresAt = calendarDate(grant.expiresAt);
        if (expiresAt) {
            qb.andWhere('c.date <= :expiresAt', { expiresAt });
        }

        const raw = await qb.getRawOne<{ total: string }>();
        return Number(raw?.total ?? 0);
    }

    private computeGrantStatus(grant: FinopsCreditGrant, remainingAmount: number): CreditGrantStatus {
        const todayStr = new Date().toISOString().slice(0, 10);
        const expiresAt = calendarDate(grant.expiresAt);

        if (expiresAt && expiresAt < todayStr) return 'expired';
        if (remainingAmount <= 0) return 'exhausted';
        if (expiresAt) {
            const exp = new Date(`${expiresAt}T00:00:00Z`);
            const today = new Date(`${todayStr}T00:00:00Z`);
            const diffDays = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= EXPIRING_SOON_DAYS) return 'expiring';
        }
        return 'active';
    }

    private async resolveAccountIds(organizationId: string, filter: CommitmentsFilter): Promise<string[]> {
        if (filter.cloudAccountId) {
            const account = await findCloudAccountForTenant(
                this.cloudAccountRepo,
                filter.cloudAccountId,
                organizationId,
            );
            if (!account) return [];
            if (filter.provider && account.provider !== filter.provider) return [];
            return [account.id];
        }

        const qb = this.cloudAccountRepo
            .createQueryBuilder('ca')
            .select(['ca.id', 'ca.provider'])
            .where('(ca.tenantId = :organizationId OR ca.organizationId = :organizationId)', { organizationId });

        if (filter.provider) {
            qb.andWhere('ca.provider = :provider', { provider: filter.provider });
        }

        const accounts = await qb.getMany();
        return accounts.map((a) => a.id);
    }

    private async requireCloudAccount(cloudAccountId: string, organizationId: string): Promise<CloudAccount> {
        const account = await findCloudAccountForTenant(this.cloudAccountRepo, cloudAccountId, organizationId);
        if (!account) throw new NotFoundException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        return account;
    }

    private assertDate(value: string, field: string): void {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new BadRequestException(`${field} must be YYYY-MM-DD`);
        }
    }

    private emptyCreditTotals() {
        return {
            totalGranted: 0,
            totalRemaining: 0,
            consumedInPeriod: 0,
            expiringSoon: 0,
            currency: 'USD',
        };
    }
}

function calendarDate(value: string | Date | null | undefined): string | null {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        const year = value.getUTCFullYear();
        const month = String(value.getUTCMonth() + 1).padStart(2, '0');
        const day = String(value.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
    return match ? match[1] : null;
}

function isOpenCreditWithBalance(entry: FinopsCreditGrantEntry): boolean {
    if (entry.reportedRemaining <= 0) return false;
    if (entry.notes?.split(' · ').includes('DISABLED')) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (entry.startsAt > today) return false;
    if (entry.expiresAt && entry.expiresAt < today) return false;
    return true;
}

function grantOverlapsPeriod(
    startsAt: string | null,
    expiresAt: string | null,
    periodStart?: string,
    periodEnd?: string,
): boolean {
    if (!periodStart || !periodEnd) return true;
    if (startsAt && startsAt > periodEnd) return false;
    if (expiresAt && expiresAt < periodStart) return false;
    return true;
}

function normalizeServices(values: string[] | null | undefined): string[] {
    if (!values?.length) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of values) {
        const service = raw.trim();
        if (!service || service.length > 255 || seen.has(service)) continue;
        seen.add(service);
        result.push(service);
        if (result.length >= 200) break;
    }
    return result;
}

function addUtcDays(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
