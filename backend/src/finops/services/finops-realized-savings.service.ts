import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { FinopsCommitmentRecommendation } from '../../db/entites/finops-commitment-recommendation.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsRecommendation } from '../../db/entites/finops-recommendation.entity';
import {
    FinopsRealizedSaving,
    type FinopsRealizedSavingSource,
} from '../../db/entites/finops-realized-saving.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import { findCloudAccountForTenant } from '../utils/find-cloud-account';
import { andWhereServiceLevelCost } from '../utils/service-level-cost';
import { FinopsForecastService } from './finops-forecast.service';

export type CreateRealizedSavingInput = {
    cloudAccountId: string;
    resourceNames: string[];
    monthlyAmount: number;
    currency?: string;
    description: string;
    executedAt: string;
    source?: FinopsRealizedSavingSource;
    sourceRecommendationId?: string | null;
    sourceCommitmentRecommendationId?: string | null;
};

export type UpdateRealizedSavingInput = {
    resourceNames?: string[];
    monthlyAmount?: number;
    currency?: string;
    description?: string;
    executedAt?: string;
};

export type RealizedSavingsFilter = {
    cloudAccountId?: string;
    cloudAccountIds?: string;
    provider?: string;
    periodStart?: string;
    periodEnd?: string;
    page?: string;
    limit?: string;
};

export type RealizeRecommendationInput = {
    executedAt?: string;
    monthlyAmount?: number;
    description?: string;
};

function monthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseMonthStart(ym: string): Date {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
}

function addMonths(date: Date, count: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function monthsInclusive(fromYm: string, toYm: string): string[] {
    const keys: string[] = [];
    let cursor = parseMonthStart(fromYm);
    const end = parseMonthStart(toYm);
    while (cursor <= end) {
        keys.push(monthKey(cursor));
        cursor = addMonths(cursor, 1);
    }
    return keys;
}

function executedMonth(executedAt: string): string {
    return executedAt.slice(0, 7);
}

/** Meses civis em que a economia recorrente está ativa dentro do período filtrado. */
export function activeMonthsInPeriod(
    executedAt: string,
    periodStart: string,
    periodEnd: string,
): string[] {
    const startYm = periodStart.slice(0, 7);
    const endYm = periodEnd.slice(0, 7);
    const execYm = executedMonth(executedAt);
    const fromYm = execYm > startYm ? execYm : startYm;
    if (fromYm > endYm) return [];
    return monthsInclusive(fromYm, endYm);
}

@Injectable()
export class FinopsRealizedSavingsService {
    private readonly logger = new Logger(FinopsRealizedSavingsService.name);

    constructor(
        @InjectRepository(FinopsRealizedSaving)
        private readonly realizedRepo: Repository<FinopsRealizedSaving>,
        @InjectRepository(FinopsRecommendation)
        private readonly recommendationRepo: Repository<FinopsRecommendation>,
        @InjectRepository(FinopsCommitmentRecommendation)
        private readonly commitmentRecRepo: Repository<FinopsCommitmentRecommendation>,
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,
        private readonly forecastService: FinopsForecastService,
        private readonly dataSource: DataSource,
    ) {}

    async list(organizationId: string, filter: RealizedSavingsFilter = {}) {
        const page = Math.max(1, Number(filter.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(filter.limit) || 25));
        const accountIds = await this.resolveAccountIds(organizationId, filter);

        if (accountIds.length === 0) {
            return {
                items: [],
                pagination: {
                    page,
                    limit,
                    totalItems: 0,
                    totalPages: 0,
                    hasNextPage: false,
                    hasPreviousPage: false,
                },
                totals: { totalSaved: 0, currency: 'USD', count: 0 },
            };
        }

        const { periodStart, periodEnd } = this.resolvePeriod(filter.periodStart, filter.periodEnd);

        const qb = this.realizedRepo
            .createQueryBuilder('s')
            .where('s.organizationId = :organizationId', { organizationId })
            .andWhere('s.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('s.executedAt <= :periodEnd', { periodEnd });

        if (filter.provider) {
            qb.andWhere('LOWER(s.provider) = :provider', { provider: filter.provider.toLowerCase() });
        }

        const [rows, totalItems] = await qb
            .orderBy('s.executedAt', 'DESC')
            .addOrderBy('s.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        const allForTotals = await this.realizedRepo
            .createQueryBuilder('s')
            .where('s.organizationId = :organizationId', { organizationId })
            .andWhere('s.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('s.executedAt <= :periodEnd', { periodEnd })
            .andWhere(
                filter.provider ? 'LOWER(s.provider) = :provider' : '1=1',
                filter.provider ? { provider: filter.provider.toLowerCase() } : {},
            )
            .getMany();

        const totalSaved = this.sumRealizedInPeriod(allForTotals, periodStart, periodEnd);
        const currency = allForTotals[0]?.currency ?? rows[0]?.currency ?? 'USD';
        const totalPages = Math.max(1, Math.ceil(totalItems / limit));

        return {
            items: rows.map((row) => this.mapRow(row)),
            pagination: {
                page: Math.min(page, totalPages),
                limit,
                totalItems,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
            totals: {
                totalSaved,
                currency,
                count: allForTotals.length,
            },
        };
    }

    async create(organizationId: string, userId: string | null, input: CreateRealizedSavingInput) {
        const account = await findCloudAccountForTenant(
            this.cloudAccountRepo,
            input.cloudAccountId,
            organizationId,
        );
        if (!account) {
            throw new NotFoundException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        const resourceNames = this.normalizeResourceNames(input.resourceNames);
        if (resourceNames.length === 0) {
            throw new BadRequestException(ErrorMessages.GENERAL.BAD_REQUEST);
        }
        if (!(input.monthlyAmount > 0)) {
            throw new BadRequestException(ErrorMessages.GENERAL.BAD_REQUEST);
        }

        const entity = this.realizedRepo.create({
            organizationId,
            cloudAccountId: account.id,
            provider: account.provider,
            resourceNames,
            monthlyAmount: input.monthlyAmount,
            currency: (input.currency ?? 'USD').toUpperCase(),
            description: input.description.trim(),
            executedAt: input.executedAt,
            source: input.source ?? 'manual',
            sourceRecommendationId: input.sourceRecommendationId ?? null,
            sourceCommitmentRecommendationId: input.sourceCommitmentRecommendationId ?? null,
            createdByUserId: userId,
        });

        const saved = await this.realizedRepo.save(entity);
        return this.mapRow(saved);
    }

    async update(organizationId: string, id: string, input: UpdateRealizedSavingInput) {
        const entity = await this.realizedRepo.findOne({ where: { id, organizationId } });
        if (!entity) {
            throw new NotFoundException(ErrorMessages.FINOPS.REALIZED_SAVING_NOT_FOUND);
        }

        if (input.resourceNames !== undefined) {
            const names = this.normalizeResourceNames(input.resourceNames);
            if (names.length === 0) {
                throw new BadRequestException(ErrorMessages.GENERAL.BAD_REQUEST);
            }
            entity.resourceNames = names;
        }
        if (input.monthlyAmount !== undefined) {
            if (!(input.monthlyAmount > 0)) {
                throw new BadRequestException(ErrorMessages.GENERAL.BAD_REQUEST);
            }
            entity.monthlyAmount = input.monthlyAmount;
        }
        if (input.currency !== undefined) entity.currency = input.currency.toUpperCase();
        if (input.description !== undefined) entity.description = input.description.trim();
        if (input.executedAt !== undefined) entity.executedAt = input.executedAt;

        const saved = await this.realizedRepo.save(entity);
        return this.mapRow(saved);
    }

    async remove(organizationId: string, id: string): Promise<void> {
        const entity = await this.realizedRepo.findOne({ where: { id, organizationId } });
        if (!entity) {
            throw new NotFoundException(ErrorMessages.FINOPS.REALIZED_SAVING_NOT_FOUND);
        }
        await this.realizedRepo.remove(entity);
    }

    async realizeRecommendation(
        organizationId: string,
        recommendationId: string,
        userId: string | null,
        input: RealizeRecommendationInput = {},
    ) {
        const existing = await this.realizedRepo.findOne({
            where: { organizationId, sourceRecommendationId: recommendationId },
        });
        if (existing) {
            throw new ConflictException(ErrorMessages.FINOPS.RECOMMENDATION_ALREADY_REALIZED);
        }

        const rec = await this.recommendationRepo.findOne({
            where: { id: recommendationId, organizationId },
        });
        if (!rec) {
            throw new NotFoundException(ErrorMessages.FINOPS.RECOMMENDATION_NOT_FOUND);
        }

        const monthlyAmount =
            input.monthlyAmount != null && input.monthlyAmount > 0
                ? input.monthlyAmount
                : rec.potentialSaving != null
                  ? Number(rec.potentialSaving)
                  : null;

        if (monthlyAmount == null || !(monthlyAmount > 0)) {
            throw new BadRequestException(ErrorMessages.FINOPS.POTENTIAL_SAVING_REQUIRED);
        }

        const executedAt = input.executedAt ?? new Date().toISOString().slice(0, 10);
        const description =
            input.description?.trim() ||
            rec.recommendation?.trim() ||
            rec.description?.trim() ||
            'Economia realizada a partir de recomendação';

        const resourceNames = [rec.resourceId, rec.resourceType].filter(
            (value): value is string => Boolean(value && value.trim()),
        );

        return this.dataSource.transaction(async (manager) => {
            await manager.update(FinopsRecommendation, { id: rec.id, organizationId }, { status: 'resolved' });

            const entity = manager.create(FinopsRealizedSaving, {
                organizationId,
                cloudAccountId: rec.cloudAccountId,
                provider: rec.cloudProvider,
                resourceNames: resourceNames.length > 0 ? resourceNames : [rec.resourceId || 'resource'],
                monthlyAmount,
                currency: rec.currency || 'USD',
                description,
                executedAt,
                source: 'recommendation',
                sourceRecommendationId: rec.id,
                sourceCommitmentRecommendationId: null,
                createdByUserId: userId,
            });

            const saved = await manager.save(entity);
            return this.mapRow(saved);
        });
    }

    async getProjection(organizationId: string, filter: RealizedSavingsFilter = {}) {
        const accountIds = await this.resolveAccountIds(organizationId, filter);
        const { periodStart, periodEnd } = this.resolvePeriod(filter.periodStart, filter.periodEnd);
        const forecastMonths = 3;

        if (accountIds.length === 0) {
            return {
                currency: 'USD',
                points: [],
                totals: {
                    totalSaved: 0,
                    potentialOpen: 0,
                    currentWithout: 0,
                    currentWith: 0,
                },
            };
        }

        const today = new Date();
        const currentYm = monthKey(today);
        const historyEndYm = periodEnd.slice(0, 7) < currentYm ? periodEnd.slice(0, 7) : currentYm;
        const historyStartYm = periodStart.slice(0, 7);
        const historyMonths =
            historyStartYm <= historyEndYm ? monthsInclusive(historyStartYm, historyEndYm) : [];

        const [costByMonth, realizedRows, openPotential] = await Promise.all([
            this.sumCostsByMonth(organizationId, accountIds, periodStart, periodEnd),
            this.loadRealizedForAccounts(organizationId, accountIds, filter.provider, periodEnd),
            this.sumOpenPotentialMonthly(organizationId, accountIds, filter.provider),
        ]);

        const realizedByMonth = this.realizedByMonthMap(realizedRows, historyStartYm, historyEndYm);
        const totalSaved = this.sumRealizedInPeriod(realizedRows, periodStart, periodEnd);

        const points: Array<{
            month: string;
            withoutSavings: number;
            withSavings: number;
            realizedSavings: number;
            openPotential: number;
            phase: 'historical' | 'forecast';
        }> = [];

        for (const month of historyMonths) {
            const cost = costByMonth.get(month) ?? 0;
            const realized = realizedByMonth.get(month) ?? 0;
            points.push({
                month,
                withoutSavings: cost + realized,
                withSavings: cost,
                realizedSavings: realized,
                openPotential: 0,
                phase: 'historical',
            });
        }

        const forecastMap = await this.aggregateForecastNextMonths(
            organizationId,
            accountIds,
            forecastMonths,
        );

        const futureStart = addMonths(parseMonthStart(currentYm), 1);
        for (let i = 0; i < forecastMonths; i++) {
            const month = monthKey(addMonths(futureStart, i));
            const forecast = forecastMap.get(month) ?? 0;
            points.push({
                month,
                withoutSavings: forecast,
                withSavings: Math.max(0, forecast - openPotential.amount),
                realizedSavings: 0,
                openPotential: openPotential.amount,
                phase: 'forecast',
            });
        }

        const currentPoint = points.find((p) => p.month === currentYm && p.phase === 'historical');
        const currency = openPotential.currency || realizedRows[0]?.currency || 'USD';

        return {
            currency,
            points,
            totals: {
                totalSaved,
                potentialOpen: openPotential.amount,
                currentWithout: currentPoint?.withoutSavings ?? 0,
                currentWith: currentPoint?.withSavings ?? 0,
            },
        };
    }

    private mapRow(row: FinopsRealizedSaving) {
        return {
            id: row.id,
            organizationId: row.organizationId,
            cloudAccountId: row.cloudAccountId,
            provider: row.provider,
            resourceNames: Array.isArray(row.resourceNames) ? row.resourceNames : [],
            monthlyAmount: Number(row.monthlyAmount),
            currency: row.currency,
            description: row.description,
            executedAt: row.executedAt,
            source: row.source,
            sourceRecommendationId: row.sourceRecommendationId,
            sourceCommitmentRecommendationId: row.sourceCommitmentRecommendationId,
            createdByUserId: row.createdByUserId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    private normalizeResourceNames(names: string[]): string[] {
        return [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 50);
    }

    private resolvePeriod(periodStart?: string, periodEnd?: string) {
        const today = new Date();
        const defaultEnd = today.toISOString().slice(0, 10);
        const sixMonthsAgo = addMonths(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), -5);
        const defaultStart = `${monthKey(sixMonthsAgo)}-01`;
        const start = periodStart && /^\d{4}-\d{2}-\d{2}$/.test(periodStart) ? periodStart : defaultStart;
        const end = periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? periodEnd : defaultEnd;
        return { periodStart: start <= end ? start : end, periodEnd: start <= end ? end : start };
    }

    private sumRealizedInPeriod(
        rows: FinopsRealizedSaving[],
        periodStart: string,
        periodEnd: string,
    ): number {
        let total = 0;
        for (const row of rows) {
            const months = activeMonthsInPeriod(row.executedAt, periodStart, periodEnd);
            total += Number(row.monthlyAmount) * months.length;
        }
        return total;
    }

    private realizedByMonthMap(
        rows: FinopsRealizedSaving[],
        fromYm: string,
        toYm: string,
    ): Map<string, number> {
        const map = new Map<string, number>();
        if (fromYm > toYm) return map;
        for (const row of rows) {
            const months = activeMonthsInPeriod(row.executedAt, `${fromYm}-01`, `${toYm}-28`);
            for (const month of months) {
                map.set(month, (map.get(month) ?? 0) + Number(row.monthlyAmount));
            }
        }
        return map;
    }

    private async loadRealizedForAccounts(
        organizationId: string,
        accountIds: string[],
        provider: string | undefined,
        periodEnd: string,
    ) {
        const qb = this.realizedRepo
            .createQueryBuilder('s')
            .where('s.organizationId = :organizationId', { organizationId })
            .andWhere('s.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('s.executedAt <= :periodEnd', { periodEnd });
        if (provider) {
            qb.andWhere('LOWER(s.provider) = :provider', { provider: provider.toLowerCase() });
        }
        return qb.getMany();
    }

    private async sumCostsByMonth(
        organizationId: string,
        accountIds: string[],
        periodStart: string,
        periodEnd: string,
    ): Promise<Map<string, number>> {
        const qb = this.costRecordRepo
            .createQueryBuilder('cr')
            .select(`to_char(cr."date", 'YYYY-MM')`, 'month')
            .addSelect('COALESCE(SUM(cr.cost), 0)', 'total')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('cr.date >= :periodStart', { periodStart })
            .andWhere('cr.date <= :periodEnd', { periodEnd })
            .andWhere('cr.granularity = :gran', { gran: 'daily' });
        andWhereServiceLevelCost(qb, 'cr');

        const rows = await qb
            .groupBy(`to_char(cr."date", 'YYYY-MM')`)
            .getRawMany<{ month: string; total: string }>();

        const map = new Map<string, number>();
        for (const row of rows) {
            map.set(row.month, Number(row.total) || 0);
        }
        return map;
    }

    private async sumOpenPotentialMonthly(
        organizationId: string,
        accountIds: string[],
        provider?: string,
    ): Promise<{ amount: number; currency: string }> {
        const wasteQb = this.recommendationRepo
            .createQueryBuilder('r')
            .select('COALESCE(SUM(r.potentialSaving), 0)', 'total')
            .addSelect('MAX(r.currency)', 'currency')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('r.status = :status', { status: 'open' });
        if (provider) {
            wasteQb.andWhere('LOWER(r.cloudProvider) = :provider', { provider: provider.toLowerCase() });
        }

        const commitQb = this.commitmentRecRepo
            .createQueryBuilder('c')
            .select('COALESCE(SUM(c.estimatedMonthlySavings), 0)', 'total')
            .addSelect('MAX(c.currency)', 'currency')
            .where('c.organizationId = :organizationId', { organizationId })
            .andWhere('c.cloudAccountId IN (:...accountIds)', { accountIds })
            .andWhere('c.eligible = true')
            .andWhere('c.estimatedMonthlySavings IS NOT NULL')
            .andWhere('c.estimatedMonthlySavings > 0');
        if (provider) {
            commitQb.andWhere('LOWER(c.provider) = :provider', { provider: provider.toLowerCase() });
        }

        const [waste, commit] = await Promise.all([
            wasteQb.getRawOne<{ total: string; currency: string | null }>(),
            commitQb.getRawOne<{ total: string; currency: string | null }>(),
        ]);

        return {
            amount: (Number(waste?.total) || 0) + (Number(commit?.total) || 0),
            currency: waste?.currency || commit?.currency || 'USD',
        };
    }

    private async aggregateForecastNextMonths(
        organizationId: string,
        accountIds: string[],
        months: number,
    ): Promise<Map<string, number>> {
        const map = new Map<string, number>();
        const results = await Promise.all(
            accountIds.map(async (cloudAccountId) => {
                try {
                    return await this.forecastService.forecastNextMonths(
                        organizationId,
                        cloudAccountId,
                        months,
                    );
                } catch (error) {
                    this.logger.warn(
                        `[projection] forecast failed for ${cloudAccountId}: ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                    );
                    return [];
                }
            }),
        );

        for (const rows of results) {
            for (const row of rows) {
                map.set(row.month, (map.get(row.month) ?? 0) + Number(row.forecastedCost || 0));
            }
        }
        return map;
    }

    private async resolveAccountIds(
        organizationId: string,
        filter: RealizedSavingsFilter,
    ): Promise<string[]> {
        const qb = this.cloudAccountRepo
            .createQueryBuilder('ca')
            .where('(ca.tenantId = :organizationId OR ca.organizationId = :organizationId)', {
                organizationId,
            })
            .andWhere('LOWER(ca.provider) IN (:...providers)', {
                providers: ['aws', 'azure', 'gcp'],
            });

        if (filter.cloudAccountId) {
            qb.andWhere('ca.id = :cloudAccountId', { cloudAccountId: filter.cloudAccountId });
        } else if (filter.cloudAccountIds) {
            const ids = filter.cloudAccountIds
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean);
            if (ids.length === 0) return [];
            qb.andWhere('ca.id IN (:...ids)', { ids });
        }

        if (filter.provider) {
            qb.andWhere('LOWER(ca.provider) = :provider', { provider: filter.provider.toLowerCase() });
        }

        const accounts = await qb.getMany();
        return accounts.map((a) => a.id);
    }
}
