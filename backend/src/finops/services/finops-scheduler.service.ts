import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { InjectQueue } from '@nestjs/bullmq';

import { Queue } from 'bullmq';

import { FinopsConsent } from '../../db/entites/finops-consent.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { AzureAssessmentJob } from '../../db/entites/azure-assessment-job.entity';

import { FinopsService } from './finops.service';
import { FinopsBudgetService } from './finops-budget.service';
import { FinopsAnomalyAlertService } from './finops-anomaly-alert.service';

import { GENERAL_SYNC_QUEUE, GENERAL_SYNC_JOB_NAME } from '../../aws/assessment/constants';
import { GCP_GENERAL_SYNC_QUEUE, GCP_GENERAL_SYNC_JOB_NAME } from '../../gcp/assessment/constants';
import { AZURE_ASSESSMENT_QUEUE, AZURE_ASSESSMENT_JOB_NAME } from '../../azure/assessment/constants';

/** Lookback de custo diário ≈ 3 meses — baseline da detecção de anomalias. */
const DAILY_COST_LOOKBACK_DAYS = 90;

/**
 * Agenda rotinas automáticas de sincronização de custos FinOps, inventário e orçamentos.
 *
 * - Sync diário: 02:00 UTC — inventário + custos incrementais (sobreposição de 3 dias; o primeiro sync ainda cobre 90d) + anomalias nos últimos 7d.
 * - Fechamento mensal: dia 6 às 04:00 — substitui só o mês anterior. Os demais períodos não são apagados.
 * - Digest de anomalias: 07:00 America/Sao_Paulo — e-mail/WhatsApp via grupos de Notificações.
 * - Alertas de orçamento: 2× ao dia (11:00 e 23:00 UTC).
 */
@Injectable()
export class FinopsSchedulerService {
    private readonly logger = new Logger(FinopsSchedulerService.name);

    constructor(
        @InjectRepository(FinopsConsent)
        private readonly consentRepo: Repository<FinopsConsent>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,

        @InjectRepository(AzureAssessmentJob)
        private readonly azureAssessmentJobRepo: Repository<AzureAssessmentJob>,

        @InjectQueue(GENERAL_SYNC_QUEUE)
        private readonly awsGeneralSyncQueue: Queue,

        @InjectQueue(GCP_GENERAL_SYNC_QUEUE)
        private readonly gcpGeneralSyncQueue: Queue,

        @InjectQueue(AZURE_ASSESSMENT_QUEUE)
        private readonly azureAssessmentQueue: Queue,

        private readonly finopsService: FinopsService,
        private readonly finopsBudgetService: FinopsBudgetService,
        private readonly finopsAnomalyAlertService: FinopsAnomalyAlertService,
    ) {}

    @Cron('0 2 * * *')
    async runDailySync(): Promise<void> {
        this.logger.log('[FinOps Scheduler] Iniciando sync diário...');

        const consents = await this.findActiveConsents();

        if (consents.length === 0) {
            this.logger.log('[FinOps Scheduler] Nenhum consentimento ativo encontrado. Sync diário ignorado.');
            return;
        }

        const inventory = await this.enqueueInventorySyncs(consents);
        this.logger.log(
            `[FinOps Scheduler] Inventário enfileirado: ${inventory.success} ok, ${inventory.failed} falha(s).`,
        );

        const { startDate, endDate } = this.getDailyLookbackRange();

        this.logger.log(
            `[FinOps Scheduler] Sync diário de custos: ${consents.length} conta(s), período=${startDate} → ${endDate}`,
        );

        const { success, failed } = await this.syncAll(
            consents,
            'daily',
            startDate,
            endDate,
            'scheduled_daily',
        );

        this.logger.log(`[FinOps Scheduler] Sync diário concluído: ${success} enfileirado(s), ${failed} falha(s).`);
    }

    @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
    async runAnomalyAlertDigest(): Promise<void> {
        this.logger.log('[FinOps Scheduler] Iniciando digest diário de anomalias...');

        try {
            const result = await this.finopsAnomalyAlertService.evaluateAndNotifyDigests();
            this.logger.log(
                `[FinOps Scheduler] Digest de anomalias: evaluated=${result.evaluated} notified=${result.notified}`,
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[FinOps Scheduler] Falha no digest de anomalias: ${message}`);
        }
    }

    @Cron('0 11,23 * * *')
    async runBudgetAlertEvaluation(): Promise<void> {
        this.logger.log('[FinOps Scheduler] Iniciando avaliação de alertas de orçamento...');

        try {
            const result = await this.finopsBudgetService.evaluateAndNotifyBudgets();
            this.logger.log(
                `[FinOps Scheduler] Alertas de orçamento: evaluated=${result.evaluated} notified=${result.notified}`,
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[FinOps Scheduler] Falha na avaliação de orçamentos: ${message}`);
        }
    }

    @Cron('0 4 6 * *')
    async runMonthlyClosingSync(): Promise<void> {
        this.logger.log('[FinOps Scheduler] Iniciando fechamento mensal...');

        const consents = await this.findActiveConsents();

        if (consents.length === 0) {
            this.logger.log('[FinOps Scheduler] Nenhum consentimento ativo encontrado. Fechamento mensal ignorado.');
            return;
        }

        const { startDate, endDate } = this.getPreviousMonthDateRange();

        this.logger.log(
            `[FinOps Scheduler] Fechamento mensal: ${consents.length} conta(s) ativas, período=${startDate} → ${endDate}`,
        );

        const { success, failed } = await this.syncAll(
            consents,
            'monthly',
            startDate,
            endDate,
            'scheduled_monthly_close',
        );

        this.logger.log(`[FinOps Scheduler] Fechamento mensal concluído: ${success} enfileirado(s), ${failed} falha(s).`);
    }

    private async findActiveConsents(): Promise<FinopsConsent[]> {
        return this.consentRepo.find({ where: { accepted: true } });
    }

    private async syncAll(
        consents: FinopsConsent[],
        granularity: 'daily' | 'monthly',
        startDate: string,
        endDate: string,
        triggerType: 'manual' | 'scheduled_daily' | 'scheduled_monthly_close',
    ): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        for (const consent of consents) {
            try {
                await this.finopsService.startSync(
                    consent.cloudAccountId,
                    consent.organizationId,
                    consent.cloudProvider as 'aws' | 'azure' | 'gcp',
                    granularity,
                    startDate,
                    endDate,
                    triggerType,
                );
                success++;
            } catch (error) {
                failed++;
                this.logger.error(
                    `[FinOps Scheduler] Falha ao enfileirar sync para conta ${consent.cloudAccountId} (${consent.cloudProvider}): ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        return { success, failed };
    }

    /**
     * Enfileira general sync / assessment sync por provedor, sem exigir userId
     * (bypass das checagens de acesso do controller — cron interno).
     */
    private async enqueueInventorySyncs(
        consents: FinopsConsent[],
    ): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        for (const consent of consents) {
            try {
                const provider = consent.cloudProvider.toLowerCase();

                if (provider === 'aws') {
                    await this.cloudAccountRepo.update(
                        { id: consent.cloudAccountId, tenantId: consent.organizationId },
                        { isGeneralSyncInProgress: true },
                    );
                    await this.awsGeneralSyncQueue.add(
                        GENERAL_SYNC_JOB_NAME,
                        { cloudAccountId: consent.cloudAccountId },
                        {
                            attempts: 2,
                            backoff: { type: 'exponential', delay: 5000 },
                            removeOnComplete: { count: 50 },
                            removeOnFail: { count: 20 },
                        },
                    );
                } else if (provider === 'gcp') {
                    await this.cloudAccountRepo.update(
                        { id: consent.cloudAccountId, tenantId: consent.organizationId },
                        { isGeneralSyncInProgress: true },
                    );
                    await this.gcpGeneralSyncQueue.add(
                        GCP_GENERAL_SYNC_JOB_NAME,
                        { cloudAccountId: consent.cloudAccountId },
                        {
                            attempts: 2,
                            backoff: { type: 'exponential', delay: 5000 },
                            removeOnComplete: { count: 50 },
                            removeOnFail: { count: 20 },
                        },
                    );
                } else if (provider === 'azure') {
                    const job = this.azureAssessmentJobRepo.create({
                        cloudAccountId: consent.cloudAccountId,
                        organizationId: consent.organizationId,
                        status: 'pending',
                    });
                    const saved = await this.azureAssessmentJobRepo.save(job);
                    await this.azureAssessmentQueue.add(
                        AZURE_ASSESSMENT_JOB_NAME,
                        {
                            jobId: saved.id,
                            cloudAccountId: consent.cloudAccountId,
                            organizationId: consent.organizationId,
                            runSync: true,
                        },
                        {
                            attempts: 2,
                            backoff: { type: 'exponential', delay: 5000 },
                            removeOnComplete: { count: 50 },
                            removeOnFail: { count: 20 },
                        },
                    );
                } else {
                    this.logger.warn(
                        `[FinOps Scheduler] Provider desconhecido para inventário: ${consent.cloudProvider}`,
                    );
                    failed++;
                    continue;
                }

                success++;
            } catch (error) {
                failed++;
                this.logger.error(
                    `[FinOps Scheduler] Falha ao enfileirar inventário ${consent.cloudAccountId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }

        return { success, failed };
    }

    /** yesterday-(lookback-1) → yesterday (90 dias inclusive para baseline). */
    private getDailyLookbackRange(): { startDate: string; endDate: string } {
        const now = new Date();
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
        const start = new Date(end);
        start.setUTCDate(end.getUTCDate() - (DAILY_COST_LOOKBACK_DAYS - 1));

        return {
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
        };
    }

    private getPreviousMonthDateRange(): { startDate: string; endDate: string } {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();

        const firstDayPrevMonth = new Date(Date.UTC(year, month - 1, 1));
        const lastDayPrevMonth = new Date(Date.UTC(year, month, 0));

        return {
            startDate: firstDayPrevMonth.toISOString().slice(0, 10),
            endDate: lastDayPrevMonth.toISOString().slice(0, 10),
        };
    }
}
