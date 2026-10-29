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
    ) {}

    // =========================================================================
    // CRUD
    // =========================================================================

    async create(organizationId: string, dto: CreateBudgetDto): Promise<FinopsBudget> {
        const normalized = this.normalizeCreateDto(dto);

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
            alertChannels: dto.alertChannels ?? budget.alertChannels,
            alertEmails: dto.alertEmails ?? budget.alertEmails,
        });

        if (budget.alertChannels.includes('whatsapp')) {
            this.logger.log(`Budget ${budget.id}: canal WhatsApp cadastrado (envio ainda não implementado)`);
        }

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
    ): Promise<BudgetStatus> {
        const budget = cloudAccountId
            ? await this.findOne(id, cloudAccountId, organizationId)
            : await this.findOneInOrganization(id, organizationId);

        return this.computeStatus(budget);
    }

    async listBudgetStatuses(cloudAccountId: string, organizationId: string): Promise<BudgetStatus[]> {
        const budgets = await this.list(cloudAccountId, organizationId);
        const activeBudgets = budgets.filter((b) => b.isActive);
        return Promise.all(activeBudgets.map((b) => this.computeStatus(b)));
    }

    async listOrganizationBudgetStatuses(organizationId: string): Promise<BudgetStatus[]> {
        const budgets = await this.listOrganizationBudgets(organizationId);
        return Promise.all(budgets.filter((b) => b.isActive).map((b) => this.computeStatus(b)));
    }

    /**
     * Status de budgets ativos: tenant-wide + contas FinOps (dashboard batch).
     */
    async listOrgBudgetStatuses(organizationId: string, accountCap = 8): Promise<OrgBudgetStatus[]> {
        const orgStatuses = await this.listOrganizationBudgetStatuses(organizationId);
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
                const status = await this.computeStatus(budget);
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

    private async computeStatus(budget: FinopsBudget): Promise<BudgetStatus> {
        const evaluationPeriod = budget.alertFrequency ?? budget.period;
        const { startDate, endDate } = this.getCurrentPeriodDates(evaluationPeriod);

        let query = this.costRecordRepo
            .createQueryBuilder('r')
            .where('r.organizationId = :organizationId', { organizationId: budget.organizationId })
            .andWhere('r.date >= :startDate', { startDate })
            .andWhere('r.date <= :endDate', { endDate });

        if (budget.scope === 'cloud_account' && budget.cloudAccountId) {
            query = query.andWhere('r.cloudAccountId = :cloudAccountId', {
                cloudAccountId: budget.cloudAccountId,
            });
        }

        if (budget.service) {
            query = query.andWhere('r.service = :service', { service: budget.service });
        }

        if (budget.alertType === 'resource' && budget.resourceId) {
            query = query.andWhere('r.resourceId = :resourceId', { resourceId: budget.resourceId });
        }

        const records = await query.getMany();
        const currentSpend = records.reduce((sum, r) => sum + Number(r.cost), 0);

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
            // Entrega (e-mail/WhatsApp) não roda no GET de status — evita spam em poll da UI.
            // O cadastro de canais fica persistido para o scheduler futuro.
            this.logPendingNotifications(budget, {
                currentSpend,
                usagePercentage,
                limitAmount,
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

    private logPendingNotifications(
        budget: FinopsBudget,
        payload: { currentSpend: number; usagePercentage: number; limitAmount: number },
    ): void {
        const channels = budget.alertChannels ?? [];

        if (channels.includes('whatsapp')) {
            this.logger.debug(
                `Budget ${budget.id}: canal WhatsApp cadastrado (envio ainda não implementado)`,
            );
        }

        if (channels.includes('email')) {
            const emails = (budget.alertEmails ?? []).map((e) => e.trim()).filter(Boolean);
            if (emails.length > 0) {
                this.logger.debug(
                    `Budget ${budget.id}: alerta e-mail cadastrado para ${emails.join(', ')} ` +
                        `(${payload.usagePercentage.toFixed(1)}% de ${payload.limitAmount} ${budget.currency})`,
                );
            }
        }
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

        if (alertChannels.includes('whatsapp')) {
            this.logger.log('Canal WhatsApp cadastrado no budget (envio ainda não implementado)');
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

    private getCurrentPeriodDates(period: FinopsBudgetPeriod | FinopsBudgetAlertFrequency): {
        startDate: Date;
        endDate: Date;
    } {
        const now = new Date();

        if (period === 'daily') {
            const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            return { startDate, endDate };
        }

        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { startDate, endDate };
    }
}
