import { Processor, WorkerHost } from '@nestjs/bullmq';

import { Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Job } from 'bullmq';

import { GovernanceJob } from '../../db/entites/governance-job.entity';

import { GovernanceScanService } from '../services/governance-scan.service';

import { GOVERNANCE_QUEUE, GOVERNANCE_WORKER_CONCURRENCY } from '../constants';

export interface GovernanceJobPayload {
    jobId: string;
    cloudAccountId: string;
    organizationId: string;
}

@Processor(GOVERNANCE_QUEUE, { concurrency: GOVERNANCE_WORKER_CONCURRENCY })
export class GovernanceProcessor extends WorkerHost {
    private readonly logger = new Logger(GovernanceProcessor.name);

    constructor(
        @InjectRepository(GovernanceJob)
        private readonly jobRepo: Repository<GovernanceJob>,

        private readonly scanService: GovernanceScanService
    ) {
        super();
    }

    async process(job: Job<GovernanceJobPayload>): Promise<void> {
        const { jobId, cloudAccountId, organizationId } = job.data;

        this.logger.log(`[${jobId}] Iniciando scan de governança para conta ${cloudAccountId}`);

        await this.jobRepo.update(jobId, { status: 'running' });

        try {
            // ── 1. Carregar recursos do banco de dados ──────────────────────────
            this.logger.log(`[${jobId}] Fase 1/4: Carregando recursos da conta...`);

            await job.updateProgress(10);

            const resources = await this.scanService.loadResources(cloudAccountId);

            // ── 2. Avaliar políticas ────────────────────────────────────────────
            this.logger.log(`[${jobId}] Fase 2/4: Avaliando políticas de governança...`);

            await job.updateProgress(40);

            const context = { cloudAccountId, organizationId };

            const { findings, score, totalChecks, totalNonCompliant } = this.scanService.evaluatePolicies(resources, context);

            // ── 3. Persistir findings ───────────────────────────────────────────
            this.logger.log(`[${jobId}] Fase 3/4: Salvando ${totalNonCompliant} achados não-conformes...`);

            await job.updateProgress(70);

            await this.scanService.saveFindings(jobId, cloudAccountId, organizationId, findings);

            // ── 4. Finalizar job ────────────────────────────────────────────────
            this.logger.log(`[${jobId}] Fase 4/4: Finalizando job (score=${score})...`);

            await job.updateProgress(90);

            await this.jobRepo.update(jobId, {
                status: 'completed',
                score,
                totalFindings: totalNonCompliant,
                totalChecks,
                completedAt: new Date(),
            });

            await job.updateProgress(100);

            this.logger.log(`[${jobId}] Scan de governança concluído: score=${score}, checks=${totalChecks}, findings=${totalNonCompliant}`);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);

            this.logger.error(`[${jobId}] Scan de governança falhou: ${error}`);

            await this.jobRepo.update(jobId, { status: 'failed', error });

            throw err; // Permite que o BullMQ gerencie retentativas
        }
    }
}
