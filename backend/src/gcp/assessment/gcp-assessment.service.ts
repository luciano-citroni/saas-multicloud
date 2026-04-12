import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

import { GcpAssessmentJob } from '../../db/entites/gcp-assessment-job.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { BillingService } from '../../billing/billing.service';
import { SystemModule } from '../../common/modules/system-modules';

import { GCP_ASSESSMENT_QUEUE, GCP_ASSESSMENT_JOB_NAME, GCP_GENERAL_SYNC_QUEUE, GCP_GENERAL_SYNC_JOB_NAME } from './constants';
import { GcpAssessmentReportService } from './gcp-assessment-report.service';
import { GcpAssessmentArchitectureService, ReactFlowGraph } from './gcp-assessment-architecture.service';

export interface GcpAssessmentArchitectureResponse {
    cloudAccountId: string;
    lastGeneralSyncAt: Date | null;
    architectureGraph: ReactFlowGraph;
}

export interface GcpGeneralSyncJobResponse {
    id: string;
    status: string;
    message: string;
}

export interface GcpGeneralSyncJobStatusResponse {
    id: string;
    status: string;
    failedReason?: string;
    createdAt: Date;
    completedAt?: Date;
}

@Injectable()
export class GcpAssessmentService {
    private readonly logger = new Logger(GcpAssessmentService.name);

    constructor(
        @InjectRepository(GcpAssessmentJob)
        private readonly jobRepository: Repository<GcpAssessmentJob>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,

        private readonly billingService: BillingService,

        @InjectQueue(GCP_ASSESSMENT_QUEUE)
        private readonly assessmentQueue: Queue,

        @InjectQueue(GCP_GENERAL_SYNC_QUEUE)
        private readonly generalSyncQueue: Queue,

        private readonly reportService: GcpAssessmentReportService,

        private readonly architectureService: GcpAssessmentArchitectureService,
    ) {}

    async buildAssessmentArchitecture(cloudAccountId: string, organizationId: string): Promise<GcpAssessmentArchitectureResponse> {
        await this.billingService.assertModuleEnabled(organizationId, SystemModule.ASSESSMENT);

        const cloudAccount = await this.cloudAccountRepository.findOne({ where: { id: cloudAccountId, organizationId } });

        if (!cloudAccount) {
            throw new BadRequestException(`CloudAccount "${cloudAccountId}" não encontrada ou sem acesso.`);
        }

        const data = await this.reportService.collectAllData(cloudAccountId);
        const architectureGraph = this.architectureService.buildReactFlowGraph(cloudAccountId, data);

        return { cloudAccountId, lastGeneralSyncAt: cloudAccount.lastGeneralSyncAt, architectureGraph };
    }

    async startAssessment(cloudAccountId: string, organizationId: string, runSync = true): Promise<GcpAssessmentJob> {
        await this.billingService.assertModuleEnabled(organizationId, SystemModule.ASSESSMENT);

        const cloudAccount = await this.cloudAccountRepository.findOne({ where: { id: cloudAccountId, organizationId } });

        if (!cloudAccount) {
            throw new BadRequestException(`CloudAccount "${cloudAccountId}" não encontrada ou sem acesso.`);
        }

        const job = this.jobRepository.create({
            cloudAccountId,
            organizationId,
            status: 'pending',
        });

        const savedJob = await this.jobRepository.save(job);

        await this.assessmentQueue.add(
            GCP_ASSESSMENT_JOB_NAME,
            { jobId: savedJob.id, cloudAccountId, organizationId, runSync },
            { attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { count: 50 }, removeOnFail: { count: 20 } }
        );

        this.logger.log(`GCP assessment job ${savedJob.id} enfileirado para conta ${cloudAccountId}`);

        return savedJob;
    }

    async getJobStatus(jobId: string, cloudAccountId: string, organizationId: string): Promise<GcpAssessmentJob> {
        const job = await this.jobRepository.findOne({ where: { id: jobId, cloudAccountId, organizationId } });

        if (!job) {
            throw new BadRequestException(`Job de assessment GCP "${jobId}" não encontrado.`);
        }

        return job;
    }

    async listJobs(cloudAccountId: string, organizationId: string): Promise<GcpAssessmentJob[]> {
        return this.jobRepository.find({ where: { cloudAccountId, organizationId }, order: { createdAt: 'DESC' }, take: 20 });
    }

    async clearJobExcelFile(jobId: string, cloudAccountId: string, organizationId: string): Promise<void> {
        await this.jobRepository.update({ id: jobId, cloudAccountId, organizationId }, { excelFileName: null });
    }

    async enqueueGeneralSync(cloudAccountId: string, organizationId: string): Promise<GcpGeneralSyncJobResponse> {
        await this.billingService.assertModuleEnabled(organizationId, SystemModule.ASSESSMENT);

        const cloudAccount = await this.cloudAccountRepository.findOne({ where: { id: cloudAccountId, organizationId } });

        if (!cloudAccount) {
            throw new BadRequestException(`CloudAccount "${cloudAccountId}" não encontrada ou sem acesso.`);
        }

        const existingJob = await this.findPendingGeneralSyncJob(cloudAccountId);

        if (existingJob) {
            await this.cloudAccountRepository.update({ id: cloudAccountId, organizationId }, { isGeneralSyncInProgress: true });

            return {
                id: String(existingJob.id),
                status: this.mapQueueState(await existingJob.getState()),
                message: `Já existe um sync geral em andamento para esta conta GCP.`,
            };
        }

        await this.cloudAccountRepository.update({ id: cloudAccountId, organizationId }, { isGeneralSyncInProgress: true });

        const syncJob = await this.generalSyncQueue.add(
            GCP_GENERAL_SYNC_JOB_NAME,
            { cloudAccountId, organizationId },
            { attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { count: 50 }, removeOnFail: { count: 20 } }
        );

        this.logger.log(`GCP sync geral job ${syncJob.id} enfileirado para conta ${cloudAccountId}`);

        return {
            id: String(syncJob.id),
            status: this.mapQueueState(await syncJob.getState()),
            message: `Sync geral GCP enfileirado com sucesso.`,
        };
    }

    async getGeneralSyncJobStatus(syncJobId: string, cloudAccountId: string, organizationId: string): Promise<GcpGeneralSyncJobStatusResponse> {
        const cloudAccount = await this.cloudAccountRepository.findOne({ where: { id: cloudAccountId, organizationId } });

        if (!cloudAccount) {
            throw new BadRequestException(`CloudAccount "${cloudAccountId}" não encontrada ou sem acesso.`);
        }

        const job = await this.generalSyncQueue.getJob(syncJobId);

        if (!job) {
            throw new BadRequestException(`Job de sync GCP "${syncJobId}" não encontrado na fila.`);
        }

        const jobCloudAccountId = (job.data as { cloudAccountId?: string }).cloudAccountId;

        if (jobCloudAccountId !== cloudAccountId) {
            throw new BadRequestException(`Job de sync "${syncJobId}" não pertence à conta informada.`);
        }

        return this.mapGeneralSyncJob(job);
    }

    private async findPendingGeneralSyncJob(cloudAccountId: string): Promise<Job | undefined> {
        const jobs = await this.generalSyncQueue.getJobs(['active', 'waiting', 'prioritized', 'delayed', 'paused'], 0, 49, false);

        return jobs.find((job) => {
            const jobCloudAccountId = (job.data as { cloudAccountId?: string }).cloudAccountId;
            return job.name === GCP_GENERAL_SYNC_JOB_NAME && jobCloudAccountId === cloudAccountId;
        });
    }

    private async mapGeneralSyncJob(job: Job): Promise<GcpGeneralSyncJobStatusResponse> {
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
}
