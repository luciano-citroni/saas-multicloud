import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';

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
    byService: Array<{ service: string; forecastedCost: number }>;
}

@Injectable()
export class FinopsForecastService {
    private readonly logger = new Logger(FinopsForecastService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,
    ) {}

    /**
     * Forecast para o mês corrente baseado nos dados do mês até hoje.
     * forecast = avg_daily_cost * dias_totais_do_mês
     */
    async forecastCurrentMonth(
        organizationId: string,
        cloudAccountId: string,
    ): Promise<ForecastResult> {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth() + 1;

        const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const today = now.toISOString().slice(0, 10);

        // Último dia do mês
        const lastDay = new Date(Date.UTC(year, month, 0));
        const periodEnd = lastDay.toISOString().slice(0, 10);
        const totalDays = lastDay.getUTCDate();

        // Dias decorridos (incluindo hoje)
        const daysElapsed = now.getUTCDate();
        const daysRemaining = totalDays - daysElapsed;

        // Custo total até hoje
        const result = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('SUM(cr.cost)', 'totalCost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: periodStart })
            .andWhere('cr.date <= :today', { today })
            .andWhere('cr.granularity = :gran', { gran: 'daily' })
            .groupBy('cr.currency')
            .getRawOne<{ totalCost: string; currency: string }>();

        const totalSoFar = Number(result?.totalCost ?? 0);
        const currency = result?.currency ?? 'USD';
        const avgDailyCost = daysElapsed > 0 ? totalSoFar / daysElapsed : 0;
        const forecastedCost = avgDailyCost * totalDays;

        // Por serviço
        const serviceRows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'service')
            .addSelect('SUM(cr.cost)', 'totalCost')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: periodStart })
            .andWhere('cr.date <= :today', { today })
            .andWhere('cr.granularity = :gran', { gran: 'daily' })
            .groupBy('cr.service')
            .orderBy('"totalCost"', 'DESC')
            .limit(10)
            .getRawMany<{ service: string; totalCost: string }>();

        const byService = serviceRows.map((row) => ({
            service: row.service,
            forecastedCost: (Number(row.totalCost) / Math.max(daysElapsed, 1)) * totalDays,
        }));

        // Confiança baseada na quantidade de dados disponíveis
        const confidence: ForecastResult['confidence'] =
            daysElapsed >= 14 ? 'high' : daysElapsed >= 7 ? 'medium' : 'low';

        this.logger.log(
            `[Forecast] Conta ${cloudAccountId}: custo até agora=${totalSoFar.toFixed(2)}, forecast=${forecastedCost.toFixed(2)} ${currency}`,
        );

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
            byService,
        };
    }

    /**
     * Projeção para os próximos N meses baseada na média mensal histórica.
     */
    async forecastNextMonths(
        organizationId: string,
        cloudAccountId: string,
        months = 3,
    ): Promise<Array<{ month: string; forecastedCost: number; currency: string }>> {
        // Média dos últimos 3 meses para base de projeção
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
        const baseDate = threeMonthsAgo.toISOString().slice(0, 10);

        const result = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('SUM(cr.cost)', 'totalCost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :baseDate', { baseDate })
            .andWhere('cr.granularity = :gran', { gran: 'daily' })
            .groupBy('cr.currency')
            .getRawOne<{ totalCost: string; currency: string }>();

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
