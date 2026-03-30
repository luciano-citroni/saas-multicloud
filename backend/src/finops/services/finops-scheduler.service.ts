import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { FinopsConsent } from '../../db/entites/finops-consent.entity';

import { FinopsService } from './finops.service';

/**
 * Agenda rotinas automáticas de sincronização de custos FinOps.
 *
 * - Sync diário: executa todo dia às 02:00, coleta dados do dia anterior.
 * - Fechamento mensal: executa no dia 6 de cada mês às 03:00,
 *   coleta dados completos do mês anterior para garantir o fechamento correto do billing.
 *
 * Idempotência: o processador usa upsert nos registros de custo, portanto re-runs
 * do mesmo período não duplicam dados. Além disso, FinopsService.startSync()
 * verifica jobs pendentes na fila antes de enfileirar um novo.
 */
@Injectable()
export class FinopsSchedulerService {
    private readonly logger = new Logger(FinopsSchedulerService.name);

    constructor(
        @InjectRepository(FinopsConsent)
        private readonly consentRepo: Repository<FinopsConsent>,

        private readonly finopsService: FinopsService,
    ) {}

    // =========================================================================
    // Sync Diário — todo dia às 02:00
    // =========================================================================

    /**
     * Executa todos os dias às 02:00.
     * Sincroniza os dados de custo do dia anterior para todas as contas com
     * consentimento ativo.
     */
    @Cron('0 2 * * *')
    async runDailySync(): Promise<void> {
        this.logger.log('[FinOps Scheduler] Iniciando sync diário...');

        const consents = await this.findActiveConsents();

        if (consents.length === 0) {
            this.logger.log('[FinOps Scheduler] Nenhum consentimento ativo encontrado. Sync diário ignorado.');
            return;
        }

        const yesterday = this.getYesterdayDateString();

        this.logger.log(`[FinOps Scheduler] Sync diário: ${consents.length} conta(s) ativas, período=${yesterday}`);

        const { success, failed } = await this.syncAll(consents, 'daily', yesterday, yesterday);

        this.logger.log(`[FinOps Scheduler] Sync diário concluído: ${success} enfileirado(s), ${failed} falha(s).`);
    }

    // =========================================================================
    // Fechamento Mensal — dia 6 de cada mês às 03:00
    // =========================================================================

    /**
     * Executa no dia 6 de cada mês às 03:00.
     * Realiza um sync incremental completo do mês anterior para garantir o
     * fechamento correto do billing (provedores de nuvem podem ajustar valores
     * de custo retroativamente nos primeiros dias do mês).
     *
     * Exemplo: dia 6 de abril → sincroniza dados de 01/03 a 31/03.
     */
    @Cron('0 3 6 * *')
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

        const { success, failed } = await this.syncAll(consents, 'monthly', startDate, endDate);

        this.logger.log(`[FinOps Scheduler] Fechamento mensal concluído: ${success} enfileirado(s), ${failed} falha(s).`);
    }

    // =========================================================================
    // Helpers privados
    // =========================================================================

    /**
     * Busca todos os registros de consentimento com accepted = true.
     */
    private async findActiveConsents(): Promise<FinopsConsent[]> {
        return this.consentRepo.find({ where: { accepted: true } });
    }

    /**
     * Enfileira um job de sync para cada consentimento ativo, capturando erros
     * individualmente para não interromper o lote.
     */
    private async syncAll(
        consents: FinopsConsent[],
        granularity: 'daily' | 'monthly',
        startDate: string,
        endDate: string,
    ): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        for (const consent of consents) {
            try {
                await this.finopsService.startSync(
                    consent.cloudAccountId,
                    consent.organizationId,
                    consent.cloudProvider,
                    granularity,
                    startDate,
                    endDate,
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
     * Retorna a data de ontem no formato YYYY-MM-DD (sempre em UTC).
     *
     * Usa construtores UTC explícitos para evitar divergência entre o timezone
     * local do servidor e o formato ISO retornado por toISOString().
     * Se o servidor estiver em UTC+3 e o código usar new Date() local,
     * toISOString() pode retornar o dia anterior ao esperado.
     */
    private getYesterdayDateString(): string {
        const now = new Date();
        const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
        return yesterday.toISOString().slice(0, 10);
    }

    /**
     * Retorna o intervalo completo do mês anterior (primeiro e último dia) em UTC.
     * Usado pelo fechamento mensal para garantir dados íntegros de billing.
     *
     * Usa construtores UTC explícitos: new Date(year, month, day) cria uma data
     * em timezone local, e ao converter com toISOString() (UTC) o resultado pode
     * ser um dia antes em servidores com timezone UTC+ (ex: UTC+3 converte
     * "01/03 00:00 local" para "28/02 21:00 UTC", resultando em startDate errada).
     */
    private getPreviousMonthDateRange(): { startDate: string; endDate: string } {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth(); // 0-indexed: mês atual

        // Primeiro dia do mês anterior (UTC)
        const firstDayPrevMonth = new Date(Date.UTC(year, month - 1, 1));
        // Último dia do mês anterior = dia 0 do mês atual (UTC)
        const lastDayPrevMonth = new Date(Date.UTC(year, month, 0));

        return {
            startDate: firstDayPrevMonth.toISOString().slice(0, 10),
            endDate: lastDayPrevMonth.toISOString().slice(0, 10),
        };
    }
}
