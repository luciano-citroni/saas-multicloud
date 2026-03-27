import { Processor, WorkerHost } from '@nestjs/bullmq';

import { Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Job } from 'bullmq';

import { AzureAssessmentJob } from '../../db/entites/azure-assessment-job.entity';

import { AzureSyncService } from '../sync/azure-sync.service';

import { AzureAssessmentReportService } from './azure-assessment-report.service';

import { AzureAssessmentExcelService } from './azure-assessment-excel.service';

import { AZURE_ASSESSMENT_QUEUE, AZURE_ASSESSMENT_WORKER_CONCURRENCY } from './constants';

export interface AzureAssessmentJobPayload {
    jobId: string;

    cloudAccountId: string;

    organizationId: string;

    runSync: boolean;
}

@Processor(AZURE_ASSESSMENT_QUEUE, { concurrency: AZURE_ASSESSMENT_WORKER_CONCURRENCY })
export class AzureAssessmentProcessor extends WorkerHost {
    private readonly logger = new Logger(AzureAssessmentProcessor.name);

    constructor(
        @InjectRepository(AzureAssessmentJob)
        private readonly jobRepository: Repository<AzureAssessmentJob>,

        private readonly syncService: AzureSyncService,

        private readonly reportService: AzureAssessmentReportService,

        private readonly excelService: AzureAssessmentExcelService
    ) {
        super();
    }

    async process(job: Job<AzureAssessmentJobPayload>): Promise<void> {
        const { jobId, cloudAccountId, organizationId, runSync } = job.data;

        this.logger.log(`[${jobId}] Iniciando assessment Azure para conta ${cloudAccountId}`);

        await this.jobRepository.update(jobId, { status: 'running' });

        try {
            // ── 1. Sync ───────────────────────────────────────────────────────

            if (runSync) {
                this.logger.log(`[${jobId}] Fase 1/4: Sincronizando recursos Azure...`);

                await job.updateProgress(10);

                const syncResult = await this.syncService.syncResources(cloudAccountId, organizationId);

                this.logger.log(`[${jobId}] Sincronização concluída. Total sincronizado: ${syncResult.totalSynced}`);
            }

            // ── 2. Collect data from DB ───────────────────────────────────────

            this.logger.log(`[${jobId}] Fase 2/4: Coletando dados do banco de dados...`);

            await job.updateProgress(40);

            const data = await this.reportService.collectAllData(cloudAccountId);

            const summary = this.reportService.buildSummary(data);

            this.logger.log(`[${jobId}] Total de recursos: ${summary.totalResources}`);

            // ── 3. Generate Excel ─────────────────────────────────────────────

            this.logger.log(`[${jobId}] Fase 3/4: Gerando arquivo Excel...`);

            await job.updateProgress(60);

            const excelFileName = await this.excelService.generateExcel(jobId, data);

            // ── 4. Finalize job ───────────────────────────────────────────────

            this.logger.log(`[${jobId}] Fase 4/4: Finalizando job...`);

            await job.updateProgress(90);

            await this.jobRepository.update(jobId, {
                status: 'completed',

                excelFileName,

                completedAt: new Date(),
            });

            await job.updateProgress(100);

            this.logger.log(`[${jobId}] Assessment Azure concluído com sucesso`);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);

            this.logger.error(`[${jobId}] Assessment Azure falhou: ${error}`);

            await this.jobRepository.update(jobId, { status: 'failed', error });

            throw err;
        }
    }
}
