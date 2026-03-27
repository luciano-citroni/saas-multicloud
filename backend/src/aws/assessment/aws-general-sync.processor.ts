import { Processor, WorkerHost } from '@nestjs/bullmq';

import { Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Job } from 'bullmq';

import { CloudAccount } from '../../db/entites/cloud-account.entity';

import { AwsAssessmentSyncService } from './aws-assessment-sync.service';

import { AWS_GENERAL_SYNC_WORKER_CONCURRENCY, GENERAL_SYNC_QUEUE } from './constants';
import { CloudSyncJob } from '../../db/entites/cloud-sync-job.entity';
import { CloudProvider } from '../../db/entites/cloud-account.entity';

export interface GeneralSyncJobPayload {
    cloudAccountId: string;
}

@Processor(GENERAL_SYNC_QUEUE, { concurrency: AWS_GENERAL_SYNC_WORKER_CONCURRENCY })
export class AwsGeneralSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(AwsGeneralSyncProcessor.name);

    constructor(
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,

        @InjectRepository(CloudSyncJob)
        private readonly syncJobRepository: Repository<CloudSyncJob>,

        private readonly syncService: AwsAssessmentSyncService
    ) {
        super();
    }

    async process(job: Job<GeneralSyncJobPayload>): Promise<void> {
        const { cloudAccountId } = job.data;

        this.logger.log(`[sync:${job.id}] Iniciando sync geral da conta ${cloudAccountId}`);

        const cloudAccount = await this.cloudAccountRepository.findOne({ where: { id: cloudAccountId } });

        if (!cloudAccount) {
            throw new Error(`CloudAccount \"${cloudAccountId}\" não encontrada para sync geral.`);
        }

        await this.cloudAccountRepository.update({ id: cloudAccountId }, { isGeneralSyncInProgress: true });

        const syncRecord = this.syncJobRepository.create({
            cloudAccountId,
            organizationId: cloudAccount.organizationId,
            provider: CloudProvider.AWS,
            status: 'running',
            error: null,
            completedAt: null,
        });

        const savedSyncRecord = await this.syncJobRepository.save(syncRecord);

        try {
            const hasPreviousSync = cloudAccount.lastGeneralSyncAt !== null;

            if (hasPreviousSync) {
                await this.syncService.syncIncremental(cloudAccountId, cloudAccount.organizationId);
            } else {
                await this.syncService.syncAll(cloudAccountId, cloudAccount.organizationId);
            }

            const completedAt = new Date();

            await this.cloudAccountRepository.update({ id: cloudAccountId }, { lastGeneralSyncAt: completedAt });

            await this.syncJobRepository.update(savedSyncRecord.id, {
                status: 'completed',
                completedAt,
            });

            this.logger.log(`[sync:${job.id}] Sync geral concluido para conta ${cloudAccountId}`);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);

            this.logger.error(`[sync:${job.id}] Sync geral falhou para conta ${cloudAccountId}: ${error}`);

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
