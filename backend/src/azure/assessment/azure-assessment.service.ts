import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { InjectQueue } from '@nestjs/bullmq';

import { Queue } from 'bullmq';

import { AzureAssessmentJob, AzureAssessmentStatus } from '../../db/entites/azure-assessment-job.entity';

import { CloudAccount } from '../../db/entites/cloud-account.entity';

import { AZURE_ASSESSMENT_QUEUE, AZURE_ASSESSMENT_JOB_NAME } from './constants';

import { BillingService } from '../../billing/billing.service';

import { SystemModule } from '../../common/modules/system-modules';

@Injectable()
export class AzureAssessmentService {
    private readonly logger = new Logger(AzureAssessmentService.name);

    constructor(
        @InjectRepository(AzureAssessmentJob)
        private readonly jobRepository: Repository<AzureAssessmentJob>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,

        private readonly billingService: BillingService,

        @InjectQueue(AZURE_ASSESSMENT_QUEUE)
        private readonly assessmentQueue: Queue
    ) {}

    async startAssessment(cloudAccountId: string, organizationId: string, runSync = true): Promise<AzureAssessmentJob> {
        await this.billingService.assertModuleEnabled(organizationId, SystemModule.ASSESSMENT);

        const cloudAccount = await this.cloudAccountRepository.findOne({
            where: { id: cloudAccountId, organizationId },
        });

        if (!cloudAccount) {
            throw new BadRequestException(`CloudAccount "${cloudAccountId}" não encontrada ou sem acesso.`);
        }

        const job = this.jobRepository.create({
            cloudAccountId,

            organizationId,

            status: 'pending' as AzureAssessmentStatus,
        });

        const savedJob = await this.jobRepository.save(job);

        await this.assessmentQueue.add(
            AZURE_ASSESSMENT_JOB_NAME,

            { jobId: savedJob.id, cloudAccountId, organizationId, runSync },

            {
                attempts: 2,

                backoff: { type: 'exponential', delay: 5000 },

                removeOnComplete: { count: 50 },

                removeOnFail: { count: 20 },
            }
        );

        this.logger.log(`Azure assessment job ${savedJob.id} enfileirado para conta ${cloudAccountId}`);

        return savedJob;
    }

    async getJobStatus(jobId: string, cloudAccountId: string, organizationId: string): Promise<AzureAssessmentJob> {
        const job = await this.jobRepository.findOne({
            where: { id: jobId, cloudAccountId, organizationId },
        });

        if (!job) {
            throw new BadRequestException(`Job de assessment Azure "${jobId}" não encontrado.`);
        }

        return job;
    }

    async listJobs(cloudAccountId: string, organizationId: string): Promise<AzureAssessmentJob[]> {
        return this.jobRepository.find({
            where: { cloudAccountId, organizationId },

            order: { createdAt: 'DESC' },

            take: 20,
        });
    }

    async clearJobExcelFile(jobId: string, cloudAccountId: string, organizationId: string): Promise<void> {
        await this.jobRepository.update({ id: jobId, cloudAccountId, organizationId }, { excelFileName: null });
    }
}
