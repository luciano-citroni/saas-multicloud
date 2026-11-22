import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CloudAccount, CloudProvider } from '../../db/entites/cloud-account.entity';
import { FinopsConsent } from '../../db/entites/finops-consent.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import { FinopsRecommendation } from '../../db/entites/finops-recommendation.entity';
import { FinopsCommitmentRecommendation } from '../../db/entites/finops-commitment-recommendation.entity';
import { FinopsCostSyncRun } from '../../db/entites/finops-cost-sync-run.entity';
import type { CostByServiceItem } from './finops-analysis.service';
import { FinopsForecastService } from './finops-forecast.service';
import { resolveFinopsPeriod, type ResolvedFinopsPeriod } from '../utils/resolve-finops-period';
import { andWhereServiceLevelCost } from '../utils/service-level-cost';

export type OrgOverviewAccountRollup = {
    id: string;
    alias: string;
    provider: string;
    totalCost: number;
    openAnomalies: number;
    openRecs: number;
    hasConsent: boolean;
    lastSyncAt: string | null;
};

export type OrgCostTrendPoint = {
    date: string;
    cost: number;
    currency: string;
};

export type OrgOverviewAnomaly = {
    id: string;
    cloudAccountId: string;
    cloudProvider: string;
    service: string;
    region: string;
    anomalyDate: string;
    expectedCost: number;
    actualCost: number;
    deviationPercentage: number;
    financialImpact: number;
    severity: string;
    status: string;
    currency: string;
    description: string | null;
    createdAt: string;
};

export type OrgOverviewRecommendation = {
    id: string;
    cloudAccountId: string;
    type: string;
    resourceType: string;
    resourceId: string;
    description: string;
    recommendation: string;
    potentialSaving: number | null;
    currency: string;
    priority: string;
    status: string;
    cloudProvider: string;
    createdAt: string;
    kind?: 'waste' | 'reservation';
    commitmentType?: string | null;
    term?: string | null;
    paymentOption?: string | null;
    lookbackDays?: number | null;
    eligible?: boolean;
    ineligibleReason?: string | null;
};

export type OrgFinopsDataCoverage = {
    /** Primeira data com custo sincronizado nas contas do escopo (qualquer período). */
    availableStart: string | null;
    /** Última data com custo sincronizado nas contas do escopo. */
    availableEnd: string | null;
    requestedStart: string;
    requestedEnd: string;
    /** true quando o intervalo filtrado não está totalmente coberto pelos dados sincronizados. */
    incomplete: boolean;
    /** true quando o início do filtro é anterior ao primeiro custo disponível. */
    missingBefore: boolean;
    /** true quando o fim do filtro é posterior ao último custo disponível (com folga de 1 dia). */
    missingAfter: boolean;
};

export type OrgFinopsOverview = {
    period: ResolvedFinopsPeriod;
    totals: {
        cost: number;
        currency: string;
        momGrowth: number;
        forecastedCost: number | null;
        potentialSavings: number;
    };
    costByService: CostByServiceItem[];
    costTrend: OrgCostTrendPoint[];
    anomalies: OrgOverviewAnomaly[];
    recommendations: OrgOverviewRecommendation[];
    accounts: OrgOverviewAccountRollup[];
    dataCoverage: OrgFinopsDataCoverage;
};

export type OrgOptimizeItem = {
    kind: 'anomaly' | 'recommendation';
    id: string;
    cloudAccountId: string;
    cloudProvider: string;
    title: string;
    description: string;
    impact: number;
    currency: string;
    severityOrPriority: string;
    status: string;
    service?: string;
    resourceId?: string;
    createdAt: string;
};

export type OrgAnomaliesListResult = {
    items: OrgOverviewAnomaly[];
    pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    totals: {
        open: number;
        acknowledged: number;
        resolved: number;
        critical: number;
        high: number;
    };
};

export type OrgSavingsListResult = {
    items: OrgOverviewRecommendation[];
    pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    totals: {
        potentialSavings: number;
        currency: string;
        open: number;
        high: number;
        medium: number;
        low: number;
    };
};

export type OrgFinopsOptimize = {
    items: OrgOptimizeItem[];
    totals: {
        openAnomalies: number;
        openRecommendations: number;
        potentialSavings: number;
        currency: string;
    };
};

@Injectable()
export class FinopsOrgOverviewService {
    private readonly logger = new Logger(FinopsOrgOverviewService.name);

    constructor(
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,

        @InjectRepository(FinopsConsent)
        private readonly consentRepo: Repository<FinopsConsent>,

        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(FinopsCostAnomaly)
        private readonly anomalyRepo: Repository<FinopsCostAnomaly>,

        @InjectRepository(FinopsRecommendation)
        private readonly recommendationRepo: Repository<FinopsRecommendation>,

        @InjectRepository(FinopsCommitmentRecommendation)
        private readonly commitmentRecommendationRepo: Repository<FinopsCommitmentRecommendation>,

        @InjectRepository(FinopsCostSyncRun)
        private readonly syncRunRepo: Repository<FinopsCostSyncRun>,

        private readonly forecastService: FinopsForecastService
    ) {}

    async getOverview(
        organizationId: string,
        query: {
            period?: string;
            year?: string;
            month?: string;
            anomalyDays?: string;
            cloudAccountId?: string;
            cloudAccountIds?: string;
        }
    ): Promise<OrgFinopsOverview> {
        const resolved = resolveFinopsPeriod({
            period: query.period,
            year: query.year,
            month: query.month,
        });

        if (query.anomalyDays) {
            const parsed = parseInt(query.anomalyDays, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                resolved.anomalyDays = parsed;
            }
        }

        const scopedIds = (query.cloudAccountIds ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
        const accounts = await this.listFinopsAccounts(
            organizationId,
            query.cloudAccountId,
            scopedIds.length > 0 ? scopedIds : undefined,
        );
        const accountIds = accounts.map((a) => a.id);
        const supportedAccounts = accounts.filter((a) => this.isFinopsSupportedProvider(a.provider));
        const supportedIds = supportedAccounts.map((a) => a.id);

        if (accountIds.length === 0) {
            return this.emptyOverview(resolved);
        }

        const emptyMetrics = supportedIds.length === 0;

        const [
            costByService,
            costTrend,
            momGrowth,
            forecasts,
            anomalies,
            recommendations,
            consents,
            accountCosts,
            lastSyncByAccount,
            availableRange,
        ] = await Promise.all([
            emptyMetrics
                ? Promise.resolve([] as Awaited<ReturnType<FinopsOrgOverviewService['getOrgCostByService']>>)
                : this.getOrgCostByService(organizationId, supportedIds, resolved.startDate, resolved.endDate),
            emptyMetrics
                ? Promise.resolve([] as Awaited<ReturnType<FinopsOrgOverviewService['getOrgCostTrend']>>)
                : this.getOrgCostTrend(organizationId, supportedIds, resolved.startDate, resolved.endDate),
            emptyMetrics
                ? Promise.resolve(0)
                : this.getOrgPeriodGrowth(organizationId, supportedIds, resolved.startDate, resolved.endDate),
            emptyMetrics
                ? Promise.resolve([] as Array<Awaited<ReturnType<FinopsForecastService['forecastCurrentMonth']>> | null>)
                : Promise.all(supportedAccounts.map((a) => this.forecastService.forecastCurrentMonth(organizationId, a.id).catch(() => null))),
            emptyMetrics
                ? Promise.resolve([] as Awaited<ReturnType<FinopsOrgOverviewService['listOrgAnomalies']>>)
                : this.listOrgAnomalies(organizationId, supportedIds, 'open', resolved.anomalyDays, 20),
            emptyMetrics
                ? Promise.resolve([] as Awaited<ReturnType<FinopsOrgOverviewService['listOrgRecommendations']>>)
                : this.listOrgRecommendations(organizationId, supportedIds, 'open', 20),
            emptyMetrics
                ? Promise.resolve([])
                : this.consentRepo.find({
                      where: { organizationId, cloudAccountId: In(supportedIds), accepted: true },
                  }),
            emptyMetrics
                ? Promise.resolve(new Map<string, number>())
                : this.getAccountCosts(organizationId, supportedIds, resolved.startDate, resolved.endDate),
            accountIds.length === 0
                ? Promise.resolve(new Map<string, string>())
                : this.getLastSyncByAccount(organizationId, accountIds),
            emptyMetrics
                ? Promise.resolve({ availableStart: null, availableEnd: null })
                : this.getAvailableCostRange(organizationId, supportedIds),
        ]);

        const consentSet = new Set(consents.map((c) => c.cloudAccountId));
        const totalCost = costByService.reduce((sum, item) => sum + Number(item.currentMonthCost), 0);
        const currency = costByService[0]?.currency ?? costTrend[0]?.currency ?? 'USD';

        const forecastedCost = forecasts.reduce((sum, f) => sum + Number(f?.forecastedCost ?? 0), 0);
        const potentialSavings = recommendations
            .filter((r) => r.potentialSaving != null)
            .reduce((sum, r) => sum + Number(r.potentialSaving), 0);

        const anomalyCountByAccount = new Map<string, number>();
        for (const a of anomalies) {
            anomalyCountByAccount.set(a.cloudAccountId, (anomalyCountByAccount.get(a.cloudAccountId) ?? 0) + 1);
        }

        const recCountByAccount = new Map<string, number>();
        for (const r of recommendations) {
            recCountByAccount.set(r.cloudAccountId, (recCountByAccount.get(r.cloudAccountId) ?? 0) + 1);
        }

        const accountRollups: OrgOverviewAccountRollup[] = accounts.map((account) => ({
            id: account.id,
            alias: account.alias,
            provider: account.provider,
            totalCost: accountCosts.get(account.id) ?? 0,
            openAnomalies: anomalyCountByAccount.get(account.id) ?? 0,
            openRecs: recCountByAccount.get(account.id) ?? 0,
            hasConsent: consentSet.has(account.id),
            lastSyncAt: lastSyncByAccount.get(account.id) ?? null,
        }));

        const dataCoverage = this.buildDataCoverage(
            resolved.startDate,
            resolved.endDate,
            availableRange.availableStart,
            availableRange.availableEnd,
        );

        this.logger.log(
            `[Overview] org=${organizationId} accounts=${accountIds.length} cost=${totalCost.toFixed(2)} period=${resolved.period} coverage=${dataCoverage.availableStart ?? 'none'}→${dataCoverage.availableEnd ?? 'none'} incomplete=${dataCoverage.incomplete}`
        );

        return {
            period: resolved,
            totals: {
                cost: totalCost,
                currency,
                momGrowth,
                forecastedCost: forecastedCost > 0 ? forecastedCost : null,
                potentialSavings,
            },
            costByService,
            costTrend,
            anomalies: anomalies.map((a) => this.mapAnomaly(a)),
            recommendations: recommendations.map((r) => this.mapRecommendation(r)),
            accounts: accountRollups,
            dataCoverage,
        };
    }

    async getOptimize(
        organizationId: string,
        query: { status?: string; days?: string; cloudAccountId?: string; page?: string; limit?: string }
    ): Promise<OrgFinopsOptimize> {
        const status = (query.status === 'acknowledged' || query.status === 'resolved' || query.status === 'open'
            ? query.status
            : 'open') as 'open' | 'acknowledged' | 'resolved';
        const days = query.days ? parseInt(query.days, 10) : 90;
        const page = Math.max(1, query.page ? parseInt(query.page, 10) : 1);
        const limit = Math.min(100, Math.max(1, query.limit ? parseInt(query.limit, 10) : 50));

        const accounts = await this.listFinopsAccounts(organizationId, query.cloudAccountId);
        const supportedIds = accounts.filter((a) => this.isFinopsSupportedProvider(a.provider)).map((a) => a.id);

        if (supportedIds.length === 0) {
            return {
                items: [],
                totals: { openAnomalies: 0, openRecommendations: 0, potentialSavings: 0, currency: 'USD' },
            };
        }

        const recStatus = status === 'open' ? 'open' : status === 'resolved' ? 'resolved' : 'dismissed';
        // Na fila de otimização (status=open), mantém anomalias reconhecidas visíveis.
        const anomalyStatuses: Array<'open' | 'acknowledged' | 'resolved'> =
            status === 'open' ? ['open', 'acknowledged'] : [status];

        const [anomalies, recommendations] = await Promise.all([
            this.listOrgAnomalies(organizationId, supportedIds, anomalyStatuses, Number.isFinite(days) ? days : 90),
            this.listOrgRecommendations(organizationId, supportedIds, recStatus === 'dismissed' ? 'dismissed' : recStatus),
        ]);

        const anomalyItems: OrgOptimizeItem[] = anomalies.map((a) => ({
            kind: 'anomaly' as const,
            id: a.id,
            cloudAccountId: a.cloudAccountId,
            cloudProvider: a.cloudProvider,
            title: `Anomalia em ${a.service}`,
            description: a.description ?? `${a.service} — desvio de ${Number(a.deviationPercentage).toFixed(0)}%`,
            impact: Number(a.financialImpact),
            currency: a.currency,
            severityOrPriority: a.severity,
            status: a.status,
            service: a.service,
            createdAt: a.createdAt.toISOString(),
        }));

        const recItems: OrgOptimizeItem[] = recommendations.map((r) => ({
            kind: 'recommendation' as const,
            id: r.id,
            cloudAccountId: r.cloudAccountId,
            cloudProvider: r.cloudProvider,
            title: r.description,
            description: r.recommendation,
            impact: Number(r.potentialSaving ?? 0),
            currency: r.currency,
            severityOrPriority: r.priority,
            status: r.status,
            resourceId: r.resourceId,
            createdAt: r.createdAt.toISOString(),
        }));

        const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        const statusRank: Record<string, number> = { open: 2, acknowledged: 1, resolved: 0, dismissed: 0 };
        const items = [...anomalyItems, ...recItems].sort((left, right) => {
            const statusDiff = (statusRank[right.status] ?? 0) - (statusRank[left.status] ?? 0);
            if (statusDiff !== 0) return statusDiff;
            const rankDiff = (severityRank[right.severityOrPriority] ?? 0) - (severityRank[left.severityOrPriority] ?? 0);
            if (rankDiff !== 0) return rankDiff;
            return right.impact - left.impact;
        });

        const offset = (page - 1) * limit;
        const pageItems = items.slice(offset, offset + limit);

        const potentialSavings = recommendations
            .filter((r) => r.status === 'open' && r.potentialSaving != null)
            .reduce((sum, r) => sum + Number(r.potentialSaving), 0);

        return {
            items: pageItems,
            totals: {
                openAnomalies: anomalies.filter((a) => a.status === 'open').length,
                openRecommendations: recommendations.filter((r) => r.status === 'open').length,
                potentialSavings,
                currency: recommendations[0]?.currency ?? anomalies[0]?.currency ?? 'USD',
            },
        };
    }

    private async listFinopsAccounts(
        organizationId: string,
        cloudAccountId?: string,
        cloudAccountIds?: string[],
    ): Promise<CloudAccount[]> {
        // Todas as contas do tenant (mesmo universo da sidebar / cloud-accounts).
        // tenant_id é a chave principal; organization_id cobre registros legados.
        const qb = this.cloudAccountRepo
            .createQueryBuilder('ca')
            .where('(ca.tenantId = :organizationId OR ca.organizationId = :organizationId)', { organizationId })
            .orderBy('ca.alias', 'ASC');

        if (cloudAccountIds && cloudAccountIds.length > 0) {
            qb.andWhere('ca.id IN (:...cloudAccountIds)', { cloudAccountIds });
        } else if (cloudAccountId) {
            qb.andWhere('ca.id = :cloudAccountId', { cloudAccountId });
        }

        return qb.getMany();
    }

    /** Último sync FinOps concluído por conta (completed_at ou created_at). */
    private async getLastSyncByAccount(
        organizationId: string,
        accountIds: string[],
    ): Promise<Map<string, string>> {
        if (accountIds.length === 0) return new Map();

        const rows = await this.syncRunRepo
            .createQueryBuilder('s')
            .select('s.cloudAccountId', 'cloudAccountId')
            .addSelect('MAX(COALESCE(s.completedAt, s.createdAt))', 'lastSyncAt')
            .where('s.organizationId = :organizationId', { organizationId })
            .andWhere('s.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('s.status IN (:...statuses)', { statuses: ['completed', 'partial'] })
            .groupBy('s.cloudAccountId')
            .getRawMany<{ cloudAccountId: string; lastSyncAt: Date | string }>();

        const map = new Map<string, string>();
        for (const row of rows) {
            if (!row.lastSyncAt) continue;
            const iso =
                row.lastSyncAt instanceof Date
                    ? row.lastSyncAt.toISOString()
                    : new Date(row.lastSyncAt).toISOString();
            if (!Number.isNaN(Date.parse(iso))) {
                map.set(row.cloudAccountId, iso);
            }
        }
        return map;
    }

    private isFinopsSupportedProvider(provider: string): boolean {
        return provider === CloudProvider.AWS || provider === CloudProvider.AZURE || provider === CloudProvider.GCP;
    }

    private async getOrgCostByService(
        organizationId: string,
        accountIds: string[],
        startDate: string,
        endDate: string,
    ): Promise<CostByServiceItem[]> {
        const exclusiveEnd = this.addOneDay(endDate);
        const previous = this.equalLengthPreviousPeriod(startDate, endDate);

        const [currentMap, previousMap] = await Promise.all([
            this.sumCostByService(organizationId, accountIds, startDate, exclusiveEnd),
            this.sumCostByService(organizationId, accountIds, previous.start, previous.exclusiveEnd),
        ]);

        const services = Array.from(new Set([...currentMap.keys(), ...previousMap.keys()]));
        const items: CostByServiceItem[] = services.map((service) => {
            const current = currentMap.get(service);
            const previousRow = previousMap.get(service);
            const currentMonthCost = current?.cost ?? 0;
            const previousMonthCost = previousRow?.cost ?? 0;
            const change = currentMonthCost - previousMonthCost;
            const changePercentage =
                previousMonthCost > 0 ? (change / previousMonthCost) * 100 : currentMonthCost > 0 ? 100 : 0;
            const trend: 'up' | 'down' | 'stable' =
                Math.abs(changePercentage) < 5 ? 'stable' : change > 0 ? 'up' : 'down';

            return {
                service,
                currentMonthCost,
                previousMonthCost,
                change,
                changePercentage,
                trend,
                currency: current?.currency ?? previousRow?.currency ?? 'USD',
            };
        });

        return items.sort((left, right) => {
            if (right.currentMonthCost !== left.currentMonthCost) {
                return right.currentMonthCost - left.currentMonthCost;
            }
            return right.previousMonthCost - left.previousMonthCost;
        });
    }

    private async getOrgCostTrend(
        organizationId: string,
        accountIds: string[],
        startDate: string,
        endDate: string
    ): Promise<OrgCostTrendPoint[]> {
        const exclusiveEnd = this.addOneDay(endDate);

        const dailyQb = this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.date', 'date')
            .addSelect('SUM(r.cost)', 'cost')
            .addSelect('MIN(r.currency)', 'currency')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.granularity = :granularity', { granularity: 'daily' })
            .andWhere('r.date >= :startDate', { startDate })
            .andWhere('r.date < :endDate', { endDate: exclusiveEnd });
        andWhereServiceLevelCost(dailyQb, 'r');

        const rows = await dailyQb
            .groupBy('r.date')
            .orderBy('r.date', 'ASC')
            .getRawMany<{ date: string | Date; cost: string; currency: string }>();

        if (rows.length > 0) {
            return rows.map((row) => ({
                date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
                cost: Number(row.cost),
                currency: row.currency ?? 'USD',
            }));
        }

        // Fallback: monthly granularity when daily is empty
        const monthlyQb = this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.date', 'date')
            .addSelect('SUM(r.cost)', 'cost')
            .addSelect('MIN(r.currency)', 'currency')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.granularity = :granularity', { granularity: 'monthly' })
            .andWhere('r.date >= :startDate', { startDate })
            .andWhere('r.date < :endDate', { endDate: exclusiveEnd });
        andWhereServiceLevelCost(monthlyQb, 'r');

        const monthlyRows = await monthlyQb
            .groupBy('r.date')
            .orderBy('r.date', 'ASC')
            .getRawMany<{ date: string | Date; cost: string; currency: string }>();

        return monthlyRows.map((row) => ({
            date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
            cost: Number(row.cost),
            currency: row.currency ?? 'USD',
        }));
    }

    /** Crescimento do período atual vs janela anterior de mesma duração. */
    private async getOrgPeriodGrowth(
        organizationId: string,
        accountIds: string[],
        startDate: string,
        endDate: string,
    ): Promise<number> {
        const exclusiveEnd = this.addOneDay(endDate);
        const previous = this.equalLengthPreviousPeriod(startDate, endDate);

        const [current, previousTotal] = await Promise.all([
            this.sumCost(organizationId, accountIds, startDate, exclusiveEnd),
            this.sumCost(organizationId, accountIds, previous.start, previous.exclusiveEnd),
        ]);

        if (previousTotal <= 0) return current > 0 ? 100 : 0;
        return ((current - previousTotal) / previousTotal) * 100;
    }

    private async sumCost(organizationId: string, accountIds: string[], from: string, to: string): Promise<number> {
        const sumByGranularity = async (granularity: 'daily' | 'monthly'): Promise<number> => {
            const qb = this.costRecordRepo
                .createQueryBuilder('r')
                .select('SUM(r.cost)', 'total')
                .where('r.organizationId = :organizationId', { organizationId })
                .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
                .andWhere('r.date >= :from', { from })
                .andWhere('r.date < :to', { to })
                .andWhere('r.granularity = :granularity', { granularity });
            andWhereServiceLevelCost(qb, 'r');
            const result = await qb.getRawOne<{ total: string }>();
            return Number(result?.total ?? 0);
        };

        const [daily, monthly] = await Promise.all([sumByGranularity('daily'), sumByGranularity('monthly')]);
        return Math.abs(daily) >= Math.abs(monthly) ? daily : monthly;
    }

    private async getAccountCosts(
        organizationId: string,
        accountIds: string[],
        startDate: string,
        endDate: string,
    ): Promise<Map<string, number>> {
        const exclusiveEnd = this.addOneDay(endDate);

        const loadByGranularity = async (granularity: 'daily' | 'monthly') => {
            const qb = this.costRecordRepo
                .createQueryBuilder('r')
                .select('r.cloudAccountId', 'cloudAccountId')
                .addSelect('SUM(r.cost)', 'total')
                .where('r.organizationId = :organizationId', { organizationId })
                .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
                .andWhere('r.date >= :start', { start: startDate })
                .andWhere('r.date < :end', { end: exclusiveEnd })
                .andWhere('r.granularity = :granularity', { granularity });
            andWhereServiceLevelCost(qb, 'r');
            return qb.groupBy('r.cloudAccountId').getRawMany<{ cloudAccountId: string; total: string }>();
        };

        const [dailyRows, monthlyRows] = await Promise.all([loadByGranularity('daily'), loadByGranularity('monthly')]);

        const map = new Map<string, number>();
        for (const row of dailyRows) {
            map.set(row.cloudAccountId, Number(row.total));
        }
        for (const row of monthlyRows) {
            const monthlyTotal = Number(row.total);
            const dailyTotal = map.get(row.cloudAccountId);
            if (dailyTotal == null || Math.abs(monthlyTotal) > Math.abs(dailyTotal)) {
                map.set(row.cloudAccountId, monthlyTotal);
            }
        }

        return map;
    }

    private async sumCostByService(
        organizationId: string,
        accountIds: string[],
        from: string,
        to: string,
    ): Promise<Map<string, { cost: number; currency: string }>> {
        const loadByGranularity = async (granularity: 'daily' | 'monthly') => {
            const qb = this.costRecordRepo
                .createQueryBuilder('r')
                .select('r.service', 'service')
                .addSelect('SUM(r.cost)', 'totalCost')
                .addSelect('MAX(r.currency)', 'currency')
                .where('r.organizationId = :organizationId', { organizationId })
                .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
                .andWhere('r.date >= :from', { from })
                .andWhere('r.date < :to', { to })
                .andWhere('r.granularity = :granularity', { granularity });
            andWhereServiceLevelCost(qb, 'r');
            return qb.groupBy('r.service').getRawMany<{ service: string; totalCost: string; currency: string }>();
        };

        const [dailyRows, monthlyRows] = await Promise.all([loadByGranularity('daily'), loadByGranularity('monthly')]);
        const dailyTotal = dailyRows.reduce((sum, row) => sum + Number(row.totalCost), 0);
        const monthlyTotal = monthlyRows.reduce((sum, row) => sum + Number(row.totalCost), 0);
        const rows = Math.abs(dailyTotal) >= Math.abs(monthlyTotal) ? dailyRows : monthlyRows;

        const map = new Map<string, { cost: number; currency: string }>();
        for (const row of rows) {
            map.set(row.service, {
                cost: Number(row.totalCost),
                currency: row.currency ?? 'USD',
            });
        }
        return map;
    }

    /** Janela imediatamente anterior com a mesma quantidade de dias (inclusive). */
    private equalLengthPreviousPeriod(
        startDate: string,
        endDate: string,
    ): { start: string; exclusiveEnd: string } {
        const start = new Date(`${startDate}T00:00:00Z`);
        const end = new Date(`${endDate}T00:00:00Z`);
        const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
        const prevEnd = new Date(start);
        prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
        return {
            start: prevStart.toISOString().slice(0, 10),
            exclusiveEnd: startDate,
        };
    }

    /**
     * Lista paginada de anomalias da organização com filtros (página dedicada).
     */
    async getAnomaliesList(
        organizationId: string,
        options: {
            status?: string;
            severity?: string;
            days?: string;
            period?: string;
            cloudAccountId?: string;
            /** IDs da mid-org / filtro da sidebar — delimita o universo de contas. */
            cloudAccountIds?: string;
            provider?: string;
            sort?: string;
            page?: string;
            limit?: string;
        } = {},
    ): Promise<OrgAnomaliesListResult> {
        const page = Math.max(1, Number(options.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
        const { since, until } = this.resolveAnomalyDateRange(options.period, options.days);
        const severityFilter = (options.severity ?? 'all').trim().toLowerCase();
        const sortKey = (options.sort ?? 'severity').trim().toLowerCase();

        let accounts = await this.listFinopsAccounts(organizationId, options.cloudAccountId || undefined);
        const scopedIds = (options.cloudAccountIds ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
        if (scopedIds.length > 0 && !options.cloudAccountId) {
            const allowed = new Set(scopedIds);
            accounts = accounts.filter((a) => allowed.has(a.id));
        }
        const supported = accounts.filter((a) => {
            const provider = a.provider?.toLowerCase();
            if (provider !== 'aws' && provider !== 'azure' && provider !== 'gcp') return false;
            if (options.provider && provider !== options.provider.toLowerCase()) return false;
            return true;
        });
        const accountIds = supported.map((a) => a.id);

        const emptyPagination = {
            page,
            limit,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
        };

        if (accountIds.length === 0) {
            return {
                items: [],
                pagination: emptyPagination,
                totals: { open: 0, acknowledged: 0, resolved: 0, critical: 0, high: 0 },
            };
        }

        const baseQb = () => {
            const qb = this.anomalyRepo
                .createQueryBuilder('a')
                .where('a.organizationId = :organizationId', { organizationId })
                .andWhere('a.cloudAccountId IN (:...accountIds)', { accountIds })
                .andWhere('a.anomalyDate >= :since', { since });

            if (until) {
                qb.andWhere('a.anomalyDate <= :until', { until });
            }

            if (options.status && options.status !== 'all') {
                qb.andWhere('a.status = :status', { status: options.status });
            }
            if (severityFilter && severityFilter !== 'all') {
                qb.andWhere('LOWER(a.severity) = :severity', { severity: severityFilter });
            }
            if (options.provider) {
                qb.andWhere('LOWER(a.cloudProvider) = :provider', {
                    provider: options.provider.toLowerCase(),
                });
            }
            return qb;
        };

        const totalsQb = this.anomalyRepo
            .createQueryBuilder('a')
            .select('a.status', 'status')
            .addSelect('a.severity', 'severity')
            .addSelect('COUNT(*)', 'count')
            .where('a.organizationId = :organizationId', { organizationId })
            .andWhere('a.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('a.anomalyDate >= :since', { since });
        if (until) {
            totalsQb.andWhere('a.anomalyDate <= :until', { until });
        }
        const totalsRaw = await totalsQb
            .groupBy('a.status')
            .addGroupBy('a.severity')
            .getRawMany<{ status: string; severity: string; count: string }>();

        const totals = { open: 0, acknowledged: 0, resolved: 0, critical: 0, high: 0 };
        for (const row of totalsRaw) {
            const count = Number(row.count) || 0;
            if (row.status === 'open') totals.open += count;
            if (row.status === 'acknowledged') totals.acknowledged += count;
            if (row.status === 'resolved') totals.resolved += count;
            if (row.severity === 'critical') totals.critical += count;
            if (row.severity === 'high') totals.high += count;
        }

        const totalItems = await baseQb().getCount();
        const totalPages = Math.max(1, Math.ceil(totalItems / limit));
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * limit;

        const listQb = baseQb();
        if (sortKey === 'cost') {
            listQb
                .orderBy('a.financialImpact', 'DESC')
                .addOrderBy('a.actualCost', 'DESC')
                .addOrderBy('a.anomalyDate', 'DESC');
        } else if (sortKey === 'date') {
            listQb.orderBy('a.anomalyDate', 'DESC').addOrderBy('a.financialImpact', 'DESC');
        } else {
            // Default: severidade (crítica → baixa)
            listQb
                .orderBy(
                    `CASE LOWER(a.severity)
                        WHEN 'critical' THEN 4
                        WHEN 'high' THEN 3
                        WHEN 'medium' THEN 2
                        WHEN 'low' THEN 1
                        ELSE 0
                    END`,
                    'DESC',
                )
                .addOrderBy('a.financialImpact', 'DESC')
                .addOrderBy('a.anomalyDate', 'DESC');
        }

        const rows = await listQb.skip(offset).take(limit).getMany();

        return {
            items: rows.map((a) => this.mapAnomaly(a)),
            pagination: {
                page: safePage,
                limit,
                totalItems,
                totalPages: totalItems === 0 ? 0 : totalPages,
                hasNextPage: safePage < totalPages,
                hasPreviousPage: safePage > 1,
            },
            totals,
        };
    }

    async getSavingsList(
        organizationId: string,
        options: {
            status?: string;
            priority?: string;
            cloudAccountId?: string;
            cloudAccountIds?: string;
            provider?: string;
            q?: string;
            sort?: string;
            page?: string;
            limit?: string;
        } = {},
    ): Promise<OrgSavingsListResult> {
        const page = Math.max(1, Number(options.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
        const priorityFilter = (options.priority ?? 'all').trim().toLowerCase();
        const sortKey = (options.sort ?? 'saving').trim().toLowerCase();
        const search = (options.q ?? '').trim().toLowerCase();
        const statusFilter = (options.status ?? 'open').trim().toLowerCase();

        let accounts = await this.listFinopsAccounts(organizationId, options.cloudAccountId || undefined);
        const scopedIds = (options.cloudAccountIds ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
        if (scopedIds.length > 0 && !options.cloudAccountId) {
            const allowed = new Set(scopedIds);
            accounts = accounts.filter((a) => allowed.has(a.id));
        }
        const supported = accounts.filter((a) => {
            const provider = a.provider?.toLowerCase();
            if (provider !== 'aws' && provider !== 'azure' && provider !== 'gcp') return false;
            if (options.provider && provider !== options.provider.toLowerCase()) return false;
            return true;
        });
        const accountIds = supported.map((a) => a.id);

        const emptyPagination = {
            page,
            limit,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
        };
        const emptyTotals = {
            potentialSavings: 0,
            currency: 'USD',
            open: 0,
            high: 0,
            medium: 0,
            low: 0,
        };

        if (accountIds.length === 0) {
            return { items: [], pagination: emptyPagination, totals: emptyTotals };
        }

        const applySearch = (qb: ReturnType<typeof this.recommendationRepo.createQueryBuilder>) => {
            if (!search) return qb;
            return qb.andWhere(
                '(LOWER(r.resourceId) LIKE :q OR LOWER(r.resourceType) LIKE :q OR LOWER(r.description) LIKE :q OR LOWER(r.recommendation) LIKE :q)',
                { q: `%${search}%` },
            );
        };

        const baseQb = () => {
            let qb = this.recommendationRepo
                .createQueryBuilder('r')
                .where('r.organizationId = :organizationId', { organizationId })
                .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds });

            if (statusFilter && statusFilter !== 'all') {
                qb = qb.andWhere('r.status = :status', { status: statusFilter });
            }
            if (priorityFilter && priorityFilter !== 'all') {
                qb = qb.andWhere('LOWER(r.priority) = :priority', { priority: priorityFilter });
            }
            if (options.provider) {
                qb = qb.andWhere('LOWER(r.cloudProvider) = :provider', {
                    provider: options.provider.toLowerCase(),
                });
            }
            qb = applySearch(qb);
            return qb;
        };

        const totalsRaw = await this.recommendationRepo
            .createQueryBuilder('r')
            .select('r.status', 'status')
            .addSelect('r.priority', 'priority')
            .addSelect('r.currency', 'currency')
            .addSelect('COUNT(*)', 'count')
            .addSelect('COALESCE(SUM(r.potentialSaving), 0)', 'potentialSavings')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .groupBy('r.status')
            .addGroupBy('r.priority')
            .addGroupBy('r.currency')
            .getRawMany<{
                status: string;
                priority: string;
                currency: string;
                count: string;
                potentialSavings: string;
            }>();

        const totals = { ...emptyTotals };
        let openSavings = 0;
        for (const row of totalsRaw) {
            const count = Number(row.count) || 0;
            const saving = Number(row.potentialSavings) || 0;
            if (row.currency) totals.currency = row.currency;
            if (row.status !== 'open') continue;
            totals.open += count;
            openSavings += saving;
            if (row.priority === 'high') totals.high += count;
            if (row.priority === 'medium') totals.medium += count;
            if (row.priority === 'low') totals.low += count;
        }

        const includeReservations = statusFilter === 'open' || statusFilter === 'all';
        let reservationItems: OrgOverviewRecommendation[] = [];
        if (includeReservations) {
            let commitQb = this.commitmentRecommendationRepo
                .createQueryBuilder('c')
                .where('c.organizationId = :organizationId', { organizationId })
                .andWhere('c.cloudAccountId IN (:...accountIds)', { accountIds })
                .andWhere('c.eligible = true')
                .andWhere('c.estimatedMonthlySavings IS NOT NULL')
                .andWhere('c.estimatedMonthlySavings > 0');
            if (options.provider) {
                commitQb = commitQb.andWhere('LOWER(c.provider) = :provider', {
                    provider: options.provider.toLowerCase(),
                });
            }
            if (search) {
                commitQb = commitQb.andWhere(
                    '(LOWER(c.summary) LIKE :q OR LOWER(c.commitmentType) LIKE :q OR LOWER(c.recommendationKey) LIKE :q)',
                    { q: `%${search}%` },
                );
            }
            const commitRows = await commitQb.getMany();
            reservationItems = commitRows
                .map((c) => this.mapCommitmentRecommendation(c))
                .filter((item) => priorityFilter === 'all' || item.priority === priorityFilter);
            for (const item of reservationItems) {
                openSavings += Number(item.potentialSaving ?? 0);
                totals.open += 1;
                if (item.priority === 'high') totals.high += 1;
                else if (item.priority === 'medium') totals.medium += 1;
                else totals.low += 1;
                if (item.currency) totals.currency = item.currency;
            }
        }
        totals.potentialSavings = openSavings;

        const wasteRows = await baseQb().getMany();
        let merged: OrgOverviewRecommendation[] = [
            ...wasteRows.map((r) => this.mapRecommendation(r)),
            ...reservationItems,
        ];

        if (sortKey === 'priority') {
            const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
            merged.sort((a, b) => {
                const pr = (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0);
                if (pr !== 0) return pr;
                return Number(b.potentialSaving ?? 0) - Number(a.potentialSaving ?? 0);
            });
        } else if (sortKey === 'date') {
            merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        } else {
            merged.sort(
                (a, b) => Number(b.potentialSaving ?? 0) - Number(a.potentialSaving ?? 0),
            );
        }

        const totalItems = merged.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / limit));
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * limit;
        const items = merged.slice(offset, offset + limit);

        return {
            items,
            pagination: {
                page: safePage,
                limit,
                totalItems,
                totalPages: totalItems === 0 ? 0 : totalPages,
                hasNextPage: safePage < totalPages,
                hasPreviousPage: safePage > 1,
            },
            totals,
        };
    }

    /** Default: últimos 7 dias (janela de detecção). Aceita period=… ou days=N (legado). */
    private resolveAnomalyDateRange(
        period?: string,
        days?: string,
    ): { since: Date; until: Date | null } {
        const now = new Date();
        const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const key = (period ?? '').trim().toLowerCase();

        if (key === 'lastmonth') {
            const since = new Date(Date.UTC(utcToday.getUTCFullYear(), utcToday.getUTCMonth() - 1, 1));
            const until = new Date(Date.UTC(utcToday.getUTCFullYear(), utcToday.getUTCMonth(), 0));
            return { since, until };
        }

        if (key === 'currentmonth') {
            const since = new Date(Date.UTC(utcToday.getUTCFullYear(), utcToday.getUTCMonth(), 1));
            return { since, until: null };
        }

        if (key === 'last7days' || key === 'last30days' || key === 'last90days' || key === 'last180days') {
            const n = key === 'last7days' ? 7 : key === 'last30days' ? 30 : key === 'last90days' ? 90 : 180;
            const since = new Date(utcToday);
            since.setUTCDate(since.getUTCDate() - n);
            return { since, until: null };
        }

        // Default / legado sem period: janela de detecção (7 dias)
        if (!key && !days) {
            const since = new Date(utcToday);
            since.setUTCDate(since.getUTCDate() - 7);
            return { since, until: null };
        }

        const n = Math.min(365, Math.max(1, Number(days) || 7));
        const since = new Date(utcToday);
        since.setUTCDate(since.getUTCDate() - n);
        return { since, until: null };
    }

    private async listOrgAnomalies(
        organizationId: string,
        accountIds: string[],
        status: 'open' | 'acknowledged' | 'resolved' | Array<'open' | 'acknowledged' | 'resolved'>,
        days: number,
        take?: number
    ): Promise<FinopsCostAnomaly[]> {
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - days);
        const statuses = Array.isArray(status) ? status : [status];

        const qb = this.anomalyRepo
            .createQueryBuilder('a')
            .where('a.organizationId = :organizationId', { organizationId })
            .andWhere('a.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('a.status IN (:...statuses)', { statuses })
            .andWhere('a.anomalyDate >= :since', { since })
            .orderBy(
                `CASE LOWER(a.severity)
                    WHEN 'critical' THEN 4
                    WHEN 'high' THEN 3
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 1
                    ELSE 0
                END`,
                'DESC',
            )
            .addOrderBy('a.financialImpact', 'DESC');

        if (take) qb.take(take);

        return qb.getMany();
    }

    private async listOrgRecommendations(
        organizationId: string,
        accountIds: string[],
        status: 'open' | 'dismissed' | 'resolved',
        take?: number
    ): Promise<FinopsRecommendation[]> {
        const qb = this.recommendationRepo
            .createQueryBuilder('r')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.status = :status', { status })
            .orderBy('r.priority', 'DESC')
            .addOrderBy('r.potentialSaving', 'DESC');

        if (take) qb.take(take);

        return qb.getMany();
    }

    private mapAnomaly(a: FinopsCostAnomaly): OrgOverviewAnomaly {
        const anomalyDate =
            a.anomalyDate instanceof Date ? a.anomalyDate.toISOString().slice(0, 10) : String(a.anomalyDate).slice(0, 10);

        return {
            id: a.id,
            cloudAccountId: a.cloudAccountId,
            cloudProvider: a.cloudProvider,
            service: a.service,
            region: a.region,
            anomalyDate,
            expectedCost: Number(a.expectedCost),
            actualCost: Number(a.actualCost),
            deviationPercentage: Number(a.deviationPercentage),
            financialImpact: Number(a.financialImpact),
            severity: a.severity,
            status: a.status,
            currency: a.currency,
            description: a.description,
            createdAt: a.createdAt.toISOString(),
        };
    }

    private mapRecommendation(r: FinopsRecommendation): OrgOverviewRecommendation {
        return {
            id: r.id,
            cloudAccountId: r.cloudAccountId,
            type: r.type,
            resourceType: r.resourceType,
            resourceId: r.resourceId,
            description: r.description,
            recommendation: r.recommendation,
            potentialSaving: r.potentialSaving != null ? Number(r.potentialSaving) : null,
            currency: r.currency,
            priority: r.priority,
            status: r.status,
            cloudProvider: r.cloudProvider,
            createdAt: r.createdAt.toISOString(),
            kind: 'waste',
        };
    }

    private mapCommitmentRecommendation(c: FinopsCommitmentRecommendation): OrgOverviewRecommendation {
        const saving = c.estimatedMonthlySavings != null ? Number(c.estimatedMonthlySavings) : null;
        const priority =
            saving != null && saving >= 500 ? 'high' : saving != null && saving >= 100 ? 'medium' : 'low';
        // resourceType/resourceId/recommendation are codes or empty — the UI localizes via
        // commitmentType + term + paymentOption + lookbackDays (never show raw recommendationKey).
        return {
            id: c.id,
            cloudAccountId: c.cloudAccountId,
            type: c.commitmentType,
            resourceType: c.commitmentType,
            resourceId: '',
            description: '',
            recommendation: '',
            potentialSaving: saving,
            currency: c.currency,
            priority,
            status: 'open',
            cloudProvider: c.provider,
            createdAt: c.syncedAt instanceof Date ? c.syncedAt.toISOString() : String(c.syncedAt),
            kind: 'reservation',
            commitmentType: c.commitmentType,
            term: c.term,
            paymentOption: c.paymentOption,
            lookbackDays: c.lookbackDays,
            eligible: c.eligible,
            ineligibleReason: c.ineligibleReason,
        };
    }

    private emptyOverview(period: ResolvedFinopsPeriod): OrgFinopsOverview {
        return {
            period,
            totals: {
                cost: 0,
                currency: 'USD',
                momGrowth: 0,
                forecastedCost: null,
                potentialSavings: 0,
            },
            costByService: [],
            costTrend: [],
            anomalies: [],
            recommendations: [],
            accounts: [],
            dataCoverage: this.buildDataCoverage(period.startDate, period.endDate, null, null),
        };
    }

    private async getAvailableCostRange(
        organizationId: string,
        accountIds: string[],
    ): Promise<{ availableStart: string | null; availableEnd: string | null }> {
        if (accountIds.length === 0) {
            return { availableStart: null, availableEnd: null };
        }

        const qb = this.costRecordRepo
            .createQueryBuilder('r')
            .select('MIN(r.date)', 'minDate')
            .addSelect('MAX(r.date)', 'maxDate')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds });
        andWhereServiceLevelCost(qb, 'r');

        const row = await qb.getRawOne<{ minDate: string | Date | null; maxDate: string | Date | null }>();
        const toDateOnly = (value: string | Date | null | undefined): string | null => {
            if (!value) return null;
            if (value instanceof Date) return value.toISOString().slice(0, 10);
            return String(value).slice(0, 10);
        };

        return {
            availableStart: toDateOnly(row?.minDate),
            availableEnd: toDateOnly(row?.maxDate),
        };
    }

    private buildDataCoverage(
        requestedStart: string,
        requestedEnd: string,
        availableStart: string | null,
        availableEnd: string | null,
    ): OrgFinopsDataCoverage {
        if (!availableStart || !availableEnd) {
            return {
                availableStart: null,
                availableEnd: null,
                requestedStart,
                requestedEnd,
                incomplete: true,
                missingBefore: true,
                missingAfter: true,
            };
        }

        // Folga de 1 dia no fim: clouds costumam fechar D-1.
        const endWithGrace = this.addOneDay(availableEnd);
        const missingBefore = availableStart > requestedStart;
        const missingAfter = endWithGrace < requestedEnd;

        return {
            availableStart,
            availableEnd,
            requestedStart,
            requestedEnd,
            incomplete: missingBefore || missingAfter,
            missingBefore,
            missingAfter,
        };
    }

    private addOneDay(dateStr: string): string {
        const date = new Date(`${dateStr}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + 1);
        return date.toISOString().slice(0, 10);
    }
}
