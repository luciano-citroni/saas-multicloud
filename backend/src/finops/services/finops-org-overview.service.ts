import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CloudAccount, CloudProvider } from '../../db/entites/cloud-account.entity';
import { FinopsConsent } from '../../db/entites/finops-consent.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import { FinopsRecommendation } from '../../db/entites/finops-recommendation.entity';
import { FinopsAnalysisService, type CostByServiceItem } from './finops-analysis.service';
import { FinopsForecastService } from './finops-forecast.service';
import { resolveFinopsPeriod, type ResolvedFinopsPeriod } from '../utils/resolve-finops-period';

export type OrgOverviewAccountRollup = {
    id: string;
    alias: string;
    provider: string;
    totalCost: number;
    openAnomalies: number;
    openRecs: number;
    hasConsent: boolean;
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

        private readonly analysisService: FinopsAnalysisService,
        private readonly forecastService: FinopsForecastService
    ) {}

    async getOverview(
        organizationId: string,
        query: { period?: string; year?: string; month?: string; anomalyDays?: string; cloudAccountId?: string }
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

        const accounts = await this.listFinopsAccounts(organizationId, query.cloudAccountId);
        const accountIds = accounts.map((a) => a.id);
        const supportedAccounts = accounts.filter((a) => this.isFinopsSupportedProvider(a.provider));
        const supportedIds = supportedAccounts.map((a) => a.id);

        if (accountIds.length === 0) {
            return this.emptyOverview(resolved);
        }

        const emptyMetrics = supportedIds.length === 0;

        const [costByService, costTrend, momGrowth, forecasts, anomalies, recommendations, consents, accountCosts] =
            await Promise.all([
                emptyMetrics
                    ? Promise.resolve([] as Awaited<ReturnType<FinopsOrgOverviewService['getOrgCostByService']>>)
                    : this.getOrgCostByService(organizationId, supportedIds, resolved.year, resolved.month),
                emptyMetrics
                    ? Promise.resolve([] as Awaited<ReturnType<FinopsOrgOverviewService['getOrgCostTrend']>>)
                    : this.getOrgCostTrend(organizationId, supportedIds, resolved.startDate, resolved.endDate),
                emptyMetrics ? Promise.resolve(0) : this.getOrgMomGrowth(organizationId, supportedIds, resolved.year, resolved.month),
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
                    : this.getAccountCosts(organizationId, supportedIds, resolved.year, resolved.month),
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
        }));

        this.logger.log(
            `[Overview] org=${organizationId} accounts=${accountIds.length} cost=${totalCost.toFixed(2)} period=${resolved.period}`
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

    private async listFinopsAccounts(organizationId: string, cloudAccountId?: string): Promise<CloudAccount[]> {
        // Todas as contas do tenant (mesmo universo da sidebar / cloud-accounts).
        // tenant_id é a chave principal; organization_id cobre registros legados.
        const qb = this.cloudAccountRepo
            .createQueryBuilder('ca')
            .where('(ca.tenantId = :organizationId OR ca.organizationId = :organizationId)', { organizationId })
            .orderBy('ca.alias', 'ASC');

        if (cloudAccountId) {
            qb.andWhere('ca.id = :cloudAccountId', { cloudAccountId });
        }

        return qb.getMany();
    }

    private isFinopsSupportedProvider(provider: string): boolean {
        return provider === CloudProvider.AWS || provider === CloudProvider.AZURE || provider === CloudProvider.GCP;
    }

    private async getOrgCostByService(
        organizationId: string,
        accountIds: string[],
        year: number,
        month: number
    ): Promise<CostByServiceItem[]> {
        const results = await Promise.all(
            accountIds.map((id) => this.analysisService.getCostByService(id, organizationId, year, month).catch(() => [] as CostByServiceItem[]))
        );

        const serviceMap = new Map<string, CostByServiceItem>();

        for (const items of results) {
            for (const item of items) {
                const existing = serviceMap.get(item.service);
                if (existing) {
                    const currentCost = Number(existing.currentMonthCost) + Number(item.currentMonthCost);
                    const previousCost = Number(existing.previousMonthCost ?? 0) + Number(item.previousMonthCost ?? 0);
                    const change = currentCost - previousCost;
                    const changePercentage = previousCost > 0 ? (change / previousCost) * 100 : 0;
                    serviceMap.set(item.service, {
                        service: item.service,
                        currentMonthCost: currentCost,
                        previousMonthCost: previousCost,
                        change,
                        changePercentage,
                        trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
                        currency: existing.currency,
                    });
                } else {
                    serviceMap.set(item.service, { ...item });
                }
            }
        }

        return Array.from(serviceMap.values()).sort((a, b) => Number(b.currentMonthCost) - Number(a.currentMonthCost));
    }

    private async getOrgCostTrend(
        organizationId: string,
        accountIds: string[],
        startDate: string,
        endDate: string
    ): Promise<OrgCostTrendPoint[]> {
        const exclusiveEnd = this.addOneDay(endDate);

        const rows = await this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.date', 'date')
            .addSelect('SUM(r.cost)', 'cost')
            .addSelect('MIN(r.currency)', 'currency')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.granularity = :granularity', { granularity: 'daily' })
            .andWhere('r.date >= :startDate', { startDate })
            .andWhere('r.date < :endDate', { endDate: exclusiveEnd })
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
        const monthlyRows = await this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.date', 'date')
            .addSelect('SUM(r.cost)', 'cost')
            .addSelect('MIN(r.currency)', 'currency')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.granularity = :granularity', { granularity: 'monthly' })
            .andWhere('r.date >= :startDate', { startDate })
            .andWhere('r.date < :endDate', { endDate: exclusiveEnd })
            .groupBy('r.date')
            .orderBy('r.date', 'ASC')
            .getRawMany<{ date: string | Date; cost: string; currency: string }>();

        return monthlyRows.map((row) => ({
            date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
            cost: Number(row.cost),
            currency: row.currency ?? 'USD',
        }));
    }

    private async getOrgMomGrowth(organizationId: string, accountIds: string[], year: number, month: number): Promise<number> {
        const pad = (n: number) => String(n).padStart(2, '0');
        const currentStart = `${year}-${pad(month)}-01`;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const currentEnd = `${nextYear}-${pad(nextMonth)}-01`;

        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const previousStart = `${prevYear}-${pad(prevMonth)}-01`;

        const [current, previous] = await Promise.all([
            this.sumCost(organizationId, accountIds, currentStart, currentEnd),
            this.sumCost(organizationId, accountIds, previousStart, currentStart),
        ]);

        if (previous <= 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    }

    private async sumCost(organizationId: string, accountIds: string[], from: string, to: string): Promise<number> {
        const result = await this.costRecordRepo
            .createQueryBuilder('r')
            .select('SUM(r.cost)', 'total')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.date >= :from', { from })
            .andWhere('r.date < :to', { to })
            .andWhere('r.granularity = :granularity', { granularity: 'daily' })
            .getRawOne<{ total: string }>();

        const daily = Number(result?.total ?? 0);
        if (daily > 0) return daily;

        const monthly = await this.costRecordRepo
            .createQueryBuilder('r')
            .select('SUM(r.cost)', 'total')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.date >= :from', { from })
            .andWhere('r.date < :to', { to })
            .andWhere('r.granularity = :granularity', { granularity: 'monthly' })
            .getRawOne<{ total: string }>();

        return Number(monthly?.total ?? 0);
    }

    private async getAccountCosts(
        organizationId: string,
        accountIds: string[],
        year: number,
        month: number
    ): Promise<Map<string, number>> {
        const pad = (n: number) => String(n).padStart(2, '0');
        const start = `${year}-${pad(month)}-01`;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const end = `${nextYear}-${pad(nextMonth)}-01`;

        const rows = await this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.cloudAccountId', 'cloudAccountId')
            .addSelect('SUM(r.cost)', 'total')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.date >= :start', { start })
            .andWhere('r.date < :end', { end })
            .andWhere('r.granularity = :granularity', { granularity: 'daily' })
            .groupBy('r.cloudAccountId')
            .getRawMany<{ cloudAccountId: string; total: string }>();

        const map = new Map<string, number>();
        for (const row of rows) {
            map.set(row.cloudAccountId, Number(row.total));
        }

        if (map.size > 0) return map;

        const monthlyRows = await this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.cloudAccountId', 'cloudAccountId')
            .addSelect('SUM(r.cost)', 'total')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.date >= :start', { start })
            .andWhere('r.date < :end', { end })
            .andWhere('r.granularity = :granularity', { granularity: 'monthly' })
            .groupBy('r.cloudAccountId')
            .getRawMany<{ cloudAccountId: string; total: string }>();

        for (const row of monthlyRows) {
            map.set(row.cloudAccountId, Number(row.total));
        }

        return map;
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
            .orderBy('a.severity', 'DESC')
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
        };
    }

    private addOneDay(dateStr: string): string {
        const date = new Date(`${dateStr}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + 1);
        return date.toISOString().slice(0, 10);
    }
}
