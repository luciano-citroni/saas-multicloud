import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { FinopsBudget } from '../../db/entites/finops-budget.entity';
import type {
    FinopsBudgetAlertChannel,
    FinopsBudgetAlertFrequency,
    FinopsBudgetAlertType,
    FinopsBudgetPeriod,
    FinopsBudgetScope,
} from '../../db/entites/finops-budget.entity';
import { FinopsBudgetAlertEvent } from '../../db/entites/finops-budget-alert-event.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import { NotificationsService } from '../../notifications/notifications.service';
import { MailerService } from '../../mailer/mailer.service';
import { findCloudAccountForTenant } from '../utils/find-cloud-account';
import { andWhereServiceLevelCost } from '../utils/service-level-cost';

export interface CreateBudgetDto {
    name: string;
    amount: number;
    currency?: string;
    period?: FinopsBudgetPeriod;
    scope?: FinopsBudgetScope;
    cloudAccountId?: string | null;
    service?: string | null;
    resourceId?: string | null;
    alertThresholds?: number[];
    alertFrequency?: FinopsBudgetAlertFrequency;
    alertType?: FinopsBudgetAlertType;
    alertAmount?: number | null;
    alertChannels?: FinopsBudgetAlertChannel[];
    alertEmails?: string[];
    alertNotificationGroupIds?: string[];
}

export interface BudgetStatus {
    budget: FinopsBudget;
    currentSpend: number;
    remainingAmount: number;
    usagePercentage: number;
    triggeredAlerts: number[];
    currency: string;
}

export interface OrgBudgetStatus extends BudgetStatus {
    cloudAccountAlias: string;
}

type AlertPayload = {
    currentSpend: number;
    usagePercentage: number;
    limitAmount: number;
    triggeredAlerts: number[];
};

@Injectable()
export class FinopsBudgetService {
    private readonly logger = new Logger(FinopsBudgetService.name);

    constructor(
        @InjectRepository(FinopsBudget)
        private readonly budgetRepo: Repository<FinopsBudget>,

        @InjectRepository(FinopsBudgetAlertEvent)
        private readonly alertEventRepo: Repository<FinopsBudgetAlertEvent>,

        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,

        private readonly notificationsService: NotificationsService,
        private readonly mailerService: MailerService,
    ) {}

    // =========================================================================
    // CRUD
    // =========================================================================

    async create(organizationId: string, dto: CreateBudgetDto): Promise<FinopsBudget> {
        const normalized = this.normalizeCreateDto(dto);
        const alertNotificationGroupIds = await this.validateAndNormalizeNotificationGroups(
            organizationId,
            normalized.alertChannels,
            dto.alertNotificationGroupIds ?? [],
        );

        if (normalized.scope === 'cloud_account') {
            if (!normalized.cloudAccountId) {
                throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
            }
            await this.requireCloudAccount(normalized.cloudAccountId, organizationId);
        }

        const budget = this.budgetRepo.create({
            organizationId,
            cloudAccountId: normalized.scope === 'organization' ? null : normalized.cloudAccountId,
            scope: normalized.scope,
            name: normalized.name,
            amount: normalized.amount,
            currency: normalized.currency,
            period: normalized.period,
            service: normalized.service,
            resourceId: normalized.resourceId,
            alertThresholds: normalized.alertThresholds,
            alertFrequency: normalized.alertFrequency,
            alertType: normalized.alertType,
            alertAmount: normalized.alertAmount,
            alertChannels: normalized.alertChannels,
            alertEmails: normalized.alertEmails,
            alertNotificationGroupIds,
            isActive: true,
        });

        const saved = await this.budgetRepo.save(budget);
        this.logger.log(
            `Budget criado: ${saved.id} (${saved.name}) scope=${saved.scope} account=${saved.cloudAccountId ?? 'tenant'}`,
        );
        return saved;
    }

    /** Compat: criar budget amarrado a uma conta cloud. */
    async createForAccount(
        cloudAccountId: string,
        organizationId: string,
        dto: CreateBudgetDto,
    ): Promise<FinopsBudget> {
        return this.create(organizationId, {
            ...dto,
            scope: 'cloud_account',
            cloudAccountId,
        });
    }

    async list(cloudAccountId: string, organizationId: string): Promise<FinopsBudget[]> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        return this.budgetRepo.find({
            where: { cloudAccountId, organizationId, scope: 'cloud_account' },
            order: { createdAt: 'DESC' },
        });
    }

    async listOrganizationBudgets(organizationId: string): Promise<FinopsBudget[]> {
        return this.budgetRepo.find({
            where: { organizationId, scope: 'organization', cloudAccountId: IsNull() },
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: string, cloudAccountId: string, organizationId: string): Promise<FinopsBudget> {
        const budget = await this.budgetRepo.findOne({
            where: { id, cloudAccountId, organizationId },
        });

        if (!budget) {
            throw new NotFoundException(ErrorMessages.FINOPS.BUDGET_NOT_FOUND);
        }

        return budget;
    }

    async findOneInOrganization(id: string, organizationId: string): Promise<FinopsBudget> {
        const budget = await this.budgetRepo.findOne({
            where: { id, organizationId },
        });

        if (!budget) {
            throw new NotFoundException(ErrorMessages.FINOPS.BUDGET_NOT_FOUND);
        }

        return budget;
    }

    async update(
        id: string,
        organizationId: string,
        dto: Partial<CreateBudgetDto>,
        cloudAccountId?: string,
    ): Promise<FinopsBudget> {
        const budget = cloudAccountId
            ? await this.findOne(id, cloudAccountId, organizationId)
            : await this.findOneInOrganization(id, organizationId);

        const nextAlertType: FinopsBudgetAlertType = dto.alertType ?? budget.alertType;
        const nextScope: FinopsBudgetScope = dto.scope ?? budget.scope;

        let nextCloudAccountId =
            dto.cloudAccountId !== undefined ? dto.cloudAccountId : budget.cloudAccountId;

        if (nextScope === 'organization') {
            nextCloudAccountId = null;
        } else {
            const accountId = nextCloudAccountId?.trim() || null;
            if (!accountId) {
                throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
            }
            await this.requireCloudAccount(accountId, organizationId);
            nextCloudAccountId = accountId;
        }

        if (nextAlertType === 'resource') {
            const resourceId = dto.resourceId !== undefined ? dto.resourceId : budget.resourceId;
            if (!resourceId?.trim()) {
                throw new BadRequestException('resourceId é obrigatório para alertas por recurso');
            }
        }

        if (nextAlertType === 'amount') {
            const alertAmount = dto.alertAmount !== undefined ? dto.alertAmount : budget.alertAmount;
            if (alertAmount == null || Number(alertAmount) <= 0) {
                throw new BadRequestException('alertAmount deve ser maior que zero para alertas por valor');
            }
        }

        const alertsTouched =
            dto.alertChannels !== undefined || dto.alertNotificationGroupIds !== undefined;

        const nextChannels =
            dto.alertChannels !== undefined
                ? this.normalizeChannels(dto.alertChannels)
                : budget.alertChannels;

        const nextGroupIds = alertsTouched
            ? await this.validateAndNormalizeNotificationGroups(
                  organizationId,
                  nextChannels,
                  dto.alertNotificationGroupIds ?? budget.alertNotificationGroupIds ?? [],
              )
            : (budget.alertNotificationGroupIds ?? []);

        let nextResourceId =
            dto.resourceId !== undefined ? dto.resourceId || null : budget.resourceId;
        let nextAlertAmount =
            dto.alertAmount !== undefined ? dto.alertAmount : budget.alertAmount;

        if (nextAlertType === 'percentage') {
            nextResourceId = null;
            nextAlertAmount = null;
        } else if (nextAlertType === 'amount') {
            nextResourceId = null;
        } else if (nextAlertType === 'resource') {
            nextAlertAmount = null;
        }

        Object.assign(budget, {
            name: dto.name ?? budget.name,
            amount: dto.amount ?? budget.amount,
            currency: dto.currency ?? budget.currency,
            period: dto.period ?? budget.period,
            scope: nextScope,
            cloudAccountId: nextCloudAccountId,
            service: dto.service !== undefined ? dto.service || null : budget.service,
            resourceId: nextResourceId,
            alertThresholds: dto.alertThresholds ?? budget.alertThresholds,
            alertFrequency: dto.alertFrequency ?? budget.alertFrequency,
            alertType: nextAlertType,
            alertAmount: nextAlertAmount,
            alertChannels: nextChannels,
            alertEmails: dto.alertEmails !== undefined ? dto.alertEmails : budget.alertEmails,
            alertNotificationGroupIds: nextGroupIds,
        });

        return this.budgetRepo.save(budget);
    }

    async remove(id: string, organizationId: string, cloudAccountId?: string): Promise<void> {
        const budget = cloudAccountId
            ? await this.findOne(id, cloudAccountId, organizationId)
            : await this.findOneInOrganization(id, organizationId);
        await this.budgetRepo.remove(budget);
        this.logger.log(`Budget ${id} removido org=${organizationId}`);
    }

    // =========================================================================
    // Status & Alerts
    // =========================================================================

    async getBudgetStatus(
        id: string,
        organizationId: string,
        cloudAccountId?: string,
        evaluationPeriod?: FinopsBudgetPeriod,
    ): Promise<BudgetStatus> {
        const budget = cloudAccountId
            ? await this.findOne(id, cloudAccountId, organizationId)
            : await this.findOneInOrganization(id, organizationId);

        return this.computeStatus(budget, evaluationPeriod);
    }

    async listBudgetStatuses(
        cloudAccountId: string,
        organizationId: string,
        evaluationPeriod?: FinopsBudgetPeriod,
    ): Promise<BudgetStatus[]> {
        const budgets = await this.list(cloudAccountId, organizationId);
        const activeBudgets = budgets.filter((b) => b.isActive);
        return Promise.all(activeBudgets.map((b) => this.computeStatus(b, evaluationPeriod)));
    }

    async listOrganizationBudgetStatuses(
        organizationId: string,
        evaluationPeriod?: FinopsBudgetPeriod,
    ): Promise<BudgetStatus[]> {
        const budgets = await this.listOrganizationBudgets(organizationId);
        return Promise.all(budgets.filter((b) => b.isActive).map((b) => this.computeStatus(b, evaluationPeriod)));
    }

    /**
     * Status de budgets ativos: tenant-wide + contas FinOps (dashboard batch).
     */
    async listOrgBudgetStatuses(
        organizationId: string,
        accountCap = 8,
        evaluationPeriod?: FinopsBudgetPeriod,
    ): Promise<OrgBudgetStatus[]> {
        const orgStatuses = await this.listOrganizationBudgetStatuses(organizationId, evaluationPeriod);
        const orgMapped: OrgBudgetStatus[] = orgStatuses.map((status) => ({
            ...status,
            cloudAccountAlias: 'Organização',
        }));

        const accounts = await this.cloudAccountRepo.find({
            where: { tenantId: organizationId },
            select: ['id', 'alias', 'provider'],
            order: { createdAt: 'ASC' },
        });

        const finopsAccounts = accounts
            .filter((account) => {
                const provider = (account.provider ?? '').toLowerCase();
                return provider === 'aws' || provider === 'azure' || provider === 'gcp';
            })
            .slice(0, Math.max(1, accountCap));

        if (finopsAccounts.length === 0) {
            return orgMapped;
        }

        const aliasById = new Map(finopsAccounts.map((account) => [account.id, account.alias]));
        const accountIds = finopsAccounts.map((account) => account.id);

        const budgets = await this.budgetRepo.find({
            where: {
                cloudAccountId: In(accountIds),
                organizationId,
                isActive: true,
                scope: 'cloud_account',
            },
            order: { createdAt: 'DESC' },
        });

        const accountStatuses = await Promise.all(
            budgets.map(async (budget) => {
                const status = await this.computeStatus(budget, evaluationPeriod);
                return {
                    ...status,
                    cloudAccountAlias: aliasById.get(budget.cloudAccountId ?? '') ?? budget.cloudAccountId ?? '—',
                };
            }),
        );

        return [...orgMapped, ...accountStatuses];
    }

    /**
     * Avalia budgets ativos e envia alertas pendentes (com dedupe por period_key).
     * Usado pelo cron — nunca pelos endpoints GET de status.
     */
    async evaluateAndNotifyBudgets(organizationId?: string): Promise<{
        evaluated: number;
        notified: number;
    }> {
        const where = organizationId
            ? { organizationId, isActive: true }
            : { isActive: true };

        const budgets = await this.budgetRepo.find({ where, order: { createdAt: 'ASC' } });
        let notified = 0;

        for (const budget of budgets) {
            try {
                const status = await this.computeStatus(budget);
                if (status.triggeredAlerts.length === 0) continue;

                const limitAmount =
                    budget.alertType === 'amount' && budget.alertAmount != null
                        ? Number(budget.alertAmount)
                        : Number(budget.amount);

                const sent = await this.dispatchPendingNotifications(budget, {
                    currentSpend: status.currentSpend,
                    usagePercentage: status.usagePercentage,
                    limitAmount,
                    triggeredAlerts: status.triggeredAlerts,
                });
                notified += sent;
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`Budget ${budget.id}: avaliação de alerta falhou: ${message}`);
            }
        }

        this.logger.log(
            `[Budget Alerts] evaluated=${budgets.length} notifications_queued=${notified}` +
                (organizationId ? ` org=${organizationId}` : ''),
        );

        return { evaluated: budgets.length, notified };
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Calcula status apenas — sem enviar notificações (seguro para GET/poll da UI).
     * Spend acumula pelo período do orçamento (`budget.period`), não pela cadência do alerta.
     * `evaluationPeriod` sobrescreve só na visão da lista (filtro diário/mensal da UI).
     */
    private async computeStatus(
        budget: FinopsBudget,
        evaluationPeriod?: FinopsBudgetPeriod,
    ): Promise<BudgetStatus> {
        const spendPeriod: FinopsBudgetPeriod = evaluationPeriod ?? budget.period;
        const { from, toExclusive } = this.getCurrentPeriodDateRangeUtc(spendPeriod);
        const currentSpend = await this.sumBudgetSpend(budget, from, toExclusive);

        const limitAmount =
            budget.alertType === 'amount' && budget.alertAmount != null
                ? Number(budget.alertAmount)
                : Number(budget.amount);

        const remainingAmount = limitAmount - currentSpend;
        const usagePercentage = limitAmount > 0 ? (currentSpend / limitAmount) * 100 : 0;

        const thresholds =
            budget.alertType === 'amount'
                ? [100]
                : budget.alertThresholds?.length
                  ? budget.alertThresholds
                  : [80, 100];

        const triggeredAlerts = thresholds.filter((threshold) => usagePercentage >= threshold);

        return {
            budget,
            currentSpend,
            remainingAmount,
            usagePercentage,
            triggeredAlerts,
            currency: budget.currency,
        };
    }

    /**
     * Soma custo no mesmo padrão do overview: daily-first, fallback monthly; datas como YYYY-MM-DD.
     */
    private async sumBudgetSpend(budget: FinopsBudget, from: string, toExclusive: string): Promise<number> {
        const sumByGranularity = async (granularity: 'daily' | 'monthly'): Promise<number> => {
            const qb = this.costRecordRepo
                .createQueryBuilder('r')
                .select('COALESCE(SUM(r.cost), 0)', 'total')
                .where('r.organizationId = :organizationId', { organizationId: budget.organizationId })
                .andWhere('r.date >= :from', { from })
                .andWhere('r.date < :toExclusive', { toExclusive })
                .andWhere('r.granularity = :granularity', { granularity });

            if (budget.scope === 'cloud_account' && budget.cloudAccountId) {
                qb.andWhere('r.cloudAccountId = :cloudAccountId', {
                    cloudAccountId: budget.cloudAccountId,
                });
            }

            if (budget.service) {
                qb.andWhere('r.service = :service', { service: budget.service });
            }

            if (budget.alertType === 'resource' && budget.resourceId) {
                qb.andWhere('r.resourceId = :resourceId', { resourceId: budget.resourceId });
            } else {
                // Totais org/conta: apenas nível serviço, evitando double-count com drill-down por recurso.
                andWhereServiceLevelCost(qb, 'r');
            }

            const result = await qb.getRawOne<{ total: string }>();
            return Number(result?.total ?? 0);
        };

        const daily = await sumByGranularity('daily');
        if (daily > 0) return daily;

        return sumByGranularity('monthly');
    }

    /**
     * Envia alertas apenas para limiares/canais ainda não registrados no período atual.
     * Retorna quantos envios foram iniciados.
     */
    private async dispatchPendingNotifications(
        budget: FinopsBudget,
        payload: AlertPayload,
    ): Promise<number> {
        const channels = budget.alertChannels ?? [];
        const groupIds = budget.alertNotificationGroupIds ?? [];
        const periodKey = this.getAlertPeriodKey(budget.alertFrequency ?? 'monthly');
        let sentCount = 0;

        const pendingByChannel = new Map<FinopsBudgetAlertChannel, number[]>();

        for (const channel of channels) {
            const pendingThresholds: number[] = [];
            for (const threshold of payload.triggeredAlerts) {
                const alreadySent = await this.alertEventRepo.findOne({
                    where: {
                        budgetId: budget.id,
                        threshold,
                        periodKey,
                        channel,
                    },
                    select: ['id'],
                });
                if (!alreadySent) {
                    pendingThresholds.push(threshold);
                }
            }
            if (pendingThresholds.length > 0) {
                pendingByChannel.set(channel, pendingThresholds);
            }
        }

        if (pendingByChannel.size === 0) {
            return 0;
        }

        const allPendingThresholds = [
            ...new Set([...pendingByChannel.values()].flat()),
        ].sort((a, b) => a - b);

        const notifyPayload: AlertPayload = {
            ...payload,
            triggeredAlerts: allPendingThresholds,
        };

        if (pendingByChannel.has('email')) {
            const ok = await this.dispatchEmailAlert(budget, notifyPayload, groupIds);
            if (ok) {
                await this.recordAlertEvents(
                    budget,
                    periodKey,
                    'email',
                    pendingByChannel.get('email') ?? [],
                );
                sentCount += 1;
            }
        }

        if (pendingByChannel.has('whatsapp')) {
            try {
                const text = await this.buildBudgetWhatsappText(budget, notifyPayload);
                const result = await this.notificationsService.sendWhatsappAlertToGroups(
                    budget.organizationId,
                    groupIds,
                    text,
                );
                this.logger.log(
                    `Budget ${budget.id}: WhatsApp alert sent=${result.sent} failed=${result.failed}`,
                );
                if (result.sent > 0) {
                    await this.recordAlertEvents(
                        budget,
                        periodKey,
                        'whatsapp',
                        pendingByChannel.get('whatsapp') ?? [],
                    );
                    sentCount += 1;
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`Budget ${budget.id}: WhatsApp alert dispatch failed: ${message}`);
            }
        }

        return sentCount;
    }

    private async recordAlertEvents(
        budget: FinopsBudget,
        periodKey: string,
        channel: FinopsBudgetAlertChannel,
        thresholds: number[],
    ): Promise<void> {
        const now = new Date();
        for (const threshold of thresholds) {
            try {
                await this.alertEventRepo.save(
                    this.alertEventRepo.create({
                        budgetId: budget.id,
                        organizationId: budget.organizationId,
                        threshold,
                        periodKey,
                        channel,
                        sentAt: now,
                    }),
                );
            } catch (error: unknown) {
                // Unique violation = already recorded by a concurrent run — safe to ignore.
                const message = error instanceof Error ? error.message : String(error);
                if (!message.toLowerCase().includes('unique') && !message.includes('UQ_finops_budget_alert')) {
                    this.logger.warn(
                        `Budget ${budget.id}: falha ao gravar alert event threshold=${threshold} channel=${channel}: ${message}`,
                    );
                }
            }
        }
    }

    private async dispatchEmailAlert(
        budget: FinopsBudget,
        payload: AlertPayload,
        groupIds: string[],
    ): Promise<boolean> {
        try {
            let emails = await this.notificationsService.listActiveEmailsFromGroups(
                budget.organizationId,
                groupIds,
            );

            if (emails.length === 0) {
                emails = (budget.alertEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
            }

            if (emails.length === 0) {
                this.logger.debug(`Budget ${budget.id}: nenhum e-mail ativo para alerta`);
                return false;
            }

            await this.mailerService.sendFinopsBudgetAlert({
                to: emails,
                budgetName: budget.name,
                usagePercentage: payload.usagePercentage,
                currentSpend: payload.currentSpend,
                limitAmount: payload.limitAmount,
                currency: budget.currency,
                triggeredAlerts: payload.triggeredAlerts,
                scope: budget.scope,
            });

            this.logger.log(`Budget ${budget.id}: e-mail alert sent to ${emails.join(', ')}`);
            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Budget ${budget.id}: e-mail alert dispatch failed: ${message}`);
            return false;
        }
    }

    private async validateAndNormalizeNotificationGroups(
        organizationId: string,
        channels: FinopsBudgetAlertChannel[],
        groupIds: string[],
    ): Promise<string[]> {
        const uniqueIds = [...new Set(groupIds.filter(Boolean))];
        const groups = await this.notificationsService.findGroupsByIds(organizationId, uniqueIds);

        if (groups.length !== uniqueIds.length) {
            throw new BadRequestException(ErrorMessages.FINOPS.INVALID_NOTIFICATION_GROUPS);
        }

        const emailGroupIds = groups.filter((group) => group.channel === 'email').map((group) => group.id);
        const whatsappGroupIds = groups
            .filter((group) => group.channel === 'whatsapp')
            .map((group) => group.id);

        if (groups.some((group) => group.channel !== 'email' && group.channel !== 'whatsapp')) {
            throw new BadRequestException(ErrorMessages.FINOPS.INVALID_NOTIFICATION_GROUPS);
        }

        if (channels.includes('email') && emailGroupIds.length === 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.EMAIL_NOTIFICATION_GROUP_REQUIRED);
        }

        if (channels.includes('whatsapp') && whatsappGroupIds.length === 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.WHATSAPP_NOTIFICATION_GROUP_REQUIRED);
        }

        const allowed: string[] = [];
        if (channels.includes('email')) allowed.push(...emailGroupIds);
        if (channels.includes('whatsapp')) allowed.push(...whatsappGroupIds);

        return [...new Set(allowed)];
    }

    private normalizeCreateDto(dto: CreateBudgetDto) {
        const scope: FinopsBudgetScope =
            dto.scope ?? (dto.cloudAccountId ? 'cloud_account' : 'organization');
        const alertType: FinopsBudgetAlertType = dto.alertType ?? 'percentage';
        const alertChannels = this.normalizeChannels(dto.alertChannels);
        const alertEmails = (dto.alertEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);

        if (alertType === 'resource' && !dto.resourceId?.trim()) {
            throw new BadRequestException('resourceId é obrigatório para alertas por recurso');
        }

        if (alertType === 'amount' && (dto.alertAmount == null || dto.alertAmount <= 0)) {
            throw new BadRequestException('alertAmount deve ser maior que zero para alertas por valor');
        }

        return {
            name: dto.name,
            amount: dto.amount,
            currency: dto.currency ?? 'USD',
            period: dto.period ?? 'monthly',
            scope,
            cloudAccountId: scope === 'organization' ? null : (dto.cloudAccountId ?? null),
            service: dto.service?.trim() ? dto.service.trim() : null,
            resourceId: alertType === 'resource' && dto.resourceId?.trim() ? dto.resourceId.trim() : null,
            alertThresholds: dto.alertThresholds ?? [80, 100],
            alertFrequency: dto.alertFrequency ?? 'daily',
            alertType,
            alertAmount: alertType === 'amount' ? dto.alertAmount ?? null : null,
            alertChannels,
            alertEmails,
        };
    }

    private normalizeChannels(channels?: FinopsBudgetAlertChannel[]): FinopsBudgetAlertChannel[] {
        const allowed: FinopsBudgetAlertChannel[] = ['email', 'whatsapp'];
        const unique = [...new Set((channels ?? ['email']).filter((c) => allowed.includes(c)))];
        return unique.length > 0 ? unique : ['email'];
    }

    private async requireCloudAccount(cloudAccountId: string, organizationId: string): Promise<CloudAccount> {
        const account = await findCloudAccountForTenant(this.cloudAccountRepo, cloudAccountId, organizationId);

        if (!account) {
            throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        return account;
    }

    /**
     * Chave de dedupe alinhada a alertFrequency (UTC).
     * daily → até 2×/dia (slot 0 = 00–11h UTC, slot 1 = 12–23h UTC).
     * monthly → uma vez por mês civil.
     */
    private getAlertPeriodKey(frequency: FinopsBudgetAlertFrequency): string {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');

        if (frequency === 'daily') {
            const slot = now.getUTCHours() < 12 ? '0' : '1';
            return `${year}-${month}-${day}-${slot}`;
        }

        return `${year}-${month}`;
    }

    /** Intervalo half-open [from, toExclusive) em UTC, alinhado ao sync de custos. */
    private getCurrentPeriodDateRangeUtc(period: FinopsBudgetPeriod): { from: string; toExclusive: string } {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        const day = now.getUTCDate();

        if (period === 'daily') {
            const from = new Date(Date.UTC(year, month, day));
            const toExclusive = new Date(Date.UTC(year, month, day + 1));
            return {
                from: from.toISOString().slice(0, 10),
                toExclusive: toExclusive.toISOString().slice(0, 10),
            };
        }

        const from = new Date(Date.UTC(year, month, 1));
        const toExclusive = new Date(Date.UTC(year, month + 1, 1));
        return {
            from: from.toISOString().slice(0, 10),
            toExclusive: toExclusive.toISOString().slice(0, 10),
        };
    }

    private async buildBudgetWhatsappText(
        budget: FinopsBudget,
        payload: AlertPayload,
    ): Promise<string> {
        const context = await this.loadOrganizationContext(budget);
        const titleEmoji =
            payload.usagePercentage >= 100 ? '🚨' : payload.usagePercentage >= 80 ? '⚠️' : '📊';
        const periodLabel = budget.period === 'daily' ? 'diário' : 'mensal';
        const thresholds =
            payload.triggeredAlerts.map((threshold) => `${threshold}%`).join(', ') || '—';

        const lines = [
            `${titleEmoji} *SaaS MultiCloud* — alerta de orçamento`,
            ``,
            `🏢 Tenant: ${context.tenantName}`,
            `🏬 Organização: ${context.organizationName}`,
            await this.buildBudgetAccountLine(budget),
            ``,
            `📋 Orçamento: *${budget.name}*`,
            `📅 Período: ${periodLabel}`,
        ];

        if (budget.service) {
            lines.push(`🔧 Serviço: ${budget.service}`);
        }
        if (budget.resourceId) {
            lines.push(`📦 Recurso: ${budget.resourceId}`);
        }

        lines.push(
            ``,
            `📊 Uso: *${this.formatPtBr(payload.usagePercentage, 1)}%*`,
            `💸 Gasto: ${this.formatPtBr(payload.currentSpend, 2)} ${budget.currency}`,
            `🎯 Limite: ${this.formatPtBr(payload.limitAmount, 2)} ${budget.currency}`,
            `🔔 Limiares: ${thresholds}`,
        );

        return lines.join('\n');
    }

    private async buildBudgetAccountLine(budget: FinopsBudget): Promise<string> {
        if (budget.scope !== 'cloud_account' || !budget.cloudAccountId) {
            return '☁️ Conta: limite da organização inteira';
        }

        const account = await this.cloudAccountRepo.findOne({
            where: { id: budget.cloudAccountId },
            select: ['id', 'alias', 'provider'],
        });
        const alias = account?.alias?.trim() || 'conta cloud';
        const provider = account?.provider ? account.provider.toUpperCase() : '';
        return provider ? `☁️ Conta: *${alias}* (${provider})` : `☁️ Conta: *${alias}*`;
    }

    private async loadOrganizationContext(
        budget: FinopsBudget,
    ): Promise<{ tenantName: string; organizationName: string }> {
        const organizationId = await this.resolveBudgetOrganizationId(budget);
        return this.notificationsService.resolveWhatsappAlertContext(
            budget.organizationId,
            organizationId,
        );
    }

    /** Mid-org da conta, quando o orçamento não é do tenant inteiro. */
    private async resolveBudgetOrganizationId(budget: FinopsBudget): Promise<string | null> {
        if (budget.scope !== 'cloud_account' || !budget.cloudAccountId) {
            return null;
        }

        const account = await this.cloudAccountRepo.findOne({
            where: { id: budget.cloudAccountId },
            select: ['id', 'organizationId'],
        });

        return account?.organizationId ?? null;
    }

    private formatPtBr(value: number, fractionDigits: number): string {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
        }).format(value);
    }
}
