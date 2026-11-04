import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import type { AnomalySeverity } from '../../db/entites/finops-cost-anomaly.entity';
import { andWhereServiceLevelCost } from '../utils/service-level-cost';

const ANOMALY_THRESHOLD = 1.3; // 30% acima da média → anomalia
/** Histórico diário usado como baseline (≈ 3 meses). */
const BASELINE_LOOKBACK_DAYS = 90;
/** Janela recente em que marcamos anomalias. */
const DETECTION_WINDOW_DAYS = 7;
/** Ignora ruído de custos microscópicos (ex.: CloudFront fracionário). */
const MIN_FINANCIAL_IMPACT = 0.01;
/** Limite de DECIMAL(12,4) — evita numeric field overflow no Postgres. */
const MAX_DEVIATION_PERCENTAGE = 99_999_999.9999;

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
     * Analisa custo diário dos últimos ~3 meses e detecta anomalias
     * apenas nos últimos 7 dias (até endDate, inclusive).
     */
    async detectRecentWindow(
        organizationId: string,
        cloudAccountId: string,
        cloudProvider: string,
        endDate: string,
        detectionDays = DETECTION_WINDOW_DAYS,
    ): Promise<number> {
        const end = new Date(`${endDate}T00:00:00Z`);
        if (Number.isNaN(end.getTime())) {
            this.logger.warn(`[Anomaly] endDate inválida: ${endDate}`);
            return 0;
        }

        const days = Math.max(1, Math.min(detectionDays, DETECTION_WINDOW_DAYS));
        let detected = 0;

        for (let offset = days - 1; offset >= 0; offset--) {
            const day = new Date(end);
            day.setUTCDate(end.getUTCDate() - offset);
            const dateStr = day.toISOString().slice(0, 10);
            detected += await this.detectForDate(organizationId, cloudAccountId, cloudProvider, dateStr);
        }

        this.logger.log(
            `[Anomaly] Janela recente ${days}d até ${endDate}: ${detected} anomalia(s) detectada(s) ` +
                `(baseline diário ${BASELINE_LOOKBACK_DAYS}d)`,
        );

        return detected;
    }

    /**
     * Detecta anomalias para o dia especificado.
     * Baseline: média do custo diário (serviço+região) nos até 90 dias anteriores.
     * Regra: cost_today > avg_baseline * 1.3 → anomalia
     */
    async detectForDate(
        organizationId: string,
        cloudAccountId: string,
        cloudProvider: string,
        targetDate: string,
    ): Promise<number> {
        const target = new Date(targetDate + 'T00:00:00Z');
        const baselineStart = new Date(target);
        baselineStart.setUTCDate(target.getUTCDate() - BASELINE_LOOKBACK_DAYS);

        const baselineStartStr = baselineStart.toISOString().slice(0, 10);
        const oneDayBeforeTarget = new Date(target);
        oneDayBeforeTarget.setUTCDate(target.getUTCDate() - 1);
        const oneDayBeforeStr = oneDayBeforeTarget.toISOString().slice(0, 10);

        // Custo por serviço no dia alvo
        const todayQb = this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'service')
            .addSelect('cr.region', 'region')
            .addSelect('cr.currency', 'currency')
            .addSelect('SUM(cr.cost)', 'totalCost')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date = :date', { date: targetDate })
            .andWhere('cr.granularity = :gran', { gran: 'daily' });
        andWhereServiceLevelCost(todayQb, 'cr');

        const todayRows = await todayQb
            .groupBy('cr.service')
            .addGroupBy('cr.region')
            .addGroupBy('cr.currency')
            .getRawMany<{ service: string; region: string; currency: string; totalCost: string }>();

        // Média diária nos até 90 dias anteriores por serviço/região
        const avgRows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'service')
            .addSelect('cr.region', 'region')
            .addSelect('AVG(daily.daily_cost)', 'avg_cost')
            .from(
                (qb) => {
                    const subQb = qb
                        .select('cr2.service', 'service')
                        .addSelect('cr2.region', 'region')
                        .addSelect('cr2.date', 'date')
                        .addSelect('SUM(cr2.cost)', 'daily_cost')
                        .from(FinopsCostRecord, 'cr2')
                        .where('cr2.organizationId = :organizationId', { organizationId })
                        .andWhere('cr2.cloudAccountId = :cloudAccountId', { cloudAccountId })
                        .andWhere('cr2.date >= :from', { from: baselineStartStr })
                        .andWhere('cr2.date <= :to', { to: oneDayBeforeStr })
                        .andWhere('cr2.granularity = :gran', { gran: 'daily' });
                    andWhereServiceLevelCost(subQb, 'cr2');

                    return subQb.groupBy('cr2.service').addGroupBy('cr2.region').addGroupBy('cr2.date');
                },
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
            const financialImpact = actualCost - avgCost;

            if (
                avgCost > 0 &&
                actualCost > avgCost * ANOMALY_THRESHOLD &&
                financialImpact >= MIN_FINANCIAL_IMPACT
            ) {
                const rawDeviation = ((actualCost - avgCost) / avgCost) * 100;
                const deviationPercentage = Math.min(rawDeviation, MAX_DEVIATION_PERCENTAGE);
                const severity = this.computeSeverity(deviationPercentage);

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
                        description: `Custo de ${today.service} em ${today.region || 'global'} está ${deviationPercentage.toFixed(1)}% acima da média diária dos últimos 3 meses`,
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
