import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AiKnowledgeChunk } from '../../db/entites/ai-knowledge-chunk.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import type { AnomalySeverity, AnomalyStatus } from '../../db/entites/finops-cost-anomaly.entity';
import { accumulateOrgKnowledgeRules } from '../../cloud-intelligence/knowledge/knowledge-rule.schema';
import { andWhereServiceLevelCost } from '../utils/service-level-cost';

const DEFAULT_ANOMALY_THRESHOLD = 1.3; // 30% acima da média → anomalia
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

        @InjectRepository(AiKnowledgeChunk)
        private readonly knowledgeChunkRepo: Repository<AiKnowledgeChunk>,
    ) {}

    private async resolveAnomalyThreshold(organizationId: string): Promise<number> {
        const rows = await this.knowledgeChunkRepo.find({
            where: { organizationId },
            order: { updatedAt: 'DESC' },
            take: 200,
        });
        const rules = accumulateOrgKnowledgeRules(rows);
        return rules.finops.anomalyMultiplier ?? DEFAULT_ANOMALY_THRESHOLD;
    }

    /**
     * Recalcula a janela recente a cada sync: apaga as anomalias do intervalo
     * e grava de novo a partir do custo diário. O que saiu da regra não fica.
     * Status reconhecido/resolvido da mesma chave é preservado.
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
        const start = new Date(end);
        start.setUTCDate(end.getUTCDate() - (days - 1));
        const startDate = start.toISOString().slice(0, 10);
        const normalizedEnd = end.toISOString().slice(0, 10);
        const preservedStatus = await this.replaceWindow(organizationId, cloudAccountId, startDate, normalizedEnd);

        let detected = 0;

        for (let offset = days - 1; offset >= 0; offset--) {
            const day = new Date(end);
            day.setUTCDate(end.getUTCDate() - offset);
            const dateStr = day.toISOString().slice(0, 10);
            detected += await this.detectForDate(
                organizationId,
                cloudAccountId,
                cloudProvider,
                dateStr,
                preservedStatus,
            );
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
        preservedStatus?: Map<string, AnomalyStatus>,
    ): Promise<number> {
        const target = new Date(targetDate + 'T00:00:00Z');
        const baselineStart = new Date(target);
        baselineStart.setUTCDate(target.getUTCDate() - BASELINE_LOOKBACK_DAYS);

        const baselineStartStr = baselineStart.toISOString().slice(0, 10);
        const oneDayBeforeTarget = new Date(target);
        oneDayBeforeTarget.setUTCDate(target.getUTCDate() - 1);
        const oneDayBeforeStr = oneDayBeforeTarget.toISOString().slice(0, 10);

        // Custo por serviço no dia alvo. Região/serviço nulos viram '' para
        // bater na unique key (NULL não conflita com NULL no Postgres).
        // Moedas diferentes do mesmo serviço+região são somadas: a chave não tem moeda.
        const todayQb = this.costRecordRepo
            .createQueryBuilder('cr')
            .select("COALESCE(cr.service, '')", 'service')
            .addSelect("COALESCE(cr.region, '')", 'region')
            .addSelect("COALESCE(cr.currency, 'USD')", 'currency')
            .addSelect('SUM(cr.cost)', 'totalCost')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date = :date', { date: targetDate })
            .andWhere('cr.granularity = :gran', { gran: 'daily' });
        andWhereServiceLevelCost(todayQb, 'cr');

        const todayRows = await todayQb
            .groupBy("COALESCE(cr.service, '')")
            .addGroupBy("COALESCE(cr.region, '')")
            .addGroupBy("COALESCE(cr.currency, 'USD')")
            .getRawMany<{ service: string; region: string; currency: string; totalCost: string }>();

        const todayByKey = new Map<string, { service: string; region: string; currency: string; actualCost: number; currencyWeight: number }>();
        for (const row of todayRows) {
            const service = row.service ?? '';
            const region = row.region ?? '';
            const key = `${service}:${region}`;
            const actualCost = Number(row.totalCost);
            const existing = todayByKey.get(key);
            if (!existing) {
                todayByKey.set(key, {
                    service,
                    region,
                    currency: row.currency || 'USD',
                    actualCost,
                    currencyWeight: actualCost,
                });
                continue;
            }
            existing.actualCost += actualCost;
            if (actualCost > existing.currencyWeight) {
                existing.currency = row.currency || existing.currency;
                existing.currencyWeight = actualCost;
            }
        }

        // Média diária nos até 90 dias anteriores por serviço/região
        const avgRows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select("COALESCE(cr.service, '')", 'service')
            .addSelect("COALESCE(cr.region, '')", 'region')
            .addSelect('AVG(daily.daily_cost)', 'avg_cost')
            .from(
                (qb) => {
                    const subQb = qb
                        .select("COALESCE(cr2.service, '')", 'service')
                        .addSelect("COALESCE(cr2.region, '')", 'region')
                        .addSelect('cr2.date', 'date')
                        .addSelect('SUM(cr2.cost)', 'daily_cost')
                        .from(FinopsCostRecord, 'cr2')
                        .where('cr2.organizationId = :organizationId', { organizationId })
                        .andWhere('cr2.cloudAccountId = :cloudAccountId', { cloudAccountId })
                        .andWhere('cr2.date >= :from', { from: baselineStartStr })
                        .andWhere('cr2.date <= :to', { to: oneDayBeforeStr })
                        .andWhere('cr2.granularity = :gran', { gran: 'daily' });
                    andWhereServiceLevelCost(subQb, 'cr2');

                    return subQb
                        .groupBy("COALESCE(cr2.service, '')")
                        .addGroupBy("COALESCE(cr2.region, '')")
                        .addGroupBy('cr2.date');
                },
                'daily',
            )
            .where("COALESCE(cr.service, '') = daily.service")
            .andWhere("COALESCE(cr.region, '') = daily.region")
            .groupBy("COALESCE(cr.service, '')")
            .addGroupBy("COALESCE(cr.region, '')")
            .getRawMany<{ service: string; region: string; avg_cost: string }>();

        const avgMap = new Map<string, number>();
        for (const row of avgRows) {
            avgMap.set(`${row.service}:${row.region}`, Number(row.avg_cost));
        }

        let detected = 0;
        const anomalyThreshold = await this.resolveAnomalyThreshold(organizationId);

        for (const today of todayByKey.values()) {
            const key = `${today.service}:${today.region}`;
            const avgCost = avgMap.get(key) ?? 0;
            const actualCost = today.actualCost;
            const financialImpact = actualCost - avgCost;

            if (
                avgCost > 0 &&
                actualCost > avgCost * anomalyThreshold &&
                financialImpact >= MIN_FINANCIAL_IMPACT
            ) {
                const rawDeviation = ((actualCost - avgCost) / avgCost) * 100;
                const deviationPercentage = Math.min(rawDeviation, MAX_DEVIATION_PERCENTAGE);
                const severity = this.computeSeverity(deviationPercentage);
                const status = preservedStatus?.get(`${today.service}:${today.region}:${targetDate}`) ?? 'open';

                await this.anomalyRepo.upsert(
                    {
                        organizationId,
                        cloudAccountId,
                        cloudProvider,
                        service: today.service,
                        region: today.region,
                        anomalyDate: targetDate,
                        expectedCost: avgCost,
                        actualCost,
                        deviationPercentage,
                        financialImpact,
                        severity,
                        status,
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

    /**
     * Apaga a janela e devolve o status já dado pelo usuário (acknowledged/resolved),
     * para o recálculo não reabrir o que foi reconhecido.
     */
    private async replaceWindow(
        organizationId: string,
        cloudAccountId: string,
        startDate: string,
        endDate: string,
    ): Promise<Map<string, AnomalyStatus>> {
        const existing = await this.anomalyRepo
            .createQueryBuilder('a')
            .select('a.service', 'service')
            .addSelect('a.region', 'region')
            .addSelect('a.anomalyDate', 'anomalyDate')
            .addSelect('a.status', 'status')
            .where('a.organizationId = :organizationId', { organizationId })
            .andWhere('a.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('a.anomalyDate >= :startDate', { startDate })
            .andWhere('a.anomalyDate <= :endDate', { endDate })
            .getRawMany<{ service: string; region: string | null; anomalyDate: string | Date; status: AnomalyStatus }>();

        const preserved = new Map<string, AnomalyStatus>();
        for (const row of existing) {
            if (row.status === 'open') continue;
            const rawDate = row.anomalyDate instanceof Date
                ? row.anomalyDate.toISOString().slice(0, 10)
                : String(row.anomalyDate);
            const date = /^(\d{4}-\d{2}-\d{2})/.exec(rawDate)?.[1] ?? rawDate.slice(0, 10);
            preserved.set(`${row.service}:${row.region ?? ''}:${date}`, row.status);
        }

        await this.anomalyRepo
            .createQueryBuilder()
            .delete()
            .from(FinopsCostAnomaly)
            .where('organization_id = :organizationId', { organizationId })
            .andWhere('cloud_account_id = :cloudAccountId', { cloudAccountId })
            .andWhere('anomaly_date >= :startDate', { startDate })
            .andWhere('anomaly_date <= :endDate', { endDate })
            .execute();

        return preserved;
    }

    /**
     * Recalcula a janela recente a partir dos custos diários já gravados.
     * Não chama o provedor.
     */
    async rebuildAllFromStoredCosts(): Promise<{ accounts: number; detected: number }> {
        const rows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.organizationId', 'organizationId')
            .addSelect('cr.cloudAccountId', 'cloudAccountId')
            .addSelect('cr.cloudProvider', 'cloudProvider')
            .addSelect('MAX(cr.date)', 'endDate')
            .where('cr.granularity = :gran', { gran: 'daily' })
            .groupBy('cr.organizationId')
            .addGroupBy('cr.cloudAccountId')
            .addGroupBy('cr.cloudProvider')
            .getRawMany<{
                organizationId: string;
                cloudAccountId: string;
                cloudProvider: string;
                endDate: string | Date;
            }>();

        let detected = 0;
        for (const row of rows) {
            const endDate = row.endDate instanceof Date
                ? row.endDate.toISOString().slice(0, 10)
                : String(row.endDate).slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) continue;
            detected += await this.detectRecentWindow(
                row.organizationId,
                row.cloudAccountId,
                row.cloudProvider,
                endDate,
            );
        }

        this.logger.log(
            `[Anomaly] Recálculo a partir dos custos diários: ${rows.length} conta(s), ${detected} anomalia(s)`,
        );
        return { accounts: rows.length, detected };
    }

    private computeSeverity(deviationPercentage: number): AnomalySeverity {
        if (deviationPercentage >= 200) return 'critical';
        if (deviationPercentage >= 100) return 'high';
        if (deviationPercentage >= 50) return 'medium';
        return 'low';
    }
}
