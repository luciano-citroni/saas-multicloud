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
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import { NotificationsService } from '../../notifications/notifications.service';
import { MailerService } from '../../mailer/mailer.service';
import { findCloudAccountForTenant } from '../utils/find-cloud-account';

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

@Injectable()
export class FinopsBudgetService {
    private readonly logger = new Logger(FinopsBudgetService.name);

    constructor(
        @InjectRepository(FinopsBudget)
        private readonly budgetRepo: Repository<FinopsBudget>,

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

        if (dto.alertType === 'resource' || (dto.resourceId !== undefined && budget.alertType === 'resource')) {
            const resourceId = dto.resourceId !== undefined ? dto.resourceId : budget.resourceId;
            if (!resourceId?.trim()) {
                throw new BadRequestException('resourceId é obrigatório para alertas por recurso');
            }
        }

        if (dto.alertType === 'amount' || (dto.alertAmount !== undefined && budget.alertType === 'amount')) {
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

        Object.assign(budget, {
            name: dto.name ?? budget.name,
            amount: dto.amount ?? budget.amount,
            currency: dto.currency ?? budget.currency,
            period: dto.period ?? budget.period,
            service: dto.service !== undefined ? dto.service || null : budget.service,
            resourceId: dto.resourceId !== undefined ? dto.resourceId || null : budget.resourceId,
            alertThresholds: dto.alertThresholds ?? budget.alertThresholds,
            alertFrequency: dto.alertFrequency ?? budget.alertFrequency,
            alertType: dto.alertType ?? budget.alertType,
            alertAmount: dto.alertAmount !== undefined ? dto.alertAmount : budget.alertAmount,
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

    // =========================================================================
    // Helpers
    // =========================================================================

    private async computeStatus(
        budget: FinopsBudget,
        evaluationPeriod?: FinopsBudgetPeriod,
    ): Promise<BudgetStatus> {
        // Alerta mensal = acumulado do mês até agora; diário = só o dia.
        // evaluationPeriod (visão da lista) sobrescreve; senão usa a frequência do alerta.
        const spendPeriod: FinopsBudgetPeriod =
            evaluationPeriod ?? budget.alertFrequency ?? budget.period;
        const { from, toExclusive } = this.getCurrentPeriodDateRange(spendPeriod);
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

        if (triggeredAlerts.length > 0) {
            this.logger.warn(
                `Budget "${budget.name}" (${budget.id}): gasto ${usagePercentage.toFixed(1)}% do limite. Alertas: ${triggeredAlerts.join(', ')}%`,
            );
            // E-mail ainda não dispara no GET (evita spam no poll da UI).
            // WhatsApp envia fire-and-forget para destinos ativos do tenant.
            this.dispatchPendingNotifications(budget, {
                currentSpend,
                usagePercentage,
                limitAmount,
                triggeredAlerts,
            });
        }

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
            }

            const result = await qb.getRawOne<{ total: string }>();
            return Number(result?.total ?? 0);
        };

        const daily = await sumByGranularity('daily');
        if (daily > 0) return daily;

        return sumByGranularity('monthly');
    }

    private dispatchPendingNotifications(
        budget: FinopsBudget,
        payload: {
            currentSpend: number;
            usagePercentage: number;
            limitAmount: number;
            triggeredAlerts: number[];
        },
    ): void {
        const channels = budget.alertChannels ?? [];
        const groupIds = budget.alertNotificationGroupIds ?? [];

        const text = [
            `*SaaS MultiCloud* — alerta de orçamento`,
            ``,
            `Orçamento: *${budget.name}*`,
            `Uso: *${payload.usagePercentage.toFixed(1)}%*`,
            `Gasto: ${payload.currentSpend.toFixed(2)} ${budget.currency}`,
            `Limite: ${payload.limitAmount.toFixed(2)} ${budget.currency}`,
            `Limiares: ${payload.triggeredAlerts.map((t) => `${t}%`).join(', ') || '—'}`,
        ].join('\n');

        if (channels.includes('email')) {
            void this.dispatchEmailAlert(budget, payload, groupIds);
        }

        if (channels.includes('whatsapp')) {
            this.notificationsService
                .sendWhatsappAlertToGroups(budget.organizationId, groupIds, text)
                .then((result) => {
                    this.logger.log(
                        `Budget ${budget.id}: WhatsApp alert sent=${result.sent} failed=${result.failed}`,
                    );
                })
                .catch((error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    this.logger.error(`Budget ${budget.id}: WhatsApp alert dispatch failed: ${message}`);
                });
        }
    }

    private async dispatchEmailAlert(
        budget: FinopsBudget,
        payload: {
            currentSpend: number;
            usagePercentage: number;
            limitAmount: number;
            triggeredAlerts: number[];
        },
        groupIds: string[],
    ): Promise<void> {
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
                return;
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
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Budget ${budget.id}: e-mail alert dispatch failed: ${message}`);
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

        // Drop groups whose channel is not enabled on the budget.
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
            resourceId: dto.resourceId?.trim() ? dto.resourceId.trim() : null,
            alertThresholds: dto.alertThresholds ?? [80, 100],
            alertFrequency: dto.alertFrequency ?? dto.period ?? 'monthly',
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

    private formatDateOnly(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /** Intervalo half-open [from, toExclusive) no fuso local do servidor, igual ao overview. */
    private getCurrentPeriodDateRange(period: FinopsBudgetPeriod): { from: string; toExclusive: string } {
        const now = new Date();

        if (period === 'daily') {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            return { from: this.formatDateOnly(start), toExclusive: this.formatDateOnly(next) };
        }

        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return { from: this.formatDateOnly(start), toExclusive: this.formatDateOnly(next) };
    }
}
