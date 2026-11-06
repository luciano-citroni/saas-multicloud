import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsCostSyncRun } from '../../db/entites/finops-cost-sync-run.entity';
import type { FinopsCostEntry } from '../providers/finops-provider.interface';

export interface IngestionResult {
    recordsUpserted: number;
    syncRunId: string;
}

/** Dias recentes reabertos no sync incremental. O histórico anterior não é regravado. */
const INCREMENTAL_OVERLAP_DAYS = 3;

@Injectable()
export class FinopsCostIngestionService {
    private readonly logger = new Logger(FinopsCostIngestionService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(FinopsCostSyncRun)
        private readonly syncRunRepo: Repository<FinopsCostSyncRun>,
    ) {}

    /**
     * Com histórico já gravado, o sync diário/manual começa poucos dias antes do último
     * registro. O fechamento mensal mantém o período pedido para regravar o mês fechado.
     */
    async resolveIncrementalStart(
        organizationId: string,
        cloudAccountId: string,
        granularity: 'daily' | 'monthly',
        requestedStart: string,
        requestedEnd: string,
    ): Promise<string> {
        const row = await this.costRecordRepo
            .createQueryBuilder('r')
            .select('MAX(r.date)', 'maxDate')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('r.granularity = :granularity', { granularity })
            .getRawOne<{ maxDate: string | Date | null }>();

        if (!row?.maxDate) return requestedStart;

        const maxDate = toIsoDate(row.maxDate);
        const overlapped = addUtcDays(maxDate, -INCREMENTAL_OVERLAP_DAYS);
        const start = overlapped > requestedStart ? overlapped : requestedStart;
        return start > requestedEnd ? requestedEnd : start;
    }

    async ingest(
        organizationId: string,
        cloudAccountId: string,
        cloudProvider: string,
        startDate: string,
        endDate: string,
        granularity: 'DAILY' | 'MONTHLY',
        entries: FinopsCostEntry[],
        triggerType: 'manual' | 'scheduled_daily' | 'scheduled_monthly_close' = 'manual',
    ): Promise<IngestionResult> {
        // Create sync run record
        const syncRun = this.syncRunRepo.create({
            organizationId,
            cloudAccountId,
            cloudProvider,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            status: 'running',
            triggerType,
        });
        const savedRun = await this.syncRunRepo.save(syncRun);

        try {
            let total = 0;
            const BATCH_SIZE = 200;
            const grain = granularity.toLowerCase() as 'daily' | 'monthly';
            const isMonthlyClose = triggerType === 'scheduled_monthly_close';

            await this.costRecordRepo.manager.transaction(async (manager) => {
                const repo = manager.getRepository(FinopsCostRecord);

                if (isMonthlyClose && entries.length > 0) {
                    const removed = await repo
                        .createQueryBuilder()
                        .delete()
                        .where('organization_id = :organizationId', { organizationId })
                        .andWhere('cloud_account_id = :cloudAccountId', { cloudAccountId })
                        .andWhere('granularity = :grain', { grain })
                        .andWhere('date >= :startDate', { startDate })
                        .andWhere('date <= :endDate', { endDate })
                        .execute();
                    this.logger.log(
                        `[Ingestion] Fechamento: ${removed.affected ?? 0} registros ${grain} de ${startDate} a ${endDate} substituídos`,
                    );
                }

                for (let i = 0; i < entries.length; i += BATCH_SIZE) {
                    const batch = entries.slice(i, i + BATCH_SIZE);

                    await repo.upsert(
                        batch.map((entry) => ({
                            organizationId,
                            cloudAccountId,
                            cloudProvider,
                            service: entry.service,
                            resourceId: entry.resourceId ?? '',
                            region: entry.region ?? '',
                            usageType: entry.usageType ?? '',
                            operation: entry.operation ?? '',
                            cost: entry.cost,
                            currency: entry.currency,
                            usageQuantity: entry.usageQuantity ?? 0,
                            usageUnit: entry.usageUnit ?? '',
                            date: entry.date,
                            granularity: grain,
                            tags: (entry.tags ?? null) as Record<string, any> | null,
                        })) as never,
                        {
                            conflictPaths: ['cloudAccountId', 'service', 'resourceId', 'region', 'date', 'granularity'],
                            skipUpdateIfNoValuesChanged: true,
                        },
                    );

                    total += batch.length;
                }
            });

            await this.syncRunRepo.update(savedRun.id, {
                status: 'completed',
                recordsUpserted: total,
                completedAt: new Date(),
            });

            this.logger.log(`[Ingestion] ${total} registros upserted para conta ${cloudAccountId}`);

            return { recordsUpserted: total, syncRunId: savedRun.id };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await this.syncRunRepo.update(savedRun.id, {
                status: 'failed',
                errorMessage: msg,
                completedAt: new Date(),
            });
            throw err;
        }
    }
}

function toIsoDate(value: string | Date): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}

function addUtcDays(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
