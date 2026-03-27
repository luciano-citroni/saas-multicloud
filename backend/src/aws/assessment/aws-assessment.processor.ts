import { Processor, WorkerHost } from '@nestjs/bullmq';

import { Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Job } from 'bullmq';

import { AwsAssessmentJob } from '../../db/entites/aws-assessment-job.entity';

import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { CloudSyncJob } from '../../db/entites/cloud-sync-job.entity';
import { CloudProvider } from '../../db/entites/cloud-account.entity';

import { AwsAssessmentSyncService } from './aws-assessment-sync.service';

import { AwsAssessmentReportService } from './aws-assessment-report.service';

import { AwsAssessmentExcelService } from './aws-assessment-excel.service';

import { ASSESSMENT_QUEUE, AWS_ASSESSMENT_WORKER_CONCURRENCY } from './constants';

export interface AssessmentJobPayload {
    jobId: string;

    cloudAccountId: string;

    organizationId: string;

    runSync: boolean;
}

@Processor(ASSESSMENT_QUEUE, { concurrency: AWS_ASSESSMENT_WORKER_CONCURRENCY })
export class AwsAssessmentProcessor extends WorkerHost {
    private readonly logger = new Logger(AwsAssessmentProcessor.name);

    constructor(
        @InjectRepository(AwsAssessmentJob)
        private readonly jobRepository: Repository<AwsAssessmentJob>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,

        @InjectRepository(CloudSyncJob)
        private readonly syncJobRepository: Repository<CloudSyncJob>,

        private readonly syncService: AwsAssessmentSyncService,

        private readonly reportService: AwsAssessmentReportService,

        private readonly excelService: AwsAssessmentExcelService
    ) {
        super();
    }

    async process(job: Job<AssessmentJobPayload>): Promise<void> {
        const { jobId, cloudAccountId, organizationId, runSync } = job.data;

        this.logger.log(`[${jobId}] Iniciando assessment para conta ${cloudAccountId}`);

        // Mark as running

        await this.jobRepository.update(jobId, { status: 'running' });

        try {
            // ── 1. Sync ───────────────────────────────────────────────────────

            if (runSync) {
                this.logger.log(`[${jobId}] Fase 1/4: Sincronizando recursos da AWS...`);

                await job.updateProgress(10);

                const syncRecord = this.syncJobRepository.create({
                    cloudAccountId,
                    organizationId,
                    provider: CloudProvider.AWS,
                    status: 'running',
                    error: null,
                    completedAt: null,
                });

                const savedSyncRecord = await this.syncJobRepository.save(syncRecord);

                try {
                    await this.syncService.syncAll(cloudAccountId, organizationId);

                    const syncedAt = new Date();

                    await this.cloudAccountRepository.update({ id: cloudAccountId }, { lastGeneralSyncAt: syncedAt });

                    await this.syncJobRepository.update(savedSyncRecord.id, {
                        status: 'completed',
                        completedAt: syncedAt,
                    });
                } catch (syncErr) {
                    const syncError = syncErr instanceof Error ? syncErr.message : String(syncErr);

                    await this.syncJobRepository.update(savedSyncRecord.id, {
                        status: 'failed',
                        error: syncError,
                        completedAt: new Date(),
                    });

                    throw syncErr;
                }

                this.logger.log(`[${jobId}] Sincronização concluída`);
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

            await job.updateProgress(80);

            // ── 5. Persist result ─────────────────────────────────────────────

            await this.jobRepository.update(jobId, {
                status: 'completed',

                excelFileName,

                completedAt: new Date(),
            });

            await job.updateProgress(100);

            this.logger.log(`[${jobId}] Assessment concluído com sucesso`);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);

            this.logger.error(`[${jobId}] Assessment falhou: ${error}`);

            await this.jobRepository.update(jobId, { status: 'failed', error });

            throw err; // Let BullMQ handle retries
        }
    }
}
