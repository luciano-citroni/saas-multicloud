import { Processor, WorkerHost } from '@nestjs/bullmq';

import { Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Job } from 'bullmq';

import { FinopsJob } from '../../db/entites/finops-job.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

import { AwsFinopsProvider } from '../providers/aws-finops.provider';
import { AzureFinopsProvider } from '../providers/azure-finops.provider';

import { FinopsAnalysisService } from '../services/finops-analysis.service';

import { FINOPS_QUEUE, FINOPS_WORKER_CONCURRENCY } from '../constants';

import type { FinopsSyncJobPayload } from '../services/finops.service';

@Processor(FINOPS_QUEUE, { concurrency: FINOPS_WORKER_CONCURRENCY })
export class FinopsProcessor extends WorkerHost {
    private readonly logger = new Logger(FinopsProcessor.name);

    constructor(
        @InjectRepository(FinopsJob)
        private readonly jobRepo: Repository<FinopsJob>,

        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,

        private readonly awsProvider: AwsFinopsProvider,

        private readonly azureProvider: AzureFinopsProvider,

        private readonly analysisService: FinopsAnalysisService,
    ) {
        super();
    }

    async process(job: Job<FinopsSyncJobPayload>): Promise<void> {
        const { jobId, cloudAccountId, organizationId, cloudProvider, granularity, startDate, endDate } = job.data;

        this.logger.log(`[${jobId}] Iniciando coleta de custos para conta ${cloudAccountId} (${cloudProvider})`);

        await this.jobRepo.update(jobId, { status: 'running' });

        try {
            // ── 1. Carregar credenciais da conta ─────────────────────────────
            this.logger.log(`[${jobId}] Fase 1/4: Carregando credenciais da conta...`);
            await job.updateProgress(10);

            const cloudAccount = await this.cloudAccountRepo
                .createQueryBuilder('ca')
                .addSelect('ca.credentialsEncrypted')
                .where('ca.id = :id', { id: cloudAccountId })
                .andWhere('ca.organizationId = :organizationId', { organizationId })
                .getOne();

            if (!cloudAccount) {
                throw new Error(`CloudAccount ${cloudAccountId} não encontrada para organização ${organizationId}`);
            }

            // ── 2. Coletar custos via provider ────────────────────────────────
            this.logger.log(`[${jobId}] Fase 2/4: Coletando custos via API do provider ${cloudProvider}...`);
            await job.updateProgress(30);

            const provider = cloudProvider === 'aws' ? this.awsProvider : this.azureProvider;

            const decryptedCredentials = this.decryptCloudCredentials(cloudAccount.credentialsEncrypted);

            const { entries } = await provider.collectCosts(
                { credentials: decryptedCredentials, cloudAccountId },
                startDate,
                endDate,
                granularity,
            );

            // ── 3. Persistir registros de custo ───────────────────────────────
            this.logger.log(`[${jobId}] Fase 3/4: Persistindo ${entries.length} registros de custo...`);
            await job.updateProgress(60);

            const BATCH_SIZE = 100;

            for (let i = 0; i < entries.length; i += BATCH_SIZE) {
                const batch = entries.slice(i, i + BATCH_SIZE);

                await this.costRecordRepo.upsert(
                    batch.map((entry) => ({
                        organizationId,
                        cloudAccountId,
                        cloudProvider,
                        service: entry.service,
                        region: entry.region ?? '',
                        cost: entry.cost,
                        currency: entry.currency,
                        date: new Date(entry.date),
                        granularity: granularity.toLowerCase() as 'daily' | 'monthly',
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        tags: (entry.tags ?? null) as Record<string, any> | null,
                    })) as any,
                    {
                        conflictPaths: ['cloudAccountId', 'service', 'region', 'date', 'granularity'],
                        skipUpdateIfNoValuesChanged: true,
                    },
                );
            }

            // ── 4. Gerar recomendações de otimização ──────────────────────────
            this.logger.log(`[${jobId}] Fase 4/4: Gerando recomendações de otimização...`);
            await job.updateProgress(85);

            await this.analysisService.generateRecommendations(cloudAccountId, organizationId, cloudProvider);

            // ── Finalizar ─────────────────────────────────────────────────────
            await this.jobRepo.update(jobId, {
                status: 'completed',
                recordsCollected: entries.length,
                completedAt: new Date(),
            });

            await job.updateProgress(100);

            this.logger.log(`[${jobId}] Coleta de custos concluída: ${entries.length} registros coletados`);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);

            this.logger.error(`[${jobId}] Coleta de custos falhou: ${error}`);

            await this.jobRepo.update(jobId, { status: 'failed', error });

            throw err;
        }
    }

    /**
     * Descriptografa as credenciais usando AES-256-GCM.
     * Replica a lógica de CloudService para evitar dependências circulares.
     */
    private decryptCloudCredentials(encrypted: string): Record<string, any> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const crypto = require('crypto') as typeof import('crypto');

        const keyHex = process.env['CREDENTIALS_ENCRYPTION_KEY'] ?? '0'.repeat(64);
        const key = Buffer.from(keyHex, 'hex');

        if (key.length !== 32) {
            throw new Error('CREDENTIALS_ENCRYPTION_KEY inválida: deve ter 32 bytes (64 hex chars)');
        }

        const combined = Buffer.from(encrypted, 'base64').toString('utf8');
        const [ivHex, authTagHex, ciphertext] = combined.split(':');

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    }
}
