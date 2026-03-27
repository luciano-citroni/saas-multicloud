import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { InjectQueue } from '@nestjs/bullmq';

import { Job, Queue } from 'bullmq';

import { GovernanceJob, GovernanceJobStatus } from '../../db/entites/governance-job.entity';
import { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

import { GOVERNANCE_QUEUE, GOVERNANCE_JOB_NAME, GOVERNANCE_PENDING_STATES } from '../constants';

import { ErrorMessages } from '../../common/messages/error-messages';

import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../../common/middlewares/pagination.middleware';

import { PolicyRegistryService } from '../policies/policy-registry.service';

export interface GovernanceScanResponse {
    jobId: string;
    status: GovernanceJobStatus;
    message: string;
}

export interface GovernanceScoreResult {
    jobId: string;
    score: number;
    totalFindings: number;
    totalChecks: number;
    criticalFindings: number;
    highFindings: number;
    evaluatedAt: Date;
}

export interface GovernanceScoreResult {
    jobId: string;
    score: number;
    totalFindings: number;
    totalChecks: number;
    criticalFindings: number;
    highFindings: number;
    evaluatedAt: Date;
}

export interface GovernancePaginationMeta {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

export interface PaginatedGovernanceJobsResponse {
    items: GovernanceJob[];
    pagination: GovernancePaginationMeta;
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

        const existingJob = await this.findPendingScanJob(cloudAccountId, organizationId);

        if (existingJob) {
            return {
                jobId: String(existingJob.id),
                status: 'pending',
                message: `Já existe um scan de governança em andamento para esta conta. Acompanhe em GET /governance/accounts/${cloudAccountId}/jobs/${existingJob.data.jobId}`,
            };
        }

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
     * Ordena por data mais recente e aplica paginação no banco.
     */
    async listJobs(cloudAccountId: string, organizationId: string, page?: number, limit?: number): Promise<PaginatedGovernanceJobsResponse> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const safeLimit = this.normalizeLimit(limit);
        const safePage = this.normalizePage(page);

        const query = this.jobRepo
            .createQueryBuilder('job')
            .where('job.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('job.organizationId = :organizationId', { organizationId })
            .orderBy('COALESCE(job.completedAt, job.createdAt)', 'DESC')
            .addOrderBy('job.createdAt', 'DESC');

        const totalItems = await query.getCount();
        const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / safeLimit);
        const resolvedPage = totalPages === 0 ? DEFAULT_PAGE : Math.min(safePage, totalPages);
        const resolvedOffset = (resolvedPage - DEFAULT_PAGE) * safeLimit;

        const items = await query.skip(resolvedOffset).take(safeLimit).getMany();

        return {
            items,
            pagination: {
                page: resolvedPage,
                limit: safeLimit,
                totalItems,
                totalPages,
                hasNextPage: resolvedPage < totalPages,
                hasPreviousPage: resolvedPage > DEFAULT_PAGE,
            },
        };
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
     * Retorna o score e resumo do último scan completo para a conta,
     * incluindo contagem de achados críticos e altos não-conformes.
     */
    async getLatestScore(cloudAccountId: string, organizationId: string): Promise<GovernanceScoreResult | null> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const job = await this.jobRepo.findOne({
            where: { cloudAccountId, organizationId, status: 'completed' },
            order: { completedAt: 'DESC' },
        });

        if (!job) {
            return null;
        }

        const severityCounts = await this.findingRepo
            .createQueryBuilder('f')
            .select('f.severity', 'severity')
            .addSelect('COUNT(f.id)', 'count')
            .where('f.jobId = :jobId', { jobId: job.id })
            .andWhere('f.severity IN (:...severities)', { severities: ['critical', 'high'] })
            .andWhere('f.status = :status', { status: 'non_compliant' })
            .groupBy('f.severity')
            .getRawMany<{ severity: string; count: string }>();

        const criticalFindings = Number(severityCounts.find((r) => r.severity === 'critical')?.count ?? 0);
        const highFindings = Number(severityCounts.find((r) => r.severity === 'high')?.count ?? 0);

        return {
            jobId: job.id,
            score: job.score ?? 0,
            totalFindings: job.totalFindings ?? 0,
            totalChecks: job.totalChecks ?? 0,
            criticalFindings,
            highFindings,
            evaluatedAt: job.completedAt ?? job.createdAt,
        };
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

    private async findPendingScanJob(cloudAccountId: string, organizationId: string): Promise<Job | undefined> {
        const jobs = await this.governanceQueue.getJobs([...GOVERNANCE_PENDING_STATES], 0, 49, false);

        return jobs.find((job) => {
            const payload = job.data as { cloudAccountId?: string; organizationId?: string };

            return job.name === GOVERNANCE_JOB_NAME && payload.cloudAccountId === cloudAccountId && payload.organizationId === organizationId;
        });
    }

    private normalizePage(page?: number): number {
        if (!Number.isInteger(page) || !page || page < DEFAULT_PAGE) {
            return DEFAULT_PAGE;
        }

        return page;
    }

    private normalizeLimit(limit?: number): number {
        if (!Number.isInteger(limit) || !limit || limit < 1) {
            return DEFAULT_LIMIT;
        }

        return Math.min(limit, MAX_LIMIT);
    }
}
