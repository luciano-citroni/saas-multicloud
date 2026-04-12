import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { InjectQueue } from '@nestjs/bullmq';

import { Job, Queue } from 'bullmq';

import { GovernanceJob, GovernanceJobStatus } from '../../db/entites/governance-job.entity';
import { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import { GovernanceSuppression } from '../../db/entites/governance-suppression.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

import { GOVERNANCE_QUEUE, GOVERNANCE_JOB_NAME, GOVERNANCE_PENDING_STATES } from '../constants';

import { ErrorMessages } from '../../common/messages/error-messages';

import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../../common/middlewares/pagination.middleware';

import { PolicyRegistryService } from '../policies/policy-registry.service';

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface GovernanceScanResponse {
    jobId: string;
    status: GovernanceJobStatus;
    message: string;
}

export interface GovernanceScoreResult {
    jobId: string;
    provider: string;
    score: number;
    totalFindings: number;
    totalChecks: number;
    criticalFindings: number;
    highFindings: number;
    categoryScores: CategoryScore[];
    evaluatedAt: Date;
}

export interface CategoryScore {
    category: string;
    score: number;
    totalChecks: number;
    nonCompliantChecks: number;
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

export interface ScoreHistoryEntry {
    jobId: string;
    provider: string;
    score: number;
    totalFindings: number;
    totalChecks: number;
    completedAt: Date;
}

export interface CreateSuppressionDto {
    cloudAccountId?: string | null;
    policyId: string;
    resourceId?: string | null;
    reason: string;
    expiresAt?: Date | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class GovernanceService {
    private readonly logger = new Logger(GovernanceService.name);

    constructor(
        @InjectRepository(GovernanceJob)
        private readonly jobRepo: Repository<GovernanceJob>,

        @InjectRepository(GovernanceFinding)
        private readonly findingRepo: Repository<GovernanceFinding>,

        @InjectRepository(GovernanceSuppression)
        private readonly suppressionRepo: Repository<GovernanceSuppression>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,

        private readonly policyRegistry: PolicyRegistryService,

        @InjectQueue(GOVERNANCE_QUEUE)
        private readonly governanceQueue: Queue
    ) {}

    // ── Scan ─────────────────────────────────────────────────────────────────

    /**
     * Inicia um scan de governança assíncrono.
     * Detecta automaticamente o provider da conta (aws, gcp, azure).
     */
    async startScan(cloudAccountId: string, organizationId: string): Promise<GovernanceScanResponse> {
        const cloudAccount = await this.requireCloudAccount(cloudAccountId, organizationId);
        const provider = cloudAccount.provider;

        const existingJob = await this.findPendingScanJob(cloudAccountId, organizationId);

        if (existingJob) {
            return {
                jobId: String(existingJob.id),
                status: 'pending',
                message: `Já existe um scan de governança em andamento para esta conta. Acompanhe em GET /governance/accounts/${cloudAccountId}/jobs/${existingJob.data.jobId}`,
            };
        }

        const job = this.jobRepo.create({ cloudAccountId, organizationId, provider, status: 'pending' });
        const savedJob = await this.jobRepo.save(job);

        await this.governanceQueue.add(
            GOVERNANCE_JOB_NAME,
            { jobId: savedJob.id, cloudAccountId, organizationId, provider },
            {
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { count: 50 },
                removeOnFail: { count: 20 },
            }
        );

        this.logger.log(`Governance scan job ${savedJob.id} enfileirado para conta ${cloudAccountId} (provider=${provider})`);

        return {
            jobId: savedJob.id,
            status: 'pending',
            message: `Scan de governança ${provider.toUpperCase()} enfileirado. Acompanhe em GET /governance/accounts/${cloudAccountId}/jobs/${savedJob.id}`,
        };
    }

    // ── Jobs ─────────────────────────────────────────────────────────────────

    async getJob(jobId: string, cloudAccountId: string, organizationId: string): Promise<GovernanceJob> {
        const job = await this.jobRepo.findOne({ where: { id: jobId, cloudAccountId, organizationId } });

        if (!job) {
            throw new BadRequestException(ErrorMessages.GOVERNANCE.JOB_NOT_FOUND);
        }

        return job;
    }

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

    // ── Findings ─────────────────────────────────────────────────────────────

    async getJobFindings(jobId: string, cloudAccountId: string, organizationId: string): Promise<GovernanceFinding[]> {
        await this.getJob(jobId, cloudAccountId, organizationId);

        return this.findingRepo.find({
            where: { jobId, cloudAccountId },
            order: { severity: 'DESC', createdAt: 'ASC' },
        });
    }

    // ── Score ─────────────────────────────────────────────────────────────────

    /**
     * Score do último scan completo com breakdown por categoria.
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

        const [severityCounts, categoryCounts] = await Promise.all([
            this.findingRepo
                .createQueryBuilder('f')
                .select('f.severity', 'severity')
                .addSelect('COUNT(f.id)', 'count')
                .where('f.jobId = :jobId', { jobId: job.id })
                .andWhere('f.severity IN (:...severities)', { severities: ['critical', 'high'] })
                .andWhere('f.status = :status', { status: 'non_compliant' })
                .groupBy('f.severity')
                .getRawMany<{ severity: string; count: string }>(),

            this.findingRepo
                .createQueryBuilder('f')
                .select('f.category', 'category')
                .addSelect('COUNT(f.id)', 'total')
                .addSelect(`SUM(CASE WHEN f.status = 'non_compliant' THEN 1 ELSE 0 END)`, 'nonCompliant')
                .where('f.jobId = :jobId', { jobId: job.id })
                .andWhere('f.category IS NOT NULL')
                .groupBy('f.category')
                .getRawMany<{ category: string; total: string; nonCompliant: string }>(),
        ]);

        const criticalFindings = Number(severityCounts.find((r) => r.severity === 'critical')?.count ?? 0);
        const highFindings = Number(severityCounts.find((r) => r.severity === 'high')?.count ?? 0);

        const categoryScores: CategoryScore[] = categoryCounts.map((row) => {
            const total = Number(row.total);
            const nonCompliant = Number(row.nonCompliant);
            const compliant = total - nonCompliant;
            return {
                category: row.category,
                score: total === 0 ? 100 : Math.round((compliant / total) * 100),
                totalChecks: total,
                nonCompliantChecks: nonCompliant,
            };
        });

        return {
            jobId: job.id,
            provider: job.provider,
            score: job.score ?? 0,
            totalFindings: job.totalFindings ?? 0,
            totalChecks: job.totalChecks ?? 0,
            criticalFindings,
            highFindings,
            categoryScores,
            evaluatedAt: job.completedAt ?? job.createdAt,
        };
    }

    /**
     * Histórico de scores para a conta, dos mais recentes para os mais antigos.
     */
    async getScoreHistory(cloudAccountId: string, organizationId: string, limit = 10): Promise<ScoreHistoryEntry[]> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const safeLimit = Math.min(Math.max(1, limit), 50);

        const jobs = await this.jobRepo.find({
            where: { cloudAccountId, organizationId, status: 'completed' },
            order: { completedAt: 'DESC' },
            take: safeLimit,
            select: ['id', 'provider', 'score', 'totalFindings', 'totalChecks', 'completedAt'],
        });

        return jobs.map((j) => ({
            jobId: j.id,
            provider: j.provider,
            score: j.score ?? 0,
            totalFindings: j.totalFindings ?? 0,
            totalChecks: j.totalChecks ?? 0,
            completedAt: j.completedAt ?? j.createdAt,
        }));
    }

    // ── Suppressions ──────────────────────────────────────────────────────────

    /**
     * Cria uma supressão de finding (false positive management).
     */
    async createSuppression(organizationId: string, dto: CreateSuppressionDto): Promise<GovernanceSuppression> {
        if (dto.cloudAccountId) {
            await this.requireCloudAccount(dto.cloudAccountId, organizationId);
        }

        const suppression = this.suppressionRepo.create({
            organizationId,
            cloudAccountId: dto.cloudAccountId ?? null,
            policyId: dto.policyId,
            resourceId: dto.resourceId ?? null,
            reason: dto.reason,
            expiresAt: dto.expiresAt ?? null,
        });

        return this.suppressionRepo.save(suppression);
    }

    /**
     * Lista as supressões da organização (opcionalmente filtradas por conta).
     */
    async listSuppressions(organizationId: string, cloudAccountId?: string): Promise<GovernanceSuppression[]> {
        const query = this.suppressionRepo
            .createQueryBuilder('s')
            .where('s.organizationId = :organizationId', { organizationId });

        if (cloudAccountId) {
            query.andWhere('(s.cloudAccountId IS NULL OR s.cloudAccountId = :cloudAccountId)', { cloudAccountId });
        }

        return query.orderBy('s.createdAt', 'DESC').getMany();
    }

    /**
     * Remove uma supressão específica.
     */
    async deleteSuppression(suppressionId: string, organizationId: string): Promise<void> {
        const suppression = await this.suppressionRepo.findOne({
            where: { id: suppressionId, organizationId },
        });

        if (!suppression) {
            throw new NotFoundException(ErrorMessages.GOVERNANCE.SUPPRESSION_NOT_FOUND);
        }

        await this.suppressionRepo.remove(suppression);
    }

    // ── Policies ──────────────────────────────────────────────────────────────

    /**
     * Lista todas as políticas disponíveis, com suporte a filtro por provider e framework.
     */
    listPolicies(provider?: string, framework?: string) {
        let policies = provider ? this.policyRegistry.getByProvider(provider) : this.policyRegistry.getAll();

        if (framework) {
            policies = policies.filter((p) => p.frameworks?.includes(framework as any));
        }

        return policies.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            resourceType: p.resourceType,
            severity: p.severity,
            provider: p.provider,
            category: p.category ?? null,
            frameworks: p.frameworks ?? [],
        }));
    }

    // ── Private helpers ───────────────────────────────────────────────────────

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
        if (!Number.isInteger(page) || !page || page < DEFAULT_PAGE) return DEFAULT_PAGE;
        return page;
    }

    private normalizeLimit(limit?: number): number {
        if (!Number.isInteger(limit) || !limit || limit < 1) return DEFAULT_LIMIT;
        return Math.min(limit, MAX_LIMIT);
    }
}
