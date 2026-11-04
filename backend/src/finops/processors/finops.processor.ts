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
import { GcpFinopsProvider } from '../providers/gcp-finops.provider';
import type { IFinopsProvider } from '../providers/finops-provider.interface';

import { FinopsCostIngestionService } from '../services/finops-cost-ingestion.service';
import { FinopsCostAggregationService } from '../services/finops-cost-aggregation.service';
import { FinopsAnomalyDetectionService } from '../services/finops-anomaly-detection.service';
import { FinopsOptimizationService } from '../services/finops-optimization.service';

import { FINOPS_QUEUE, FINOPS_WORKER_CONCURRENCY } from '../constants';
import { findCloudAccountForTenant } from '../utils/find-cloud-account';

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
        private readonly gcpProvider: GcpFinopsProvider,

        private readonly ingestionService: FinopsCostIngestionService,
        private readonly aggregationService: FinopsCostAggregationService,
        private readonly anomalyService: FinopsAnomalyDetectionService,
        private readonly optimizationService: FinopsOptimizationService,
    ) {
        super();
    }

    async process(job: Job<FinopsSyncJobPayload>): Promise<void> {
        const {
            jobId,
            cloudAccountId,
            organizationId,
            cloudProvider,
            granularity,
            startDate,
            endDate,
            triggerType = 'manual',
        } = job.data;

        this.logger.log(`[${jobId}] Iniciando coleta de custos para conta ${cloudAccountId} (${cloudProvider})`);

        await this.jobRepo.update(jobId, { status: 'running' });

        try {
            // ── 1. Carregar credenciais ───────────────────────────────────────
            this.logger.log(`[${jobId}] Fase 1/6: Carregando credenciais...`);
            await job.updateProgress(8);

            const cloudAccount = await findCloudAccountForTenant(this.cloudAccountRepo, cloudAccountId, organizationId, {
                withCredentials: true,
            });

            if (!cloudAccount) {
                throw new Error(`CloudAccount ${cloudAccountId} não encontrada`);
            }

            // ── 2. Coletar custos via provider (serviço + região) ─────────────
            this.logger.log(`[${jobId}] Fase 2/6: Coletando custos via ${cloudProvider}...`);
            await job.updateProgress(20);

            const provider = this.resolveProvider(cloudProvider);
            const decryptedCredentials = this.decryptCloudCredentials(cloudAccount.credentialsEncrypted);
            const providerCreds = { credentials: decryptedCredentials, cloudAccountId };

            const { entries } = await provider.collectCosts(providerCreds, startDate, endDate, granularity);

            // ── 3. Coletar custos por recurso (AWS CE WithResources ≤ 14d) ───
            this.logger.log(`[${jobId}] Fase 3/6: Coletando custos por recurso...`);
            await job.updateProgress(35);

            let resourceEntries: typeof entries = [];
            try {
                const resourceStartDate = this.clampResourceCostStart(startDate, endDate);
                const resourceResult = await provider.collectResourceCosts(
                    providerCreds,
                    resourceStartDate,
                    endDate,
                    granularity,
                );
                resourceEntries = resourceResult.entries;
            } catch (error) {
                this.logger.warn(
                    `[${jobId}] collectResourceCosts falhou (seguindo só com serviço): ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }

            const allEntries = [...entries, ...resourceEntries];

            // ── 4. Ingestão (normalize + persist) ────────────────────────────
            this.logger.log(
                `[${jobId}] Fase 4/6: Persistindo ${allEntries.length} registros (serviço=${entries.length}, recurso=${resourceEntries.length})...`,
            );
            await job.updateProgress(50);

            const { recordsUpserted } = await this.ingestionService.ingest(
                organizationId,
                cloudAccountId,
                cloudProvider,
                startDate,
                endDate,
                granularity,
                allEntries,
                triggerType,
            );

            // ── 5. Agregar (atualiza cost_aggregates) ─────────────────────────
            this.logger.log(`[${jobId}] Fase 5/6: Calculando agregados mensais...`);
            await job.updateProgress(70);

            const start = new Date(startDate + 'T00:00:00Z');
            const end = new Date(endDate + 'T00:00:00Z');

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

            // ── 6. Detecção de anomalias + recomendações ──────────────────────
            // Baseline: custo diário ~3 meses; marca só anomalias dos últimos 7 dias.
            this.logger.log(`[${jobId}] Fase 6/6: Detectando anomalias (últimos 7d) e gerando recomendações...`);
            await job.updateProgress(85);

            if (granularity === 'DAILY') {
                await this.anomalyService.detectRecentWindow(
                    organizationId,
                    cloudAccountId,
                    cloudProvider,
                    endDate,
                    7,
                );
            }

            await this.optimizationService.generateCrossModuleRecommendations(
                cloudAccountId,
                organizationId,
                cloudProvider,
            );

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

    /** AWS Cost Explorer WithResources só cobre ~14 dias — evita falhar o range inteiro. */
    private clampResourceCostStart(startDate: string, endDate: string): string {
        const end = new Date(`${endDate}T00:00:00Z`);
        const minStart = new Date(end);
        minStart.setUTCDate(end.getUTCDate() - 13);
        const start = new Date(`${startDate}T00:00:00Z`);
        const clamped = start > minStart ? start : minStart;
        return clamped.toISOString().slice(0, 10);
    }

    private resolveProvider(cloudProvider: string): IFinopsProvider {
        if (cloudProvider === 'aws') return this.awsProvider;
        if (cloudProvider === 'azure') return this.azureProvider;
        if (cloudProvider === 'gcp') return this.gcpProvider;
        throw new Error(`Provider FinOps não suportado: ${cloudProvider}`);
    }

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
