import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsConnection } from '../../db/entites/ai-finops-connection.entity';
import { AiFinopsConnectionService } from './ai-finops-connection.service';
import { AiFinopsBudgetService } from './ai-finops-budget.service';
import { AiFinopsAlertDispatchService } from './ai-finops-alert-dispatch.service';

/**
 * Agenda rotinas automáticas de AI FinOps (BYOK).
 *
 * - Sync diário: 02:00 UTC — mesmo horário do FinOps (`FinopsSchedulerService.runDailySync`).
 * - Orçamentos / falhas: 2× ao dia (00:00 e 12:00 UTC).
 */
@Injectable()
export class AiFinopsSchedulerService {
    private readonly logger = new Logger(AiFinopsSchedulerService.name);

    constructor(
        @InjectRepository(AiFinopsConnection)
        private readonly connectionRepository: Repository<AiFinopsConnection>,
        private readonly connectionService: AiFinopsConnectionService,
        private readonly budgetService: AiFinopsBudgetService,
        private readonly alerts: AiFinopsAlertDispatchService,
    ) {}

    /** Mesmo cron do sync diário de custos FinOps (`0 2 * * *` UTC). */
    @Cron('0 2 * * *')
    async enqueueDailySyncs(): Promise<void> {
        this.logger.log('[AI FinOps Scheduler] Iniciando sync diário (alinhado ao FinOps 02:00 UTC)...');

        const connections = await this.connectionRepository.find({
            where: [{ status: 'active' }, { status: 'partial' }],
        });

        if (connections.length === 0) {
            this.logger.log('[AI FinOps Scheduler] Nenhuma conexão ativa/parcial. Sync diário ignorado.');
            return;
        }

        let success = 0;
        let failed = 0;

        for (const connection of connections) {
            try {
                await this.connectionService.enqueueSync(connection.tenantId, connection.id, {
                    syncType: 'incremental',
                });
                success++;
            } catch (error) {
                failed++;
                this.logger.warn(
                    `[AI FinOps Scheduler] daily sync skip connection=${connection.id}: ${
                        error instanceof Error ? error.message : 'error'
                    }`,
                );
            }
        }

        this.logger.log(
            `[AI FinOps Scheduler] Sync diário concluído: ${success} enfileirado(s), ${failed} falha(s).`,
        );
    }

    @Cron('0 12,0 * * *')
    async evaluateBudgets(): Promise<void> {
        await this.budgetService.evaluateAndNotify();
        await this.alerts.scanSyncAndCredentialFailures();
    }
}
