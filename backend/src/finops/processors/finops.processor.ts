import * as crypto from 'crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';

import { Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Job } from 'bullmq';

import { FinopsJob } from '../../db/entites/finops-job.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

import { AwsFinopsProvider } from '../providers/aws-finops.provider';
import { AzureFinopsProvider } from '../providers/azure-finops.provider';

import { FinopsCostIngestionService } from '../services/finops-cost-ingestion.service';
import { FinopsCostAggregationService } from '../services/finops-cost-aggregation.service';
import { FinopsAnomalyDetectionService } from '../services/finops-anomaly-detection.service';
import { FinopsOptimizationService } from '../services/finops-optimization.service';

import { FINOPS_QUEUE, FINOPS_WORKER_CONCURRENCY } from '../constants';

import type { FinopsSyncJobPayload } from '../services/finops.service';

@Processor(FINOPS_QUEUE, { concurrency: FINOPS_WORKER_CONCURRENCY })
export class FinopsProcessor extends WorkerHost {
    private readonly logger = new Logger(FinopsProcessor.name);

    constructor(
        @InjectRepository(FinopsJob)
        private readonly jobRepo: Repository<FinopsJob>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,

        private readonly awsProvider: AwsFinopsProvider,
        private readonly azureProvider: AzureFinopsProvider,

        private readonly ingestionService: FinopsCostIngestionService,
        private readonly aggregationService: FinopsCostAggregationService,
        private readonly anomalyService: FinopsAnomalyDetectionService,
        private readonly optimizationService: FinopsOptimizationService,
    ) {
        super();
    }

    async process(job: Job<FinopsSyncJobPayload>): Promise<void> {
        const { jobId, cloudAccountId, organizationId, cloudProvider, granularity, startDate, endDate } = job.data;

        this.logger.log(`[${jobId}] Iniciando coleta de custos para conta ${cloudAccountId} (${cloudProvider})`);

        await this.jobRepo.update(jobId, { status: 'running' });

        try {
            // ── 1. Carregar credenciais ───────────────────────────────────────
            this.logger.log(`[${jobId}] Fase 1/5: Carregando credenciais...`);
            await job.updateProgress(10);

            const cloudAccount = await this.cloudAccountRepo
                .createQueryBuilder('ca')
                .addSelect('ca.credentialsEncrypted')
                .where('ca.id = :id', { id: cloudAccountId })
                .andWhere('ca.organizationId = :organizationId', { organizationId })
                .getOne();

            if (!cloudAccount) {
                throw new Error(`CloudAccount ${cloudAccountId} não encontrada`);
            }

            // ── 2. Coletar custos via provider ────────────────────────────────
            this.logger.log(`[${jobId}] Fase 2/5: Coletando custos via ${cloudProvider}...`);
            await job.updateProgress(25);

            const provider = cloudProvider === 'aws' ? this.awsProvider : this.azureProvider;
            const decryptedCredentials = this.decryptCloudCredentials(cloudAccount.credentialsEncrypted);

            const { entries } = await provider.collectCosts(
                { credentials: decryptedCredentials, cloudAccountId },
                startDate,
                endDate,
                granularity,
            );

            // ── 3. Ingestão (normalize + persist) ────────────────────────────
            this.logger.log(`[${jobId}] Fase 3/5: Persistindo ${entries.length} registros...`);
            await job.updateProgress(50);

            const { recordsUpserted } = await this.ingestionService.ingest(
                organizationId,
                cloudAccountId,
                cloudProvider,
                startDate,
                endDate,
                granularity,
                entries,
                'manual',
            );

            // ── 4. Agregar (atualiza cost_aggregates) ─────────────────────────
            this.logger.log(`[${jobId}] Fase 4/5: Calculando agregados mensais...`);
            await job.updateProgress(70);

            const start = new Date(startDate + 'T00:00:00Z');
            const end = new Date(endDate + 'T00:00:00Z');

            // Agregar todos os meses no range
            const months = new Set<string>();
            const cursor = new Date(start);
            while (cursor <= end) {
                months.add(`${cursor.getUTCFullYear()}-${cursor.getUTCMonth() + 1}`);
                cursor.setUTCMonth(cursor.getUTCMonth() + 1);
            }

            for (const monthKey of months) {
                const [yearStr, monthStr] = monthKey.split('-');
                await this.aggregationService.aggregateForPeriod(
                    organizationId,
                    cloudAccountId,
                    Number(yearStr),
                    Number(monthStr),
                );
            }

            // ── 5. Detecção de anomalias + recomendações ──────────────────────
            this.logger.log(`[${jobId}] Fase 5/5: Detectando anomalias e gerando recomendações...`);
            await job.updateProgress(85);

            // Detectar anomalias para cada dia no range (apenas granularity DAILY)
            if (granularity === 'DAILY') {
                const daysCursor = new Date(start);
                while (daysCursor <= end) {
                    const dateStr = daysCursor.toISOString().slice(0, 10);
                    await this.anomalyService.detectForDate(
                        organizationId,
                        cloudAccountId,
                        cloudProvider,
                        dateStr,
                    );
                    daysCursor.setUTCDate(daysCursor.getUTCDate() + 1);
                }
            }

            await this.optimizationService.generateCrossModuleRecommendations(
                cloudAccountId,
                organizationId,
                cloudProvider,
            );

            // ── Finalizar ─────────────────────────────────────────────────────
            await this.jobRepo.update(jobId, {
                status: 'completed',
                recordsCollected: recordsUpserted,
                completedAt: new Date(),
            });

            await job.updateProgress(100);

            this.logger.log(`[${jobId}] Coleta concluída: ${recordsUpserted} registros`);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.logger.error(`[${jobId}] Falha: ${error}`);
            await this.jobRepo.update(jobId, { status: 'failed', error });
            throw err;
        }
    }

    /**
     * Descriptografa as credenciais usando AES-256-GCM.
     * Replica a lógica de CloudService para evitar dependências circulares.
     */
    private decryptCloudCredentials(encrypted: string): Record<string, any> {
        const keyHex = process.env['CREDENTIALS_ENCRYPTION_KEY'];

        if (!keyHex) throw new Error('CREDENTIALS_ENCRYPTION_KEY não configurada');

        const key = Buffer.from(keyHex, 'hex');

        if (key.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY inválida');

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
