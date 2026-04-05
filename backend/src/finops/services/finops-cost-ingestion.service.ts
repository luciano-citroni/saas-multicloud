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

@Injectable()
export class FinopsCostIngestionService {
    private readonly logger = new Logger(FinopsCostIngestionService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(FinopsCostSyncRun)
        private readonly syncRunRepo: Repository<FinopsCostSyncRun>,
    ) {}

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

            for (let i = 0; i < entries.length; i += BATCH_SIZE) {
                const batch = entries.slice(i, i + BATCH_SIZE);

                await this.costRecordRepo.upsert(
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
                        granularity: granularity.toLowerCase() as 'daily' | 'monthly',
                        tags: (entry.tags ?? null) as Record<string, any> | null,
                    })) as any,
                    {
                        conflictPaths: ['cloudAccountId', 'service', 'resourceId', 'region', 'date', 'granularity'],
                        skipUpdateIfNoValuesChanged: true,
                    },
                );

                total += batch.length;
            }

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
