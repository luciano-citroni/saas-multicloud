import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import { FinopsCreditGrant } from '../../db/entites/finops-credit-grant.entity';
import { FinopsCreditConsumption } from '../../db/entites/finops-credit-consumption.entity';
import { FinopsCommitmentSnapshot } from '../../db/entites/finops-commitment-snapshot.entity';
import { FinopsCommitmentRecommendation } from '../../db/entites/finops-commitment-recommendation.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { AwsEc2Instance } from '../../db/entites/aws-ec2.entity';
import { AzureVirtualMachine } from '../../db/entites/azure-virtual-machine.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import { findCloudAccountForTenant } from '../utils/find-cloud-account';
import { andWhereResourceLevelCost, andWhereServiceLevelCost } from '../utils/service-level-cost';
import type {
    FinopsCommitmentRecommendationEntry,
    FinopsCommitmentUtilizationEntry,
    FinopsCostEntry,
    FinopsCreditConsumptionEntry,
    FinopsCreditGrantEntry,
    FinopsProviderCredentials,
    FinopsProviderSession,
    IFinopsProvider,
} from '../providers/finops-provider.interface';

export interface SyncFromProviderOptions {
    session?: FinopsProviderSession;
    /** Azure: deriva fallback de crédito sem 2ª query CM. */
    costEntriesFallback?: FinopsCostEntry[];
    /** GCP bundle: créditos já coletados no job combinado. */
    prefetchedCredits?: FinopsCreditConsumptionEntry[];
    /** GCP bundle: utilização CUD já coletada no job combinado. */
    prefetchedUtilization?: FinopsCommitmentUtilizationEntry[];
}

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

export interface CommitmentCandidateFilter extends CommitmentsFilter {
    lookbackDays?: number;
    limit?: number;
}

export type CommitmentCandidateReason =
    | 'stable_spend'
    | 'consistent_usage'
    | 'compute_eligible'
    | 'long_running_instance';

export type CommitmentCandidateCostSource = 'resource' | 'service_apportioned' | 'none';

export interface CommitmentCandidateItem {
    cloudAccountId: string;
    cloudProvider: string;
    resourceId: string;
    service: string;
    region: string;
    totalCost: number;
    estimatedMonthlyCost: number;
    /** Expected monthly savings if covered by Compute SP / reservation (heuristic). */
    estimatedSpMonthlySavings: number;
    estimatedSpSavingsPercentage: number | null;
    costSource: CommitmentCandidateCostSource;
    activeDays: number;
    lookbackDays: number;
    stabilityScore: number;
    reasonCodes: CommitmentCandidateReason[];
    instanceType: string | null;
    launchAgeDays: number | null;
    currency: string;
}

const COVERAGE_RESERVE_THRESHOLD = 80;
const UTILIZATION_UNDERUSED_THRESHOLD = 90;
const EXPIRING_SOON_DAYS = 30;
const DEFAULT_LOOKBACK_DAYS = 30;
const CANDIDATE_DEFAULT_LOOKBACK_DAYS = 90;
const CANDIDATE_MIN_LOOKBACK_DAYS = 14;
const CANDIDATE_MAX_LOOKBACK_DAYS = 120;
const CANDIDATE_MAX_LIMIT = 50;
const CANDIDATE_INVENTORY_MIN_AGE_DAYS = 90;
/** Fallback Compute SP savings rate when the account has no purchase recommendation %. */
const DEFAULT_COMPUTE_SP_SAVINGS_RATE = 0.28;
/** Services whose usage is typically covered by Compute SP / RI / VM reservation / CUD. */
const COMMITMENT_CANDIDATE_SERVICE_PATTERNS = [
    '%Elastic Compute Cloud%',
    '%Amazon EC2%',
    '%EC2%',
    '%AWS Lambda%',
    '%Lambda%',
    '%Fargate%',
    '%Elastic Container Service%',
    '%Amazon ECS%',
    '%AWS Resource%',
    '%Virtual Machines%',
    '%Virtual Machine%',
    '%Microsoft.Compute%',
    '%Compute%',
    '%Compute Engine%',
] as const;

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

        @InjectRepository(AwsEc2Instance)
        private readonly ec2Repo: Repository<AwsEc2Instance>,

        @InjectRepository(AzureVirtualMachine)
        private readonly azureVmRepo: Repository<AzureVirtualMachine>,
    ) {}

    /**
     * Soft-fail collector hook called from FinopsProcessor after cost ingest.
     * Streams independentes rodam em paralelo; sessão compartilhada evita re-auth.
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
        options?: SyncFromProviderOptions,
    ): Promise<void> {
        const session = options?.session;
        const creds = providerCreds as FinopsProviderCredentials;

        const grantsTask = (async () => {
            try {
                if (!provider.collectCreditGrants) return;
                const grants = await provider.collectCreditGrants(creds, session);
                await this.upsertImportedGrants(organizationId, cloudAccountId, cloudProvider, grants);
            } catch (error) {
                this.logger.warn(
                    `[commitments] credit grant import failed for ${cloudAccountId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        })();

        const creditsTask = (async () => {
            try {
                const creditEntries =
                    options?.prefetchedCredits ??
                    (await provider.collectCreditConsumption(creds, periodStart, periodEnd, session, {
                        costEntriesFallback: options?.costEntriesFallback,
                    }));
                await this.upsertCreditConsumptions(organizationId, cloudAccountId, cloudProvider, creditEntries);
            } catch (error) {
                this.logger.warn(
                    `[commitments] credit sync failed for ${cloudAccountId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        })();

        const utilizationTask = (async () => {
            try {
                const utilization =
                    options?.prefetchedUtilization ??
                    (await provider.collectCommitmentUtilization(creds, lookbackDays, session));
                await this.upsertSnapshots(organizationId, cloudAccountId, cloudProvider, utilization);
            } catch (error) {
                this.logger.warn(
                    `[commitments] utilization sync failed for ${cloudAccountId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        })();

        const recommendationsTask = (async () => {
            try {
                const recommendations = await provider.collectCommitmentRecommendations(
                    creds,
                    lookbackDays,
                    session,
                );
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
        })();

        await Promise.all([grantsTask, creditsTask, utilizationTask, recommendationsTask]);
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

    /**
     * Heuristic resource candidates for Savings Plans / reservations:
     * 1) compute cost-by-resource with stable/recurring spend (adaptive to available history —
     *    AWS CE WithResources is often only ~14 days),
     * 2) inventory fallback for long-running EC2 / Azure VMs (years-old always-on machines).
     */
    async listCommitmentCandidates(
        organizationId: string,
        filter: CommitmentCandidateFilter = {},
    ): Promise<{ items: CommitmentCandidateItem[]; lookbackDays: number }> {
        const requestedLookback = Math.min(
            CANDIDATE_MAX_LOOKBACK_DAYS,
            Math.max(CANDIDATE_MIN_LOOKBACK_DAYS, filter.lookbackDays ?? CANDIDATE_DEFAULT_LOOKBACK_DAYS),
        );
        const limit = Math.min(CANDIDATE_MAX_LIMIT, Math.max(1, filter.limit ?? 25));
        const accountIds = await this.resolveAccountIds(organizationId, filter);
        if (accountIds.length === 0) {
            return { items: [], lookbackDays: requestedLookback };
        }

        const end = new Date();
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - requestedLookback);
        const startDate = start.toISOString().slice(0, 10);
        const endDate = end.toISOString().slice(0, 10);

        const serviceOrSql = COMMITMENT_CANDIDATE_SERVICE_PATTERNS.map(
            (_pattern, index) => `r.service ILIKE :svc${index}`,
        ).join(' OR ');
        const resourceIdSql =
            `(r.resourceId ILIKE 'i-%' OR r.resourceId ILIKE '%:instance/%' OR r.resourceId ILIKE '%:function:%' OR r.resourceId ILIKE '%/virtualMachines/%' OR r.resourceId ILIKE '%/instances/%')`;
        const serviceParams = Object.fromEntries(
            COMMITMENT_CANDIDATE_SERVICE_PATTERNS.map((pattern, index) => [`svc${index}`, pattern]),
        );

        interface RawDaily {
            cloudAccountId: string;
            cloudProvider: string;
            resourceId: string;
            service: string;
            region: string;
            day: string;
            dailyCost: string;
            currency: string;
        }

        const dailyQb = this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.cloudAccountId', 'cloudAccountId')
            .addSelect('r.cloudProvider', 'cloudProvider')
            .addSelect('r.resourceId', 'resourceId')
            .addSelect('r.service', 'service')
            .addSelect('MAX(r.region)', 'region')
            .addSelect('r.date', 'day')
            .addSelect('SUM(r.cost)', 'dailyCost')
            .addSelect('MAX(r.currency)', 'currency')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.granularity = :granularity', { granularity: 'daily' })
            .andWhere('r.date >= :startDate', { startDate })
            .andWhere('r.date <= :endDate', { endDate })
            .andWhere(`((${serviceOrSql}) OR ${resourceIdSql})`, serviceParams);
        andWhereResourceLevelCost(dailyQb, 'r');

        const dailyRows = await dailyQb
            .groupBy('r.cloudAccountId')
            .addGroupBy('r.cloudProvider')
            .addGroupBy('r.resourceId')
            .addGroupBy('r.service')
            .addGroupBy('r.date')
            .getRawMany<RawDaily>();

        type Agg = {
            cloudAccountId: string;
            cloudProvider: string;
            resourceId: string;
            service: string;
            region: string;
            currency: string;
            costs: number[];
            totalCost: number;
            firstDay: string;
            lastDay: string;
        };

        const byKey = new Map<string, Agg>();
        for (const row of dailyRows) {
            const resourceId = (row.resourceId ?? '').trim();
            if (!resourceId) continue;
            const dailyCost = Number(row.dailyCost);
            if (!Number.isFinite(dailyCost) || dailyCost <= 0) continue;
            const day = String(row.day).slice(0, 10);
            const key = `${row.cloudAccountId}::${row.service}::${resourceId}`;
            let agg = byKey.get(key);
            if (!agg) {
                agg = {
                    cloudAccountId: row.cloudAccountId,
                    cloudProvider: row.cloudProvider,
                    resourceId,
                    service: row.service,
                    region: row.region ?? '',
                    currency: row.currency || 'USD',
                    costs: [],
                    totalCost: 0,
                    firstDay: day,
                    lastDay: day,
                };
                byKey.set(key, agg);
            }
            agg.costs.push(dailyCost);
            agg.totalCost += dailyCost;
            if (!agg.region && row.region) agg.region = row.region;
            if (day < agg.firstDay) agg.firstDay = day;
            if (day > agg.lastDay) agg.lastDay = day;
        }

        // Adaptive window: AWS resource-level history is often ~14d, so don't require 45/90 active days.
        let dataSpanDays = 0;
        for (const agg of byKey.values()) {
            const span =
                Math.floor(
                    (Date.parse(`${agg.lastDay}T00:00:00Z`) - Date.parse(`${agg.firstDay}T00:00:00Z`)) /
                        (24 * 60 * 60 * 1000),
                ) + 1;
            if (span > dataSpanDays) dataSpanDays = span;
        }
        const effectiveLookback = Math.max(
            CANDIDATE_MIN_LOOKBACK_DAYS,
            Math.min(requestedLookback, dataSpanDays > 0 ? dataSpanDays : requestedLookback),
        );
        const minActiveDays = Math.max(5, Math.floor(effectiveLookback * 0.4));

        const ec2Ids = [...byKey.values()]
            .map((item) => item.resourceId)
            .filter((id) => /^i-[0-9a-f]+$/i.test(id) || /:instance\//i.test(id));
        const normalizedEc2Ids = [
            ...new Set(
                ec2Ids.map((id) => {
                    const match = id.match(/instance\/(i-[0-9a-f]+)/i);
                    return match?.[1] ?? id;
                }),
            ),
        ];
        const ec2Meta = new Map<string, { instanceType: string; launchTime: Date | null; state: string }>();
        if (normalizedEc2Ids.length > 0) {
            const instances = await this.ec2Repo
                .createQueryBuilder('ec2')
                .innerJoin('ec2.vpc', 'vpc')
                .where('vpc.cloudAccountId IN (:...accountIds)', { accountIds })
                .andWhere('ec2.awsInstanceId IN (:...ec2Ids)', { ec2Ids: normalizedEc2Ids })
                .getMany();

            for (const instance of instances) {
                ec2Meta.set(instance.awsInstanceId, {
                    instanceType: instance.instanceType,
                    launchTime: instance.launchTime,
                    state: instance.state,
                });
            }
        }

        const nowMs = Date.now();
        const candidatesByKey = new Map<string, CommitmentCandidateItem>();

        const pushCandidate = (item: CommitmentCandidateItem) => {
            const key = `${item.cloudAccountId}::${item.resourceId}`;
            const existing = candidatesByKey.get(key);
            if (!existing) {
                candidatesByKey.set(key, item);
                return;
            }
            // Prefer richer cost / age / type when merging cost + inventory hits.
            const preferIncomingCost =
                item.estimatedMonthlyCost > existing.estimatedMonthlyCost ||
                (item.costSource === 'resource' && existing.costSource !== 'resource');
            candidatesByKey.set(key, {
                ...existing,
                totalCost: Math.max(existing.totalCost, item.totalCost),
                estimatedMonthlyCost: preferIncomingCost
                    ? item.estimatedMonthlyCost
                    : existing.estimatedMonthlyCost,
                estimatedSpMonthlySavings: Math.max(
                    existing.estimatedSpMonthlySavings,
                    item.estimatedSpMonthlySavings,
                ),
                estimatedSpSavingsPercentage:
                    item.estimatedSpSavingsPercentage ?? existing.estimatedSpSavingsPercentage,
                costSource: preferIncomingCost ? item.costSource : existing.costSource,
                activeDays: Math.max(existing.activeDays, item.activeDays),
                stabilityScore: Math.max(existing.stabilityScore, item.stabilityScore),
                launchAgeDays:
                    existing.launchAgeDays == null
                        ? item.launchAgeDays
                        : item.launchAgeDays == null
                          ? existing.launchAgeDays
                          : Math.max(existing.launchAgeDays, item.launchAgeDays),
                instanceType: existing.instanceType || item.instanceType,
                reasonCodes: [...new Set([...existing.reasonCodes, ...item.reasonCodes])],
                region: existing.region || item.region,
                service: existing.service || item.service,
            });
        };

        const costByResourceKey = new Map<
            string,
            { totalCost: number; activeDays: number; currency: string; estimatedMonthlyCost: number }
        >();
        for (const agg of byKey.values()) {
            const bare =
                agg.resourceId.match(/instance\/(i-[0-9a-f]+)/i)?.[1] ??
                (/^i-[0-9a-f]+$/i.test(agg.resourceId) ? agg.resourceId : null);
            const estimatedMonthlyCost = (agg.totalCost / Math.max(agg.costs.length, 1)) * 30;
            const payload = {
                totalCost: agg.totalCost,
                activeDays: agg.costs.length,
                currency: agg.currency || 'USD',
                estimatedMonthlyCost,
            };
            costByResourceKey.set(`${agg.cloudAccountId}::${agg.resourceId}`.toLowerCase(), payload);
            if (bare) {
                costByResourceKey.set(`${agg.cloudAccountId}::${bare}`.toLowerCase(), payload);
            }
            // Azure ARM ids are long — also index by last segment.
            const tail = agg.resourceId.split('/').pop();
            if (tail && tail !== agg.resourceId) {
                costByResourceKey.set(`${agg.cloudAccountId}::${tail}`.toLowerCase(), payload);
            }
        }

        const resolveCost = (cloudAccountId: string, resourceId: string) => {
            const direct = costByResourceKey.get(`${cloudAccountId}::${resourceId}`.toLowerCase());
            if (direct) return direct;
            const bare =
                resourceId.match(/instance\/(i-[0-9a-f]+)/i)?.[1] ??
                (/^i-[0-9a-f]+$/i.test(resourceId) ? resourceId : null);
            if (bare) {
                const byBare = costByResourceKey.get(`${cloudAccountId}::${bare}`.toLowerCase());
                if (byBare) return byBare;
            }
            const tail = resourceId.split('/').pop();
            if (tail) {
                return costByResourceKey.get(`${cloudAccountId}::${tail}`.toLowerCase()) ?? null;
            }
            return null;
        };

        for (const agg of byKey.values()) {
            const activeDays = agg.costs.length;
            if (activeDays < minActiveDays) continue;

            const mean = agg.totalCost / activeDays;
            if (mean < 0.05) continue;

            const variance =
                agg.costs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(activeDays, 1);
            const stddev = Math.sqrt(variance);
            const cv = mean > 0 ? stddev / mean : Number.POSITIVE_INFINITY;
            // Keep loose CV: short windows + burstable instances vary a lot day-to-day.
            if (cv > 1.25 && activeDays >= 10) continue;

            const coverageRatio = activeDays / effectiveLookback;
            const stabilityScore = Math.max(
                0,
                Math.min(1, (1 - Math.min(cv, 1)) * 0.55 + Math.min(coverageRatio, 1) * 0.45),
            );
            const estimatedMonthlyCost = (agg.totalCost / Math.max(activeDays, 1)) * 30;

            const reasonCodes: CommitmentCandidateReason[] = ['compute_eligible'];
            if (cv <= 0.5) reasonCodes.push('stable_spend');
            if (coverageRatio >= 0.5 || activeDays >= minActiveDays) reasonCodes.push('consistent_usage');

            const bareInstanceId =
                agg.resourceId.match(/instance\/(i-[0-9a-f]+)/i)?.[1] ??
                (/^i-[0-9a-f]+$/i.test(agg.resourceId) ? agg.resourceId : null);
            const meta = bareInstanceId ? ec2Meta.get(bareInstanceId) : undefined;
            let instanceType: string | null = meta?.instanceType ?? null;
            let launchAgeDays: number | null = null;
            if (meta?.launchTime) {
                launchAgeDays = Math.floor((nowMs - meta.launchTime.getTime()) / (24 * 60 * 60 * 1000));
                if (launchAgeDays >= CANDIDATE_INVENTORY_MIN_AGE_DAYS) {
                    reasonCodes.push('long_running_instance');
                }
            }
            if (meta && meta.state !== 'running') {
                continue;
            }

            pushCandidate({
                cloudAccountId: agg.cloudAccountId,
                cloudProvider: agg.cloudProvider,
                resourceId: bareInstanceId ?? agg.resourceId,
                service: agg.service,
                region: agg.region,
                totalCost: Number(agg.totalCost.toFixed(4)),
                estimatedMonthlyCost: Number(estimatedMonthlyCost.toFixed(4)),
                estimatedSpMonthlySavings: 0,
                estimatedSpSavingsPercentage: null,
                costSource: 'resource',
                activeDays,
                lookbackDays: effectiveLookback,
                stabilityScore: Number(stabilityScore.toFixed(4)),
                reasonCodes,
                instanceType,
                launchAgeDays,
                currency: agg.currency || 'USD',
            });
        }

        // Inventory fallback: long-running always-on VMs even when resource-cost history is thin.
        const inventoryCutoff = new Date(nowMs - CANDIDATE_INVENTORY_MIN_AGE_DAYS * 24 * 60 * 60 * 1000);

        const accountProvider = new Map(
            (
                await this.cloudAccountRepo.find({
                    where: { id: In(accountIds) },
                    select: ['id', 'provider'],
                })
            ).map((account) => [account.id, account.provider]),
        );

        const longRunningEc2Rows = await this.ec2Repo
            .createQueryBuilder('ec2')
            .innerJoin('ec2.vpc', 'vpc')
            .select('ec2.awsInstanceId', 'awsInstanceId')
            .addSelect('ec2.instanceType', 'instanceType')
            .addSelect('ec2.launchTime', 'launchTime')
            .addSelect('ec2.availabilityZone', 'availabilityZone')
            .addSelect('vpc.cloudAccountId', 'cloudAccountId')
            .where('vpc.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('ec2.state = :state', { state: 'running' })
            .andWhere('ec2.launchTime IS NOT NULL')
            .andWhere('ec2.launchTime <= :inventoryCutoff', { inventoryCutoff })
            .orderBy('ec2.launchTime', 'ASC')
            .take(limit)
            .getRawMany<{
                awsInstanceId: string;
                instanceType: string;
                launchTime: Date;
                availabilityZone: string | null;
                cloudAccountId: string;
            }>();

        const azureVms = await this.azureVmRepo
            .createQueryBuilder('vm')
            .where('vm.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('(vm.provisioningState IS NULL OR vm.provisioningState NOT ILIKE :deallocated)', {
                deallocated: '%deallocat%',
            })
            .andWhere('vm.createdAt <= :inventoryCutoff', { inventoryCutoff })
            .orderBy('vm.createdAt', 'ASC')
            .take(limit)
            .getMany();

        // Extra cost lookup for inventory IDs that may not have matched the service filter.
        const missingCostIds = [
            ...longRunningEc2Rows
                .filter((row) => !resolveCost(row.cloudAccountId, row.awsInstanceId))
                .map((row) => row.awsInstanceId),
            ...azureVms
                .filter(
                    (vm) =>
                        !resolveCost(vm.cloudAccountId, vm.azureId) &&
                        !resolveCost(vm.cloudAccountId, vm.name),
                )
                .flatMap((vm) => [vm.azureId, vm.name].filter(Boolean)),
        ].filter(Boolean);

        if (missingCostIds.length > 0) {
            interface RawResourceCost {
                cloudAccountId: string;
                resourceId: string;
                totalCost: string;
                activeDays: string;
                currency: string;
            }
            const costQb = this.costRecordRepo
                .createQueryBuilder('r')
                .select('r.cloudAccountId', 'cloudAccountId')
                .addSelect('r.resourceId', 'resourceId')
                .addSelect('SUM(r.cost)', 'totalCost')
                .addSelect('COUNT(DISTINCT r.date)', 'activeDays')
                .addSelect('MAX(r.currency)', 'currency')
                .where('r.organizationId = :organizationId', { organizationId })
                .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
                .andWhere('r.granularity IN (:...granularities)', {
                    granularities: ['daily', 'monthly'],
                })
                .addSelect('r.granularity', 'granularity')
                .andWhere('r.date >= :startDate', { startDate })
                .andWhere('r.date <= :endDate', { endDate });
            andWhereResourceLevelCost(costQb, 'r');

            const likeParams: Record<string, string> = {};
            const likeSql = missingCostIds
                .slice(0, 80)
                .map((id, index) => {
                    likeParams[`rid${index}`] = `%${id}%`;
                    return `r.resourceId ILIKE :rid${index}`;
                })
                .join(' OR ');

            if (likeSql) {
                const extraRows = await costQb
                    .andWhere(`(${likeSql})`, likeParams)
                    .groupBy('r.cloudAccountId')
                    .addGroupBy('r.resourceId')
                    .addGroupBy('r.granularity')
                    .getRawMany<RawResourceCost & { granularity: string }>();

                for (const row of extraRows) {
                    const totalCost = Number(row.totalCost);
                    const activeDays = Number(row.activeDays);
                    if (!Number.isFinite(totalCost) || totalCost <= 0) continue;
                    const periods = Math.max(Number.isFinite(activeDays) ? activeDays : 1, 1);
                    const estimatedMonthlyCost =
                        row.granularity === 'monthly'
                            ? totalCost / periods
                            : (totalCost / periods) * 30;
                    const payload = {
                        totalCost,
                        activeDays: Number.isFinite(activeDays) ? activeDays : 0,
                        currency: row.currency || 'USD',
                        estimatedMonthlyCost,
                    };
                    const indexCost = (key: string) => {
                        const previous = costByResourceKey.get(key);
                        if (
                            !previous ||
                            payload.estimatedMonthlyCost >= previous.estimatedMonthlyCost
                        ) {
                            costByResourceKey.set(key, payload);
                        }
                    };
                    indexCost(`${row.cloudAccountId}::${row.resourceId}`.toLowerCase());
                    const bare =
                        row.resourceId.match(/instance\/(i-[0-9a-f]+)/i)?.[1] ??
                        (/^i-[0-9a-f]+$/i.test(row.resourceId) ? row.resourceId : null);
                    if (bare) {
                        indexCost(`${row.cloudAccountId}::${bare}`.toLowerCase());
                    }
                    const tail = row.resourceId.split('/').pop();
                    if (tail) {
                        indexCost(`${row.cloudAccountId}::${tail}`.toLowerCase());
                    }
                }
            }
        }

        for (const row of longRunningEc2Rows) {
            const launchAgeDays = Math.floor(
                (nowMs - new Date(row.launchTime).getTime()) / (24 * 60 * 60 * 1000),
            );
            const cost = resolveCost(row.cloudAccountId, row.awsInstanceId);
            pushCandidate({
                cloudAccountId: row.cloudAccountId,
                cloudProvider: accountProvider.get(row.cloudAccountId) ?? 'aws',
                resourceId: row.awsInstanceId,
                service: 'Amazon Elastic Compute Cloud - Compute',
                region: row.availabilityZone?.replace(/[a-z]$/, '') ?? '',
                totalCost: cost ? Number(cost.totalCost.toFixed(4)) : 0,
                estimatedMonthlyCost: cost ? Number(cost.estimatedMonthlyCost.toFixed(4)) : 0,
                estimatedSpMonthlySavings: 0,
                estimatedSpSavingsPercentage: null,
                costSource: cost ? 'resource' : 'none',
                activeDays: cost?.activeDays ?? 0,
                lookbackDays: effectiveLookback,
                stabilityScore: cost
                    ? Math.max(0.55, Math.min(1, cost.activeDays / effectiveLookback))
                    : 0.55,
                reasonCodes: ['compute_eligible', 'long_running_instance'],
                instanceType: row.instanceType,
                launchAgeDays,
                currency: cost?.currency ?? 'USD',
            });
        }

        for (const vm of azureVms) {
            const launchAgeDays = Math.floor((nowMs - vm.createdAt.getTime()) / (24 * 60 * 60 * 1000));
            const cost =
                resolveCost(vm.cloudAccountId, vm.azureId) ?? resolveCost(vm.cloudAccountId, vm.name);
            pushCandidate({
                cloudAccountId: vm.cloudAccountId,
                cloudProvider: accountProvider.get(vm.cloudAccountId) ?? 'azure',
                resourceId: vm.azureId || vm.name,
                service: 'Virtual Machines',
                region: vm.location ?? '',
                totalCost: cost ? Number(cost.totalCost.toFixed(4)) : 0,
                estimatedMonthlyCost: cost ? Number(cost.estimatedMonthlyCost.toFixed(4)) : 0,
                estimatedSpMonthlySavings: 0,
                estimatedSpSavingsPercentage: null,
                costSource: cost ? 'resource' : 'none',
                activeDays: cost?.activeDays ?? 0,
                lookbackDays: effectiveLookback,
                stabilityScore: cost
                    ? Math.max(0.5, Math.min(1, cost.activeDays / effectiveLookback))
                    : 0.5,
                reasonCodes: ['compute_eligible', 'long_running_instance'],
                instanceType: vm.vmSize,
                launchAgeDays,
                currency: cost?.currency ?? 'USD',
            });
        }

        // Service-level compute spend → apportion across candidates still missing resource cost.
        const serviceSpendQb = this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.cloudAccountId', 'cloudAccountId')
            .addSelect('SUM(r.cost)', 'totalCost')
            .addSelect('MAX(r.currency)', 'currency')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.granularity = :granularity', { granularity: 'daily' })
            .andWhere('r.date >= :startDate', { startDate })
            .andWhere('r.date <= :endDate', { endDate })
            .andWhere(`(${serviceOrSql})`, serviceParams);
        andWhereServiceLevelCost(serviceSpendQb, 'r');

        const serviceSpendRows = await serviceSpendQb
            .groupBy('r.cloudAccountId')
            .getRawMany<{ cloudAccountId: string; totalCost: string; currency: string }>();

        const serviceMonthlyByAccount = new Map<string, { monthly: number; currency: string }>();
        for (const row of serviceSpendRows) {
            const total = Number(row.totalCost);
            if (!Number.isFinite(total) || total <= 0) continue;
            serviceMonthlyByAccount.set(row.cloudAccountId, {
                monthly: (total / Math.max(effectiveLookback, 1)) * 30,
                currency: row.currency || 'USD',
            });
        }

        const zeroCostByAccount = new Map<string, number>();
        for (const item of candidatesByKey.values()) {
            if (item.estimatedMonthlyCost > 0) continue;
            zeroCostByAccount.set(
                item.cloudAccountId,
                (zeroCostByAccount.get(item.cloudAccountId) ?? 0) + 1,
            );
        }

        for (const [accountId, count] of zeroCostByAccount) {
            const spend = serviceMonthlyByAccount.get(accountId);
            if (!spend || count <= 0) continue;
            const perVm = spend.monthly / count;
            if (perVm <= 0) continue;
            for (const [key, item] of candidatesByKey) {
                if (item.cloudAccountId !== accountId || item.estimatedMonthlyCost > 0) continue;
                candidatesByKey.set(key, {
                    ...item,
                    estimatedMonthlyCost: Number(perVm.toFixed(4)),
                    totalCost: Number((perVm * (effectiveLookback / 30)).toFixed(4)),
                    costSource: 'service_apportioned',
                    currency: item.currency || spend.currency,
                });
            }
        }

        // SP savings % from eligible purchase recommendations (fallback 28%).
        const spRecs = await this.recommendationRepo.find({
            where: {
                organizationId,
                cloudAccountId: In(accountIds),
                commitmentType: 'savings_plan',
                eligible: true,
            },
            order: { estimatedMonthlySavings: 'DESC' },
        });
        const spRateByAccount = new Map<string, number>();
        for (const rec of spRecs) {
            if (spRateByAccount.has(rec.cloudAccountId)) continue;
            const pct =
                rec.estimatedSavingsPercentage != null
                    ? Number(rec.estimatedSavingsPercentage)
                    : null;
            if (pct != null && Number.isFinite(pct) && pct > 0) {
                spRateByAccount.set(rec.cloudAccountId, Math.min(pct / 100, 0.7));
            } else {
                spRateByAccount.set(rec.cloudAccountId, DEFAULT_COMPUTE_SP_SAVINGS_RATE);
            }
        }

        for (const [key, item] of candidatesByKey) {
            const rate = spRateByAccount.get(item.cloudAccountId) ?? DEFAULT_COMPUTE_SP_SAVINGS_RATE;
            const estimatedSpMonthlySavings =
                item.estimatedMonthlyCost > 0
                    ? Number((item.estimatedMonthlyCost * rate).toFixed(4))
                    : 0;
            candidatesByKey.set(key, {
                ...item,
                estimatedSpMonthlySavings,
                estimatedSpSavingsPercentage: Number((rate * 100).toFixed(1)),
            });
        }

        const candidates = [...candidatesByKey.values()].sort((a, b) => {
            const scoreA =
                Math.max(a.estimatedSpMonthlySavings, a.estimatedMonthlyCost * 0.2) +
                (a.launchAgeDays ?? 0) * 0.01;
            const scoreB =
                Math.max(b.estimatedSpMonthlySavings, b.estimatedMonthlyCost * 0.2) +
                (b.launchAgeDays ?? 0) * 0.01;
            if (Math.abs(scoreB - scoreA) > 0.01) return scoreB - scoreA;
            return b.estimatedMonthlyCost - a.estimatedMonthlyCost;
        });

        return { items: candidates.slice(0, limit), lookbackDays: effectiveLookback };
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
