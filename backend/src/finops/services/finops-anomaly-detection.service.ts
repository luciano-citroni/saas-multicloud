import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import type { AnomalySeverity } from '../../db/entites/finops-cost-anomaly.entity';

const ANOMALY_THRESHOLD = 1.3; // 30% acima da média → anomalia

@Injectable()
export class FinopsAnomalyDetectionService {
    private readonly logger = new Logger(FinopsAnomalyDetectionService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(FinopsCostAnomaly)
        private readonly anomalyRepo: Repository<FinopsCostAnomaly>,
    ) {}

    /**
     * Detecta anomalias para o dia especificado comparando com a média dos 7 dias anteriores.
     * Regra: cost_today > avg_last_7_days * 1.3 → anomalia
     */
    async detectForDate(
        organizationId: string,
        cloudAccountId: string,
        cloudProvider: string,
        targetDate: string,
    ): Promise<number> {
        const target = new Date(targetDate + 'T00:00:00Z');
        const sevenDaysAgo = new Date(target);
        sevenDaysAgo.setUTCDate(target.getUTCDate() - 7);

        const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
        const oneDayBeforeTarget = new Date(target);
        oneDayBeforeTarget.setUTCDate(target.getUTCDate() - 1);
        const oneDayBeforeStr = oneDayBeforeTarget.toISOString().slice(0, 10);

        // Custo por serviço no dia alvo
        const todayRows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'service')
            .addSelect('cr.region', 'region')
            .addSelect('cr.currency', 'currency')
            .addSelect('SUM(cr.cost)', 'totalCost')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date = :date', { date: targetDate })
            .andWhere('cr.granularity = :gran', { gran: 'daily' })
            .groupBy('cr.service')
            .addGroupBy('cr.region')
            .addGroupBy('cr.currency')
            .getRawMany<{ service: string; region: string; currency: string; totalCost: string }>();

        // Média dos 7 dias anteriores por serviço
        // Aliases em snake_case para evitar discrepância de case no PostgreSQL
        const avgRows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'service')
            .addSelect('cr.region', 'region')
            .addSelect('AVG(daily.daily_cost)', 'avg_cost')
            .from(
                (qb) =>
                    qb
                        .select('cr2.service', 'service')
                        .addSelect('cr2.region', 'region')
                        .addSelect('cr2.date', 'date')
                        .addSelect('SUM(cr2.cost)', 'daily_cost')
                        .from(FinopsCostRecord, 'cr2')
                        .where('cr2.organizationId = :organizationId', { organizationId })
                        .andWhere('cr2.cloudAccountId = :cloudAccountId', { cloudAccountId })
                        .andWhere('cr2.date >= :from', { from: sevenDaysAgoStr })
                        .andWhere('cr2.date <= :to', { to: oneDayBeforeStr })
                        .andWhere('cr2.granularity = :gran', { gran: 'daily' })
                        .groupBy('cr2.service')
                        .addGroupBy('cr2.region')
                        .addGroupBy('cr2.date'),
                'daily',
            )
            .where('cr.service = daily.service')
            .andWhere('cr.region = daily.region')
            .groupBy('cr.service')
            .addGroupBy('cr.region')
            .getRawMany<{ service: string; region: string; avg_cost: string }>();

        const avgMap = new Map<string, number>();
        for (const row of avgRows) {
            avgMap.set(`${row.service}:${row.region}`, Number(row.avg_cost));
        }

        let detected = 0;

        for (const today of todayRows) {
            const key = `${today.service}:${today.region}`;
            const avgCost = avgMap.get(key) ?? 0;
            const actualCost = Number(today.totalCost);

            if (avgCost > 0 && actualCost > avgCost * ANOMALY_THRESHOLD) {
                const deviationPercentage = ((actualCost - avgCost) / avgCost) * 100;
                const financialImpact = actualCost - avgCost;
                const severity = this.computeSeverity(deviationPercentage);

                // Upsert anomaly (idempotente por data + serviço + região)
                await this.anomalyRepo.upsert(
                    {
                        organizationId,
                        cloudAccountId,
                        cloudProvider,
                        service: today.service,
                        region: today.region,
                        anomalyDate: new Date(targetDate + 'T00:00:00Z'),
                        expectedCost: avgCost,
                        actualCost,
                        deviationPercentage,
                        financialImpact,
                        severity,
                        status: 'open',
                        currency: today.currency,
                        description: `Custo de ${today.service} em ${today.region || 'global'} está ${deviationPercentage.toFixed(1)}% acima da média dos últimos 7 dias`,
                    } as any,
                    {
                        conflictPaths: ['organizationId', 'cloudAccountId', 'service', 'region', 'anomalyDate'],
                        skipUpdateIfNoValuesChanged: false,
                    },
                );

                detected++;

                this.logger.warn(
                    `[Anomaly] ${severity.toUpperCase()} — ${today.service}/${today.region}: atual=${actualCost.toFixed(2)}, esperado=${avgCost.toFixed(2)}, desvio=${deviationPercentage.toFixed(1)}%`,
                );
            }
        }

        return detected;
    }

    async listAnomalies(
        organizationId: string,
        cloudAccountId: string,
        status?: 'open' | 'acknowledged' | 'resolved',
        days = 30,
    ): Promise<FinopsCostAnomaly[]> {
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - days);

        const qb = this.anomalyRepo
            .createQueryBuilder('a')
            .where('a.organizationId = :organizationId', { organizationId })
            .andWhere('a.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('a.anomalyDate >= :since', { since })
            .orderBy('a.severity', 'DESC')
            .addOrderBy('a.anomalyDate', 'DESC');

        if (status) {
            qb.andWhere('a.status = :status', { status });
        }

        return qb.getMany();
    }

    async acknowledgeAnomaly(id: string, organizationId: string): Promise<void> {
        await this.anomalyRepo.update(
            { id, organizationId },
            { status: 'acknowledged' },
        );
    }

    private computeSeverity(deviationPercentage: number): AnomalySeverity {
        if (deviationPercentage >= 200) return 'critical';
        if (deviationPercentage >= 100) return 'high';
        if (deviationPercentage >= 50) return 'medium';
        return 'low';
    }
}
