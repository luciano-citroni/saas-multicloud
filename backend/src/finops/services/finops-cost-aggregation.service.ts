import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsCostAggregate } from '../../db/entites/finops-cost-aggregate.entity';

@Injectable()
export class FinopsCostAggregationService {
    private readonly logger = new Logger(FinopsCostAggregationService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(FinopsCostAggregate)
        private readonly aggregateRepo: Repository<FinopsCostAggregate>,
    ) {}

    /**
     * Cria/atualiza agregados mensais para um período específico.
     * Deve ser chamado após cada ingestão de dados.
     */
    async aggregateForPeriod(
        organizationId: string,
        cloudAccountId: string,
        year: number,
        month: number,
    ): Promise<void> {
        const periodStart = new Date(Date.UTC(year, month - 1, 1));
        const periodEnd = new Date(Date.UTC(year, month, 0)); // último dia do mês
        const daysInPeriod = periodEnd.getUTCDate();

        const periodStartStr = periodStart.toISOString().slice(0, 10);
        const periodEndStr = periodEnd.toISOString().slice(0, 10);

        this.logger.log(`[Aggregation] Calculando agregados para ${cloudAccountId} — ${year}-${String(month).padStart(2, '0')}`);

        // Agrupa por service + region + cloudProvider
        const rows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.cloudProvider', 'cloudProvider')
            .addSelect('cr.service', 'service')
            .addSelect('cr.region', 'region')
            .addSelect('cr.currency', 'currency')
            .addSelect('SUM(cr.cost)', 'totalCost')
            .addSelect('COUNT(cr.id)', 'recordCount')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: periodStartStr })
            .andWhere('cr.date <= :end', { end: periodEndStr })
            .andWhere('cr.granularity = :gran', { gran: 'daily' })
            .groupBy('cr.cloudProvider')
            .addGroupBy('cr.service')
            .addGroupBy('cr.region')
            .addGroupBy('cr.currency')
            .getRawMany<{
                cloudProvider: string;
                service: string;
                region: string;
                currency: string;
                totalCost: string;
                recordCount: string;
            }>();

        for (const row of rows) {
            const totalCost = Number(row.totalCost);
            const avgDailyCost = daysInPeriod > 0 ? totalCost / daysInPeriod : 0;

            await this.aggregateRepo.upsert(
                {
                    organizationId,
                    cloudAccountId,
                    cloudProvider: row.cloudProvider,
                    service: row.service,
                    region: row.region,
                    tagKey: '',
                    tagValue: '',
                    periodStart,
                    periodEnd,
                    periodType: 'monthly',
                    totalCost,
                    avgDailyCost,
                    recordCount: Number(row.recordCount),
                    currency: row.currency,
                } as any,
                {
                    conflictPaths: ['organizationId', 'cloudAccountId', 'cloudProvider', 'service', 'region', 'tagKey', 'tagValue', 'periodStart', 'periodEnd', 'periodType'],
                    skipUpdateIfNoValuesChanged: true,
                },
            );
        }

        this.logger.log(`[Aggregation] ${rows.length} agregados calculados para ${cloudAccountId} — ${year}-${month}`);
    }

    /**
     * Busca agregados mensais para o dashboard (alta performance — sem scan de cost_records).
     */
    async getMonthlyAggregates(
        organizationId: string,
        cloudAccountIds: string[],
        fromDate: Date,
        toDate: Date,
    ): Promise<FinopsCostAggregate[]> {
        return this.aggregateRepo
            .createQueryBuilder('a')
            .where('a.organizationId = :organizationId', { organizationId })
            .andWhere('a.cloudAccountId IN (:...ids)', { ids: cloudAccountIds })
            .andWhere('a.periodStart >= :from', { from: fromDate })
            .andWhere('a.periodEnd <= :to', { to: toDate })
            .andWhere('a.periodType = :type', { type: 'monthly' })
            .orderBy('a.periodStart', 'ASC')
            .getMany();
    }
}
