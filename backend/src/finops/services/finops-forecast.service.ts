import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsForecastSnapshot } from '../../db/entites/finops-forecast-snapshot.entity';
import { AwsFinopsProvider } from '../providers/aws-finops.provider';
import { AzureFinopsProvider } from '../providers/azure-finops.provider';
import type {
    FinopsProviderCredentials,
    ProviderMonthForecast,
} from '../providers/finops-provider.interface';
import { andWhereServiceLevelCost } from '../utils/service-level-cost';

export interface ForecastResult {
    cloudAccountId: string;
    periodStart: string;
    periodEnd: string;
    forecastedCost: number;
    avgDailyCost: number;
    daysElapsed: number;
    daysRemaining: number;
    currency: string;
    confidence: 'low' | 'medium' | 'high';
    /** provider = número do Cost Explorer / Cost Management. linear = média local. */
    source: 'provider' | 'linear';
    provider: 'aws' | 'azure' | 'gcp' | null;
    byService: Array<{ service: string; forecastedCost: number }>;
}

export interface ForecastMonthProjection {
    month: string;
    forecastedCost: number;
    currency: string;
    source: 'provider' | 'linear';
}

@Injectable()
export class FinopsForecastService {
    private readonly logger = new Logger(FinopsForecastService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,
        @InjectRepository(FinopsForecastSnapshot)
        private readonly snapshotRepo: Repository<FinopsForecastSnapshot>,
        private readonly awsProvider: AwsFinopsProvider,
        private readonly azureProvider: AzureFinopsProvider,
    ) {}

    /**
     * Coleta a previsão do provedor (ou linear) e persiste.
     * Chamado apenas no sync FinOps — leituras usam o snapshot.
     */
    async syncFromProvider(
        organizationId: string,
        cloudAccountId: string,
        cloudProvider: string,
        providerCreds: FinopsProviderCredentials,
    ): Promise<void> {
        const provider =
            cloudProvider === 'aws' || cloudProvider === 'azure' || cloudProvider === 'gcp' ? cloudProvider : null;
        const linear = await this.linearCurrentMonth(organizationId, cloudAccountId);
        let current: ForecastResult = { ...linear, source: 'linear', provider };

        if (provider === 'aws' || provider === 'azure') {
            try {
                const forecast =
                    provider === 'aws'
                        ? await this.awsProvider.forecastMonthEnd(providerCreds)
                        : await this.azureProvider.forecastMonthEnd(providerCreds);
                const totalDays = Math.max(linear.daysElapsed + linear.daysRemaining, 1);
                this.logger.log(
                    `[Forecast] ${provider} ${cloudAccountId}: previsão do provedor=${forecast.amount.toFixed(2)} ${forecast.currency}`,
                );
                current = {
                    ...linear,
                    forecastedCost: forecast.amount,
                    avgDailyCost: forecast.amount / totalDays,
                    currency: forecast.currency || linear.currency,
                    confidence: 'high',
                    source: 'provider',
                    provider,
                    byService: scaleToTotal(linear.byService, forecast.amount),
                };
            } catch (error) {
                this.logger.warn(
                    `[Forecast] ${provider} ${cloudAccountId} indisponível no sync, usando projeção linear: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }

        const syncedAt = new Date();
        const currentMonth = current.periodStart.slice(0, 7);

        await this.snapshotRepo.upsert(
            {
                organizationId,
                cloudAccountId,
                provider: provider ?? cloudProvider,
                horizon: 'current_month',
                month: currentMonth,
                forecastedCost: current.forecastedCost,
                avgDailyCost: current.avgDailyCost,
                currency: current.currency,
                source: current.source,
                confidence: current.confidence,
                daysElapsed: current.daysElapsed,
                daysRemaining: current.daysRemaining,
                periodStart: current.periodStart,
                periodEnd: current.periodEnd,
                byService: current.byService,
                syncedAt,
            },
            {
                conflictPaths: ['cloudAccountId', 'horizon', 'month'],
                skipUpdateIfNoValuesChanged: false,
            },
        );

        let upcoming: ForecastMonthProjection[] = [];
        if (provider === 'aws') {
            try {
                const rows = await this.awsProvider.forecastUpcomingMonths(providerCreds, 3);
                if (rows.length > 0) upcoming = rows.slice(0, 3).map(toProviderMonth);
            } catch (error) {
                this.logger.warn(
                    `[Forecast] Próximos meses AWS ${cloudAccountId} indisponíveis no sync: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
        if (upcoming.length === 0) {
            const linearUpcoming = await this.linearNextMonths(organizationId, cloudAccountId, 3);
            upcoming = linearUpcoming.map((row) => ({ ...row, source: 'linear' as const }));
        }

        await this.snapshotRepo.delete({
            organizationId,
            cloudAccountId,
            horizon: 'upcoming',
        });

        if (upcoming.length > 0) {
            await this.snapshotRepo.insert(
                upcoming.map((row) => ({
                    organizationId,
                    cloudAccountId,
                    provider: provider ?? cloudProvider,
                    horizon: 'upcoming' as const,
                    month: row.month,
                    forecastedCost: row.forecastedCost,
                    avgDailyCost: null,
                    currency: row.currency,
                    source: row.source,
                    confidence: null,
                    daysElapsed: null,
                    daysRemaining: null,
                    periodStart: null,
                    periodEnd: null,
                    byService: null,
                    syncedAt,
                })),
            );
        }
    }

    /**
     * Fim do mês corrente a partir do snapshot do último sync.
     * Sem snapshot → projeção linear local (para agregar várias contas no overview).
     */
    async forecastCurrentMonth(organizationId: string, cloudAccountId: string): Promise<ForecastResult | null> {
        const month = currentUtcMonth();
        const row = await this.snapshotRepo.findOne({
            where: {
                organizationId,
                cloudAccountId,
                horizon: 'current_month',
                month,
            },
        });
        if (!row) {
            const linear = await this.linearCurrentMonth(organizationId, cloudAccountId);
            return linear.forecastedCost > 0 ? linear : null;
        }

        const provider =
            row.provider === 'aws' || row.provider === 'azure' || row.provider === 'gcp' ? row.provider : null;

        return {
            cloudAccountId,
            periodStart: toDateString(row.periodStart) ?? `${month}-01`,
            periodEnd: toDateString(row.periodEnd) ?? lastDayOfMonth(month),
            forecastedCost: Number(row.forecastedCost),
            avgDailyCost: Number(row.avgDailyCost ?? 0),
            daysElapsed: row.daysElapsed ?? 0,
            daysRemaining: row.daysRemaining ?? 0,
            currency: row.currency,
            confidence: row.confidence ?? 'low',
            source: row.source,
            provider,
            byService: row.byService ?? [],
        };
    }

    /**
     * Próximos meses a partir do snapshot do último sync.
     */
    async forecastNextMonths(
        organizationId: string,
        cloudAccountId: string,
        months = 3,
    ): Promise<ForecastMonthProjection[]> {
        const count = Number.isFinite(months) && months > 0 ? Math.min(Math.trunc(months), 12) : 3;
        const rows = await this.snapshotRepo.find({
            where: {
                organizationId,
                cloudAccountId,
                horizon: 'upcoming',
            },
            order: { month: 'ASC' },
            take: count,
        });

        return rows.map((row) => ({
            month: row.month,
            forecastedCost: Number(row.forecastedCost),
            currency: row.currency,
            source: row.source,
        }));
    }

    private async linearCurrentMonth(organizationId: string, cloudAccountId: string): Promise<ForecastResult> {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth() + 1;

        const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const today = now.toISOString().slice(0, 10);

        const lastDay = new Date(Date.UTC(year, month, 0));
        const periodEnd = lastDay.toISOString().slice(0, 10);
        const totalDays = lastDay.getUTCDate();

        const daysElapsed = now.getUTCDate();
        const daysRemaining = totalDays - daysElapsed;

        const totalQb = this.costRecordRepo
            .createQueryBuilder('cr')
            .select('SUM(cr.cost)', 'totalCost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: periodStart })
            .andWhere('cr.date <= :today', { today })
            .andWhere('cr.granularity = :gran', { gran: 'daily' });
        andWhereServiceLevelCost(totalQb, 'cr');

        const result = await totalQb.groupBy('cr.currency').getRawOne<{ totalCost: string; currency: string }>();

        const totalSoFar = Number(result?.totalCost ?? 0);
        const currency = result?.currency ?? 'USD';
        const avgDailyCost = daysElapsed > 0 ? totalSoFar / daysElapsed : 0;
        const forecastedCost = avgDailyCost * totalDays;

        const serviceQb = this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'service')
            .addSelect('SUM(cr.cost)', 'totalCost')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: periodStart })
            .andWhere('cr.date <= :today', { today })
            .andWhere('cr.granularity = :gran', { gran: 'daily' });
        andWhereServiceLevelCost(serviceQb, 'cr');

        const serviceRows = await serviceQb
            .groupBy('cr.service')
            .orderBy('"totalCost"', 'DESC')
            .limit(10)
            .getRawMany<{ service: string; totalCost: string }>();

        const byService = serviceRows.map((row) => ({
            service: row.service,
            forecastedCost: (Number(row.totalCost) / Math.max(daysElapsed, 1)) * totalDays,
        }));

        const confidence: ForecastResult['confidence'] = daysElapsed >= 14 ? 'high' : daysElapsed >= 7 ? 'medium' : 'low';

        return {
            cloudAccountId,
            periodStart,
            periodEnd,
            forecastedCost,
            avgDailyCost,
            daysElapsed,
            daysRemaining,
            currency,
            confidence,
            source: 'linear',
            provider: null,
            byService,
        };
    }

    private async linearNextMonths(
        organizationId: string,
        cloudAccountId: string,
        months: number,
    ): Promise<Array<{ month: string; forecastedCost: number; currency: string }>> {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
        const baseDate = threeMonthsAgo.toISOString().slice(0, 10);

        const baseQb = this.costRecordRepo
            .createQueryBuilder('cr')
            .select('SUM(cr.cost)', 'totalCost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :baseDate', { baseDate })
            .andWhere('cr.granularity = :gran', { gran: 'daily' });
        andWhereServiceLevelCost(baseQb, 'cr');

        const result = await baseQb.groupBy('cr.currency').getRawOne<{ totalCost: string; currency: string }>();

        const totalCost = Number(result?.totalCost ?? 0);
        const currency = result?.currency ?? 'USD';
        const avgMonthly = totalCost / 3;

        const projections: Array<{ month: string; forecastedCost: number; currency: string }> = [];
        const now = new Date();

        for (let i = 1; i <= months; i++) {
            const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
            const monthStr = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`;
            projections.push({ month: monthStr, forecastedCost: avgMonthly, currency });
        }

        return projections;
    }
}

function scaleToTotal(
    rows: Array<{ service: string; forecastedCost: number }>,
    target: number,
): Array<{ service: string; forecastedCost: number }> {
    const current = rows.reduce((sum, row) => sum + row.forecastedCost, 0);
    if (current <= 0 || !Number.isFinite(target)) return rows;
    const factor = target / current;
    return rows.map((row) => ({ service: row.service, forecastedCost: row.forecastedCost * factor }));
}

function toProviderMonth(row: ProviderMonthForecast): ForecastMonthProjection {
    return { month: row.month, forecastedCost: row.amount, currency: row.currency, source: 'provider' };
}

function currentUtcMonth(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function lastDayOfMonth(month: string): string {
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    const last = new Date(Date.UTC(year, monthNum, 0));
    return last.toISOString().slice(0, 10);
}

function toDateString(value: string | Date | null | undefined): string | null {
    if (value == null) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}
