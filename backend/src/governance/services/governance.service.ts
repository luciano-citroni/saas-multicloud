import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { InjectQueue } from '@nestjs/bullmq';

import { Queue } from 'bullmq';

import { GovernanceJob, GovernanceJobStatus } from '../../db/entites/governance-job.entity';
import { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

import { GOVERNANCE_QUEUE, GOVERNANCE_JOB_NAME } from '../constants';

import { ErrorMessages } from '../../common/messages/error-messages';

import { PolicyRegistryService } from '../policies/policy-registry.service';

export interface GovernanceScanResponse {
    jobId: string;
    status: GovernanceJobStatus;
    message: string;
}

@Injectable()
export class GovernanceService {
    private readonly logger = new Logger(GovernanceService.name);

    constructor(
        @InjectRepository(GovernanceJob)
        private readonly jobRepo: Repository<GovernanceJob>,

        @InjectRepository(GovernanceFinding)
        private readonly findingRepo: Repository<GovernanceFinding>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,

        private readonly policyRegistry: PolicyRegistryService,

        @InjectQueue(GOVERNANCE_QUEUE)
        private readonly governanceQueue: Queue
    ) {}

    /**
     * Inicia um scan de governança assíncrono para a conta informada.
     * Cria o job no banco e o enfileira no BullMQ.
     */
    async startScan(cloudAccountId: string, organizationId: string): Promise<GovernanceScanResponse> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const job = this.jobRepo.create({
            cloudAccountId,
            organizationId,
            provider: 'aws',
            status: 'pending',
        });

        const savedJob = await this.jobRepo.save(job);

        await this.governanceQueue.add(
            GOVERNANCE_JOB_NAME,
            { jobId: savedJob.id, cloudAccountId, organizationId },
            {
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { count: 50 },
                removeOnFail: { count: 20 },
            }
        );

        this.logger.log(`Governance scan job ${savedJob.id} enfileirado para conta ${cloudAccountId}`);

        return {
            jobId: savedJob.id,
            status: 'pending',
            message: `Scan de governança enfileirado. Acompanhe em GET /governance/accounts/${cloudAccountId}/jobs/${savedJob.id}`,
        };
    }

    /**
     * Retorna o status de um job de governança específico.
     */
    async getJob(jobId: string, cloudAccountId: string, organizationId: string): Promise<GovernanceJob> {
        const job = await this.jobRepo.findOne({
            where: { id: jobId, cloudAccountId, organizationId },
        });

        if (!job) {
            throw new BadRequestException(ErrorMessages.GOVERNANCE.JOB_NOT_FOUND);
        }

        return job;
    }

    /**
     * Lista os jobs de governança para uma conta.
     * A paginação é aplicada pelo PaginationInterceptor.
     */
    async listJobs(cloudAccountId: string, organizationId: string): Promise<GovernanceJob[]> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        return this.jobRepo.find({
            where: { cloudAccountId, organizationId },
            order: { createdAt: 'DESC' },
        });
    }

    /**
     * Lista os findings (achados) de um job específico.
     * Retorna apenas achados não-conformes e warnings.
     */
    async getJobFindings(jobId: string, cloudAccountId: string, organizationId: string): Promise<GovernanceFinding[]> {
        await this.getJob(jobId, cloudAccountId, organizationId);

        return this.findingRepo.find({
            where: { jobId, cloudAccountId },
            order: { severity: 'DESC', createdAt: 'ASC' },
        });
    }

    /**
     * Retorna o score e resumo do último scan completo para a conta.
     */
    async getLatestScore(cloudAccountId: string, organizationId: string): Promise<GovernanceJob | null> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        return this.jobRepo.findOne({
            where: { cloudAccountId, organizationId, status: 'completed' },
            order: { completedAt: 'DESC' },
        });
    }

    /**
     * Lista todas as políticas disponíveis no registry.
     */
    listPolicies() {
        return this.policyRegistry.getAll().map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            resourceType: p.resourceType,
            severity: p.severity,
            provider: p.provider,
        }));
    }

    private async requireCloudAccount(cloudAccountId: string, organizationId: string): Promise<CloudAccount> {
        const cloudAccount = await this.cloudAccountRepo.findOne({
            where: { id: cloudAccountId, organizationId },
        });

        if (!cloudAccount) {
            throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        return cloudAccount;
    }
}
