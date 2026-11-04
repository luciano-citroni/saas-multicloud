import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import { andWhereResourceLevelCost } from '../utils/service-level-cost';
import { FinopsResourceChangeService, type ResourceChangeCause } from './finops-resource-change.service';

export interface CostByResourceItem {
    resourceId: string;
    service: string;
    region: string;
    currentMonthCost: number;
    previousMonthCost: number;
    change: number;
    changePercentage: number;
    trend: 'up' | 'down' | 'stable';
    currency: string;
    recentChanges: ResourceChangeCause[];
}

export interface AnomalyResourceContributor {
    resourceId: string;
    service: string;
    region: string;
    costOnAnomalyDate: number;
    avgPrior7d: number;
    delta: number;
    shareOfAnomalyPercent: number;
    currency: string;
    causes: ResourceChangeCause[];
}

@Injectable()
export class FinopsResourceCostService {
    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(FinopsCostAnomaly)
        private readonly anomalyRepo: Repository<FinopsCostAnomaly>,

        private readonly changeService: FinopsResourceChangeService,
    ) {}

    async getCostByResource(
        cloudAccountId: string,
        organizationId: string,
        year: number,
        month: number,
        service?: string,
        limit = 25,
    ): Promise<CostByResourceItem[]> {
        const pad = (n: number) => String(n).padStart(2, '0');
        const startOfMonth = `${year}-${pad(month)}-01`;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const endOfMonth = `${nextYear}-${pad(nextMonth)}-01`;
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const startOfPrevMonth = `${prevYear}-${pad(prevMonth)}-01`;
        const now = new Date();
        const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

        const [currentGranularity, prevGranularity] = await Promise.all([
            this.resolveGranularity(cloudAccountId, organizationId, startOfMonth, endOfMonth, isCurrentMonth),
            this.resolveGranularity(cloudAccountId, organizationId, startOfPrevMonth, startOfMonth, false),
        ]);

        interface RawRow {
            resourceId: string;
            service: string;
            region: string;
            totalCost: string;
            currency: string;
        }

        const buildQb = (granularity: string, start: string, end: string) => {
            const qb = this.costRecordRepo
                .createQueryBuilder('r')
                .select('r.resourceId', 'resourceId')
                .addSelect('r.service', 'service')
                .addSelect('MAX(r.region)', 'region')
                .addSelect('SUM(r.cost)', 'totalCost')
                .addSelect('MAX(r.currency)', 'currency')
                .where('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
                .andWhere('r.organizationId = :organizationId', { organizationId })
                .andWhere('r.granularity = :granularity', { granularity })
                .andWhere('r.date >= :start', { start })
                .andWhere('r.date < :end', { end });

            andWhereResourceLevelCost(qb, 'r');

            if (service?.trim()) {
                qb.andWhere('r.service = :service', { service: service.trim() });
            }

            return qb.groupBy('r.resourceId').addGroupBy('r.service').orderBy('SUM(r.cost)', 'DESC');
        };

        const [currentRows, previousRows] = await Promise.all([
            buildQb(currentGranularity, startOfMonth, endOfMonth).limit(Math.max(limit * 3, 50)).getRawMany<RawRow>(),
            buildQb(prevGranularity, startOfPrevMonth, startOfMonth).getRawMany<RawRow>(),
        ]);

        const prevMap = new Map<string, number>();
        for (const row of previousRows) {
            prevMap.set(`${row.service}::${row.resourceId}`, Number(row.totalCost));
        }

        const monthStart = new Date(`${startOfMonth}T00:00:00Z`);
        const monthEnd = new Date(`${endOfMonth}T00:00:00Z`);
        const resourceIds = currentRows.slice(0, limit).map((r) => r.resourceId);
        const changeEvents = await this.changeService.listForResources(
            organizationId,
            cloudAccountId,
            resourceIds,
            monthStart,
            monthEnd,
        );

        const items: CostByResourceItem[] = currentRows.slice(0, limit).map((row) => {
            const currentMonthCost = Number(row.totalCost);
            const previousMonthCost = prevMap.get(`${row.service}::${row.resourceId}`) ?? 0;
            const change = currentMonthCost - previousMonthCost;
            const changePercentage =
                previousMonthCost > 0 ? (change / previousMonthCost) * 100 : currentMonthCost > 0 ? 100 : 0;
            const trend: 'up' | 'down' | 'stable' =
                Math.abs(changePercentage) < 5 ? 'stable' : change > 0 ? 'up' : 'down';
            const matched = this.changeService.matchEventsForResource(changeEvents, row.resourceId);

            return {
                resourceId: row.resourceId,
                service: row.service,
                region: row.region ?? '',
                currentMonthCost,
                previousMonthCost,
                change,
                changePercentage,
                trend,
                currency: row.currency ?? 'USD',
                recentChanges: this.changeService.toCauses(matched),
            };
        });

        return items;
    }

    /**
     * Fluxo: anomalia no custo diário do serviço → recursos com custo no dia
     * → causas de inventário (ex.: instanceType EC2) no intervalo ±7d.
     * Se não houver resource IDs de custo, ainda retorna suspeitos só com mudança de config.
     */
    async getAnomalyContributors(
        cloudAccountId: string,
        organizationId: string,
        anomalyId: string,
        limit = 10,
    ): Promise<AnomalyResourceContributor[]> {
        const anomaly = await this.anomalyRepo.findOne({
            where: { id: anomalyId, cloudAccountId, organizationId },
        });

        if (!anomaly) {
            throw new NotFoundException(ErrorMessages.FINOPS.ANOMALY_NOT_FOUND);
        }

        const anomalyDate =
            anomaly.anomalyDate instanceof Date
                ? anomaly.anomalyDate.toISOString().slice(0, 10)
                : String(anomaly.anomalyDate).slice(0, 10);

        const target = new Date(`${anomalyDate}T00:00:00Z`);
        const sevenDaysAgo = new Date(target);
        sevenDaysAgo.setUTCDate(target.getUTCDate() - 7);
        const oneDayBefore = new Date(target);
        oneDayBefore.setUTCDate(target.getUTCDate() - 1);

        const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
        const oneDayBeforeStr = oneDayBefore.toISOString().slice(0, 10);

        const from = new Date(sevenDaysAgo);
        const to = new Date(target);
        to.setUTCDate(to.getUTCDate() + 1);

        const resourceTypes = this.resourceTypesForService(anomaly.service);

        const [dayRows, accountChanges] = await Promise.all([
            this.loadResourceCostsOnDate(
                organizationId,
                cloudAccountId,
                anomalyDate,
                anomaly.service,
                anomaly.region,
                Math.max(limit * 3, 30),
            ),
            this.changeService.listForAccount(
                organizationId,
                cloudAccountId,
                from,
                to,
                resourceTypes.length ? resourceTypes : undefined,
            ),
        ]);

        const priorQb = this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.resourceId', 'resourceId')
            .addSelect('r.date', 'date')
            .addSelect('SUM(r.cost)', 'dailyCost')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('r.date >= :from', { from: sevenDaysAgoStr })
            .andWhere('r.date <= :to', { to: oneDayBeforeStr })
            .andWhere('r.granularity = :gran', { gran: 'daily' });

        andWhereResourceLevelCost(priorQb, 'r');
        this.applyServiceMatch(priorQb, anomaly.service);
        this.applyOptionalRegionFilter(priorQb, anomaly.region);

        const priorRows = await priorQb
            .groupBy('r.resourceId')
            .addGroupBy('r.date')
            .getRawMany<{ resourceId: string; date: string; dailyCost: string }>();

        const sumByResource = new Map<string, { sum: number; days: number }>();
        for (const row of priorRows) {
            const current = sumByResource.get(row.resourceId) ?? { sum: 0, days: 0 };
            current.sum += Number(row.dailyCost);
            current.days += 1;
            sumByResource.set(row.resourceId, current);
        }
        const avgMap = new Map<string, number>();
        for (const [resourceId, stats] of sumByResource) {
            avgMap.set(resourceId, stats.days > 0 ? stats.sum / stats.days : 0);
        }

        const anomalyImpact = Math.max(Number(anomaly.financialImpact) || Number(anomaly.actualCost), 0.01);
        const byId = new Map<string, AnomalyResourceContributor>();

        for (const row of dayRows) {
            const costOnAnomalyDate = Number(row.totalCost);
            const avgPrior7d = avgMap.get(row.resourceId) ?? 0;
            const delta = costOnAnomalyDate - avgPrior7d;
            const matched = this.changeService.matchEventsForResource(accountChanges, row.resourceId);

            byId.set(this.changeService.shortResourceId(row.resourceId) || row.resourceId, {
                resourceId: row.resourceId,
                service: row.service || anomaly.service,
                region: row.region || anomaly.region || '',
                costOnAnomalyDate,
                avgPrior7d,
                delta,
                shareOfAnomalyPercent: Math.min(100, Math.max(0, (Math.max(delta, 0) / anomalyImpact) * 100)),
                currency: row.currency ?? anomaly.currency ?? 'USD',
                causes: this.changeService.toCauses(matched),
            });
        }

        // Suspeitos só com mudança de config (ex.: resize EC2 sem resource cost naquele dia)
        for (const event of accountChanges) {
            const key = this.changeService.shortResourceId(event.resourceId) || event.resourceId;
            if (byId.has(key)) continue;

            const matched = this.changeService.matchEventsForResource(accountChanges, event.resourceId);
            byId.set(key, {
                resourceId: event.resourceId,
                service: anomaly.service,
                region: anomaly.region || '',
                costOnAnomalyDate: 0,
                avgPrior7d: 0,
                delta: 0,
                shareOfAnomalyPercent: 0,
                currency: anomaly.currency ?? 'USD',
                causes: this.changeService.toCauses(matched),
            });
        }

        const items = Array.from(byId.values());
        items.sort((left, right) => {
            const leftResize = left.causes.some((c) => /instanceType|sku|machineType|vmSize/i.test(c.field)) ? 1 : 0;
            const rightResize = right.causes.some((c) => /instanceType|sku|machineType|vmSize/i.test(c.field)) ? 1 : 0;
            if (rightResize !== leftResize) return rightResize - leftResize;
            const leftHasCause = left.causes.length > 0 ? 1 : 0;
            const rightHasCause = right.causes.length > 0 ? 1 : 0;
            if (rightHasCause !== leftHasCause) return rightHasCause - leftHasCause;
            if (right.delta !== left.delta) return right.delta - left.delta;
            return right.costOnAnomalyDate - left.costOnAnomalyDate;
        });

        return items.slice(0, limit);
    }

    private async loadResourceCostsOnDate(
        organizationId: string,
        cloudAccountId: string,
        date: string,
        service: string,
        region: string | null | undefined,
        limit: number,
    ): Promise<Array<{ resourceId: string; service: string; region: string; totalCost: string; currency: string }>> {
        const dayQb = this.costRecordRepo
            .createQueryBuilder('r')
            .select('r.resourceId', 'resourceId')
            .addSelect('r.service', 'service')
            .addSelect('MAX(r.region)', 'region')
            .addSelect('SUM(r.cost)', 'totalCost')
            .addSelect('MAX(r.currency)', 'currency')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('r.date = :date', { date })
            .andWhere('r.granularity = :gran', { gran: 'daily' });

        andWhereResourceLevelCost(dayQb, 'r');
        this.applyServiceMatch(dayQb, service);
        this.applyOptionalRegionFilter(dayQb, region);

        return dayQb
            .groupBy('r.resourceId')
            .addGroupBy('r.service')
            .orderBy('SUM(r.cost)', 'DESC')
            .limit(limit)
            .getRawMany();
    }

    /** Match serviço da anomalia OU padrão de resourceId (EC2/RDS/Lambda/etc.). */
    private applyServiceMatch(qb: SelectQueryBuilder<FinopsCostRecord>, service: string): void {
        const s = service.toLowerCase();
        if (s.includes('elastic compute') || s.includes('ec2')) {
            qb.andWhere(
                `(r.service = :service OR LOWER(r.service) LIKE '%elastic compute%' OR LOWER(r.service) LIKE '%ec2%'
                  OR r.resourceId LIKE 'i-%' OR LOWER(r.resourceId) LIKE '%:instance/%')`,
                { service },
            );
            return;
        }
        if (s.includes('lambda')) {
            qb.andWhere(
                `(r.service = :service OR LOWER(r.service) LIKE '%lambda%'
                  OR LOWER(r.resourceId) LIKE '%:function:%' OR LOWER(r.resourceId) LIKE '%:lambda:%')`,
                { service },
            );
            return;
        }
        if (s.includes('relational database') || s.includes('rds')) {
            qb.andWhere(
                `(r.service = :service OR LOWER(r.service) LIKE '%relational database%' OR LOWER(r.service) LIKE '%rds%'
                  OR LOWER(r.resourceId) LIKE '%:db:%')`,
                { service },
            );
            return;
        }
        if (s.includes('virtual machines') || s.includes('microsoft.compute')) {
            qb.andWhere(
                `(r.service = :service OR LOWER(r.resourceId) LIKE '%/virtualmachines/%')`,
                { service },
            );
            return;
        }
        if (s.includes('compute engine')) {
            qb.andWhere(`(r.service = :service OR LOWER(r.resourceId) LIKE '%/instances/%')`, { service });
            return;
        }
        qb.andWhere('r.service = :service', { service });
    }

    private resourceTypesForService(service: string): string[] {
        const s = service.toLowerCase();
        if (s.includes('elastic compute') || s.includes('ec2')) return ['ec2'];
        if (s.includes('relational database') || s.includes('rds')) return ['rds'];
        if (s.includes('virtual machines') || s.includes('microsoft.compute')) return ['azure_vm'];
        if (s.includes('compute engine')) return ['gcp_vm'];
        return [];
    }

    /**
     * Match exact region OR empty region (AWS resource pass often omits region).
     */
    private applyOptionalRegionFilter(
        qb: SelectQueryBuilder<FinopsCostRecord>,
        region: string | null | undefined,
    ): void {
        const trimmed = region?.trim();
        if (!trimmed || trimmed.toLowerCase() === 'global') return;

        qb.andWhere(`(r.region = :region OR r.region IS NULL OR r.region = '')`, {
            region: trimmed,
        });
    }

    private async resolveGranularity(
        cloudAccountId: string,
        organizationId: string,
        start: string,
        end: string,
        preferDaily: boolean,
    ): Promise<'daily' | 'monthly'> {
        try {
            const countDaily = await this.costRecordRepo
                .createQueryBuilder('r')
                .where('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
                .andWhere('r.organizationId = :organizationId', { organizationId })
                .andWhere('r.granularity = :g', { g: 'daily' })
                .andWhere('r.date >= :start', { start })
                .andWhere('r.date < :end', { end })
                .getCount();

            if (preferDaily && countDaily > 0) return 'daily';
            if (countDaily > 0) return 'daily';
            return 'monthly';
        } catch {
            return preferDaily ? 'daily' : 'monthly';
        }
    }
}
