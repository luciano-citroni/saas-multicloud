import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';

import { CloudAccount, CloudProvider } from '../../db/entites/cloud-account.entity';
import { CloudSyncJob } from '../../db/entites/cloud-sync-job.entity';
import { GcpAssessmentSyncService } from './gcp-assessment-sync.service';
import { GCP_GENERAL_SYNC_QUEUE, GCP_GENERAL_SYNC_WORKER_CONCURRENCY } from './constants';

export interface GcpGeneralSyncJobPayload {
    cloudAccountId: string;
    organizationId: string;
}

@Processor(GCP_GENERAL_SYNC_QUEUE, { concurrency: GCP_GENERAL_SYNC_WORKER_CONCURRENCY })
export class GcpGeneralSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(GcpGeneralSyncProcessor.name);

    constructor(
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,

        @InjectRepository(CloudSyncJob)
        private readonly syncJobRepository: Repository<CloudSyncJob>,

        private readonly syncService: GcpAssessmentSyncService
    ) {
        super();
    }

    async process(job: Job<GcpGeneralSyncJobPayload>): Promise<void> {
        const { cloudAccountId, organizationId } = job.data;

        this.logger.log(`[sync:${job.id}] Iniciando sync geral GCP para conta ${cloudAccountId}`);

        const cloudAccount = await this.cloudAccountRepository.findOne({ where: { id: cloudAccountId } });

        if (!cloudAccount) {
            throw new Error(`CloudAccount "${cloudAccountId}" não encontrada para sync geral GCP.`);
        }

        await this.cloudAccountRepository.update({ id: cloudAccountId }, { isGeneralSyncInProgress: true });

        const syncRecord = this.syncJobRepository.create({
            cloudAccountId,
            organizationId,
            provider: CloudProvider.GCP,
            status: 'running',
            error: null,
            completedAt: null,
        });

        const savedSyncRecord = await this.syncJobRepository.save(syncRecord);

        try {
            await this.syncService.syncAll(cloudAccountId, organizationId);

            const completedAt = new Date();

            await this.cloudAccountRepository.update({ id: cloudAccountId }, { lastGeneralSyncAt: completedAt });
            await this.syncJobRepository.update(savedSyncRecord.id, { status: 'completed', completedAt });

            this.logger.log(`[sync:${job.id}] Sync geral GCP concluído para conta ${cloudAccountId}`);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);

            this.logger.error(`[sync:${job.id}] Sync geral GCP falhou para conta ${cloudAccountId}: ${error}`);

            await this.syncJobRepository.update(savedSyncRecord.id, {
                status: 'failed',
                error,
                completedAt: new Date(),
            });

            throw err;
        } finally {
            await this.cloudAccountRepository.update({ id: cloudAccountId }, { isGeneralSyncInProgress: false });
        }
    }
}
