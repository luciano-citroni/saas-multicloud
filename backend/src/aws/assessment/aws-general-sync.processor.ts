import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { AwsAssessmentSyncService } from './aws-assessment-sync.service';
import { GENERAL_SYNC_QUEUE } from './constants';

export interface GeneralSyncJobPayload {
    cloudAccountId: string;
}

@Processor(GENERAL_SYNC_QUEUE)
export class AwsGeneralSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(AwsGeneralSyncProcessor.name);

    constructor(
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,
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

        await this.syncService.syncAll(cloudAccountId, cloudAccount.organizationId);

        await this.cloudAccountRepository.update({ id: cloudAccountId }, { lastGeneralSyncAt: new Date() });

        this.logger.log(`[sync:${job.id}] Sync geral concluido para conta ${cloudAccountId}`);
    }
}
