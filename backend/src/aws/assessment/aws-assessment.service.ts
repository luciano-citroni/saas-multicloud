import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { AwsAssessmentJob, AssessmentStatus } from '../../db/entites/aws-assessment-job.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { ASSESSMENT_QUEUE, ASSESSMENT_JOB_NAME, GENERAL_SYNC_QUEUE, GENERAL_SYNC_JOB_NAME } from './constants';
import { AwsAssessmentReportService } from './aws-assessment-report.service';
import { AwsAssessmentArchitectureService, ReactFlowGraph } from './aws-assessment-architecture.service';
import { BillingService } from '../../billing/billing.service';

export interface AssessmentArchitectureResponse {
    cloudAccountId: string;
    lastGeneralSyncAt: Date | null;
    architectureGraph: ReactFlowGraph;
}

export interface GeneralSyncJobResponse {
    id: string;
    status: string;
    message: string;
}

export interface GeneralSyncJobStatusResponse {
    id: string;
    status: string;
    failedReason?: string;
    createdAt: Date;
    completedAt?: Date;
}

@Injectable()
export class AwsAssessmentService {
    private readonly logger = new Logger(AwsAssessmentService.name);
    constructor(
        @InjectRepository(AwsAssessmentJob)
        private readonly jobRepository: Repository<AwsAssessmentJob>,
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,
        private readonly reportService: AwsAssessmentReportService,
        private readonly architectureService: AwsAssessmentArchitectureService,
        private readonly billingService: BillingService,
        @InjectQueue(ASSESSMENT_QUEUE)
        private readonly assessmentQueue: Queue,
        @InjectQueue(GENERAL_SYNC_QUEUE)
        private readonly generalSyncQueue: Queue
    ) {}

    async buildAssessmentArchitecture(cloudAccountId: string, organizationId: string): Promise<AssessmentArchitectureResponse> {
        await this.billingService.assertModuleEnabled(organizationId, 'assessment');

        const cloudAccount = await this.cloudAccountRepository.findOne({
            where: { id: cloudAccountId, organizationId },
        });

        if (!cloudAccount) {
            throw new BadRequestException(`CloudAccount "${cloudAccountId}" não encontrada ou sem acesso.`);
        }

        const data = await this.reportService.collectAllData(cloudAccountId);
        const architectureModel = this.architectureService.buildArchitectureModel(cloudAccountId, data);
        const architectureGraph = this.architectureService.buildReactFlowGraph(architectureModel, data);

        return {
            cloudAccountId,
            lastGeneralSyncAt: cloudAccount.lastGeneralSyncAt,
            architectureGraph,
        };
    }

    async enqueueGeneralSync(cloudAccountId: string, organizationId: string): Promise<GeneralSyncJobResponse> {
        await this.billingService.assertModuleEnabled(organizationId, 'assessment');
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const existingJob = await this.findPendingGeneralSyncJob(cloudAccountId);
        if (existingJob) {
            return {
                id: String(existingJob.id),
                status: this.mapQueueState(await existingJob.getState()),
                message: `Já existe um sync geral em andamento para esta conta. Acompanhe em GET /aws/assessment/accounts/${cloudAccountId}/jobs/${existingJob.id}`,
            };
        }

        const syncJob = await this.generalSyncQueue.add(
            GENERAL_SYNC_JOB_NAME,
            { cloudAccountId, organizationId },
            {
                jobId: `general-sync-${cloudAccountId}`,
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { count: 50 },
                removeOnFail: { count: 20 },
            }
        );

        return {
            id: String(syncJob.id),
            status: this.mapQueueState(await syncJob.getState()),
            message: `Sync geral enfileirado. Acompanhe em GET /aws/assessment/accounts/${cloudAccountId}/jobs/${syncJob.id}`,
        };
    }

    async getGeneralSyncJobStatus(syncJobId: string, cloudAccountId: string, organizationId: string): Promise<GeneralSyncJobStatusResponse> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const job = await this.generalSyncQueue.getJob(syncJobId);
        if (!job) {
            throw new BadRequestException(`Job de sync "${syncJobId}" não encontrado.`);
        }

        if (job.name !== GENERAL_SYNC_JOB_NAME) {
            throw new BadRequestException(`Job de sync "${syncJobId}" inválido.`);
        }

        const jobCloudAccountId = (job.data as { cloudAccountId?: string }).cloudAccountId;
        if (jobCloudAccountId !== cloudAccountId) {
            throw new BadRequestException(`Job de sync "${syncJobId}" não pertence à conta informada.`);
        }

        return this.mapGeneralSyncJob(job);
    }

    async listGeneralSyncJobs(cloudAccountId: string, organizationId: string): Promise<GeneralSyncJobStatusResponse[]> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const jobs = await this.generalSyncQueue.getJobs(['active', 'waiting', 'prioritized', 'delayed', 'paused', 'completed', 'failed'], 0, 99, false);

        const syncJobs = jobs.filter((job) => {
            const jobCloudAccountId = (job.data as { cloudAccountId?: string }).cloudAccountId;
            return job.name === GENERAL_SYNC_JOB_NAME && jobCloudAccountId === cloudAccountId;
        });

        return Promise.all(syncJobs.map((job) => this.mapGeneralSyncJob(job)));
    }

    async startAssessment(cloudAccountId: string, organizationId: string, runSync: boolean): Promise<AwsAssessmentJob> {
        await this.billingService.assertModuleEnabled(organizationId, 'assessment');

        const cloudAccount = await this.cloudAccountRepository.findOne({
            where: { id: cloudAccountId, organizationId },
        });

        if (!cloudAccount) {
            throw new BadRequestException(`CloudAccount "${cloudAccountId}" não encontrada ou sem acesso.`);
        }

        const shouldRunSync = runSync;

        const job = this.jobRepository.create({
            cloudAccountId,
            organizationId,
            status: 'pending' as AssessmentStatus,
        });
        const savedJob = await this.jobRepository.save(job);

        await this.assessmentQueue.add(
            ASSESSMENT_JOB_NAME,
            { jobId: savedJob.id, cloudAccountId, organizationId, runSync: shouldRunSync },
            {
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { count: 50 },
                removeOnFail: { count: 20 },
            }
        );

        this.logger.log(`Assessment job ${savedJob.id} enfileirado para conta ${cloudAccountId}`);
        return savedJob;
    }

    async getJobStatus(jobId: string, cloudAccountId: string, organizationId: string): Promise<AwsAssessmentJob> {
        const job = await this.jobRepository.findOne({
            where: { id: jobId, cloudAccountId, organizationId },
        });

        if (!job) {
            throw new BadRequestException(`Job de assessment "${jobId}" não encontrado.`);
        }

        return job;
    }

    async listJobs(cloudAccountId: string, organizationId: string): Promise<AwsAssessmentJob[]> {
        return this.jobRepository.find({
            where: { cloudAccountId, organizationId },
            order: { createdAt: 'DESC' },
            take: 20,
        });
    }

    async clearJobExcelFile(jobId: string, cloudAccountId: string, organizationId: string): Promise<void> {
        await this.jobRepository.update({ id: jobId, cloudAccountId, organizationId }, { excelFileName: null });
    }

    private async findPendingGeneralSyncJob(cloudAccountId: string): Promise<Job | undefined> {
        const jobs = await this.generalSyncQueue.getJobs(['active', 'waiting', 'prioritized', 'delayed', 'paused'], 0, 49, false);

        return jobs.find((job) => {
            const jobCloudAccountId = (job.data as { cloudAccountId?: string }).cloudAccountId;
            return job.name === GENERAL_SYNC_JOB_NAME && jobCloudAccountId === cloudAccountId;
        });
    }

    private async mapGeneralSyncJob(job: Job): Promise<GeneralSyncJobStatusResponse> {
        return {
            id: String(job.id),
            status: this.mapQueueState(await job.getState()),
            failedReason: job.failedReason || undefined,
            createdAt: new Date(job.timestamp),
            completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
        };
    }

    private mapQueueState(state: string): string {
        return state === 'active' ? 'running' : state;
    }

    private async requireCloudAccount(cloudAccountId: string, organizationId: string): Promise<CloudAccount> {
        const cloudAccount = await this.cloudAccountRepository.findOne({
            where: { id: cloudAccountId, organizationId },
        });

        if (!cloudAccount) {
            throw new BadRequestException(`CloudAccount "${cloudAccountId}" não encontrada ou sem acesso.`);
        }

        return cloudAccount;
    }
}
