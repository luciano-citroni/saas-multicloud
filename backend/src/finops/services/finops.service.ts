import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { InjectQueue } from '@nestjs/bullmq';

import { Job, Queue } from 'bullmq';

import { FinopsConsent } from '../../db/entites/finops-consent.entity';
import { FinopsJob } from '../../db/entites/finops-job.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

import { ErrorMessages } from '../../common/messages/error-messages';

import { FINOPS_QUEUE, FINOPS_JOB_NAME, FINOPS_PENDING_STATES, FINOPS_CONSENT_VERSION, FINOPS_CONSENT_TERMS } from '../constants';

export interface FinopsConsentResponse {
    cloudAccountId: string;
    cloudProvider: string;
    accepted: boolean;
    acceptedAt: Date | null;
    version: string;
    terms: string;
}

export interface FinopsSyncResponse {
    jobId: string;
    status: string;
    message: string;
}

export interface FinopsSyncJobPayload {
    jobId: string;
    cloudAccountId: string;
    organizationId: string;
    cloudProvider: string;
    granularity: 'DAILY' | 'MONTHLY';
    startDate: string;
    endDate: string;
}

@Injectable()
export class FinopsService {
    private readonly logger = new Logger(FinopsService.name);

    constructor(
        @InjectRepository(FinopsConsent)
        private readonly consentRepo: Repository<FinopsConsent>,

        @InjectRepository(FinopsJob)
        private readonly jobRepo: Repository<FinopsJob>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,

        @InjectQueue(FINOPS_QUEUE)
        private readonly finopsQueue: Queue,
    ) {}

    // =========================================================================
    // Consentimento
    // =========================================================================

    /**
     * Retorna o estado de consentimento para a conta e provider informados.
     * Cria um registro pendente se ainda não existir.
     */
    async getConsent(cloudAccountId: string, organizationId: string, cloudProvider: 'aws' | 'azure'): Promise<FinopsConsentResponse> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const existing = await this.consentRepo.findOne({
            where: { cloudAccountId, cloudProvider },
        });

        return {
            cloudAccountId,
            cloudProvider,
            accepted: existing?.accepted ?? false,
            acceptedAt: existing?.acceptedAt ?? null,
            version: existing?.version ?? FINOPS_CONSENT_VERSION,
            terms: FINOPS_CONSENT_TERMS,
        };
    }

    /**
     * Registra a aceitação do termo de consentimento pelo usuário.
     * Cria ou atualiza o registro para a conta + provider.
     */
    async acceptConsent(cloudAccountId: string, organizationId: string, cloudProvider: 'aws' | 'azure'): Promise<FinopsConsentResponse> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const existing = await this.consentRepo.findOne({
            where: { cloudAccountId, cloudProvider },
        });

        const now = new Date();

        if (existing) {
            await this.consentRepo.update(existing.id, {
                accepted: true,
                acceptedAt: now,
                version: FINOPS_CONSENT_VERSION,
            });
        } else {
            const consent = this.consentRepo.create({
                organizationId,
                cloudAccountId,
                cloudProvider,
                accepted: true,
                acceptedAt: now,
                version: FINOPS_CONSENT_VERSION,
            });
            await this.consentRepo.save(consent);
        }

        this.logger.log(`Consentimento FinOps aceito: conta=${cloudAccountId}, provider=${cloudProvider}`);

        return {
            cloudAccountId,
            cloudProvider,
            accepted: true,
            acceptedAt: now,
            version: FINOPS_CONSENT_VERSION,
            terms: FINOPS_CONSENT_TERMS,
        };
    }

    /**
     * Revoga o consentimento. Não apaga dados históricos já coletados.
     */
    async revokeConsent(cloudAccountId: string, organizationId: string, cloudProvider: 'aws' | 'azure'): Promise<void> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const existing = await this.consentRepo.findOne({
            where: { cloudAccountId, cloudProvider },
        });

        if (!existing || !existing.accepted) {
            throw new BadRequestException(ErrorMessages.FINOPS.CONSENT_NOT_FOUND);
        }

        await this.consentRepo.update(existing.id, {
            accepted: false,
            acceptedAt: null,
        });

        this.logger.log(`Consentimento FinOps revogado: conta=${cloudAccountId}, provider=${cloudProvider}`);
    }

    // =========================================================================
    // Sync
    // =========================================================================

    /**
     * Inicia a coleta de custos de forma assíncrona.
     * Valida consentimento antes de enfileirar o job.
     */
    async startSync(
        cloudAccountId: string,
        organizationId: string,
        cloudProvider: 'aws' | 'azure',
        granularity: 'daily' | 'monthly',
        startDate: string,
        endDate: string,
    ): Promise<FinopsSyncResponse> {
        const account = await this.requireCloudAccount(cloudAccountId, organizationId);

        await this.requireConsent(cloudAccountId, cloudProvider);

        const existingJob = await this.findPendingJob(cloudAccountId, organizationId, cloudProvider);

        if (existingJob) {
            return {
                jobId: String(existingJob.id),
                status: 'pending',
                message: `Já existe um job de coleta em andamento para esta conta (${cloudProvider}). Acompanhe em GET /finops/accounts/${cloudAccountId}/jobs/${existingJob.data.jobId}`,
            };
        }

        const bullGranularity = granularity.toUpperCase() as 'DAILY' | 'MONTHLY';

        const job = this.jobRepo.create({
            organizationId,
            cloudAccountId,
            cloudProvider: account.provider,
            status: 'pending',
            granularity: granularity,
            periodStart: new Date(startDate),
            periodEnd: new Date(endDate),
        });

        const savedJob = await this.jobRepo.save(job);

        const payload: FinopsSyncJobPayload = {
            jobId: savedJob.id,
            cloudAccountId,
            organizationId,
            cloudProvider: account.provider,
            granularity: bullGranularity,
            startDate,
            endDate,
        };

        await this.finopsQueue.add(FINOPS_JOB_NAME, payload, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 20 },
        });

        this.logger.log(`FinOps sync job ${savedJob.id} enfileirado para conta ${cloudAccountId} (${cloudProvider})`);

        return {
            jobId: savedJob.id,
            status: 'pending',
            message: `Coleta de custos enfileirada. Acompanhe em GET /finops/accounts/${cloudAccountId}/jobs/${savedJob.id}`,
        };
    }

    /**
     * Retorna o status de um job de coleta específico.
     */
    async getJob(jobId: string, cloudAccountId: string, organizationId: string): Promise<FinopsJob> {
        const job = await this.jobRepo.findOne({
            where: { id: jobId, cloudAccountId, organizationId },
        });

        if (!job) {
            throw new NotFoundException(ErrorMessages.FINOPS.JOB_NOT_FOUND);
        }

        return job;
    }

    /**
     * Lista os jobs de coleta de custos para uma conta com paginação simples.
     */
    async listJobs(cloudAccountId: string, organizationId: string): Promise<FinopsJob[]> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        return this.jobRepo.find({
            where: { cloudAccountId, organizationId },
            order: { createdAt: 'DESC' },
            take: 50,
        });
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private async requireCloudAccount(cloudAccountId: string, organizationId: string): Promise<CloudAccount> {
        const account = await this.cloudAccountRepo.findOne({
            where: { id: cloudAccountId, organizationId },
        });

        if (!account) {
            throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        return account;
    }

    private async requireConsent(cloudAccountId: string, cloudProvider: string): Promise<void> {
        const consent = await this.consentRepo.findOne({
            where: { cloudAccountId, cloudProvider: cloudProvider as any },
        });

        if (!consent || !consent.accepted) {
            throw new ConflictException(ErrorMessages.FINOPS.CONSENT_REQUIRED);
        }
    }

    private async findPendingJob(
        cloudAccountId: string,
        organizationId: string,
        cloudProvider: string,
    ): Promise<Job | undefined> {
        const jobs = await this.finopsQueue.getJobs([...FINOPS_PENDING_STATES], 0, 49, false);

        return jobs.find((job) => {
            const payload = job.data as Partial<FinopsSyncJobPayload>;
            return (
                job.name === FINOPS_JOB_NAME &&
                payload.cloudAccountId === cloudAccountId &&
                payload.organizationId === organizationId &&
                payload.cloudProvider === cloudProvider
            );
        });
    }
}
