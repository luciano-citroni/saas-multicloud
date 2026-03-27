import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { FinopsBudget } from '../../db/entites/finops-budget.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

import { ErrorMessages } from '../../common/messages/error-messages';

export interface CreateBudgetDto {
    name: string;
    amount: number;
    currency?: string;
    period?: 'monthly';
    service?: string;
    alertThresholds?: number[];
}

export interface BudgetStatus {
    budget: FinopsBudget;
    currentSpend: number;
    remainingAmount: number;
    usagePercentage: number;
    triggeredAlerts: number[];
    currency: string;
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

    async create(cloudAccountId: string, organizationId: string, dto: CreateBudgetDto): Promise<FinopsBudget> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        const budget = this.budgetRepo.create({
            organizationId,
            cloudAccountId,
            name: dto.name,
            amount: dto.amount,
            currency: dto.currency ?? 'USD',
            period: dto.period ?? 'monthly',
            service: dto.service ?? null,
            alertThresholds: dto.alertThresholds ?? [80, 100],
            isActive: true,
        });

        const saved = await this.budgetRepo.save(budget);

        this.logger.log(`Budget criado: ${saved.id} (${saved.name}) para conta ${cloudAccountId}`);

        return saved;
    }

    async list(cloudAccountId: string, organizationId: string): Promise<FinopsBudget[]> {
        await this.requireCloudAccount(cloudAccountId, organizationId);

        return this.budgetRepo.find({
            where: { cloudAccountId, organizationId },
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

    async update(id: string, cloudAccountId: string, organizationId: string, dto: Partial<CreateBudgetDto>): Promise<FinopsBudget> {
        const budget = await this.findOne(id, cloudAccountId, organizationId);

        Object.assign(budget, {
            name: dto.name ?? budget.name,
            amount: dto.amount ?? budget.amount,
            currency: dto.currency ?? budget.currency,
            service: dto.service !== undefined ? dto.service : budget.service,
            alertThresholds: dto.alertThresholds ?? budget.alertThresholds,
        });

        return this.budgetRepo.save(budget);
    }

    async remove(id: string, cloudAccountId: string, organizationId: string): Promise<void> {
        const budget = await this.findOne(id, cloudAccountId, organizationId);
        await this.budgetRepo.remove(budget);
        this.logger.log(`Budget ${id} removido para conta ${cloudAccountId}`);
    }

    // =========================================================================
    // Status & Alerts
    // =========================================================================

    /**
     * Calcula o status atual de um budget comparando com os custos do período corrente.
     * Para budgets mensais, considera o mês calendário atual.
     */
    async getBudgetStatus(id: string, cloudAccountId: string, organizationId: string): Promise<BudgetStatus> {
        const budget = await this.findOne(id, cloudAccountId, organizationId);

        const { startDate, endDate } = this.getCurrentPeriodDates(budget.period);

        let query = this.costRecordRepo
            .createQueryBuilder('r')
            .where('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.date >= :startDate', { startDate })
            .andWhere('r.date <= :endDate', { endDate });

        if (budget.service) {
            query = query.andWhere('r.service = :service', { service: budget.service });
        }

        const records = await query.getMany();

        const currentSpend = records.reduce((sum, r) => sum + Number(r.cost), 0);
        const remainingAmount = budget.amount - currentSpend;
        const usagePercentage = budget.amount > 0 ? (currentSpend / budget.amount) * 100 : 0;

        const triggeredAlerts = budget.alertThresholds.filter((threshold) => usagePercentage >= threshold);

        if (triggeredAlerts.length > 0) {
            this.logger.warn(
                `Budget "${budget.name}" (${id}): gasto ${usagePercentage.toFixed(1)}% do limite. Alertas disparados: ${triggeredAlerts.join(', ')}%`,
            );
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
     * Retorna o status de todos os budgets ativos de uma conta.
     */
    async listBudgetStatuses(cloudAccountId: string, organizationId: string): Promise<BudgetStatus[]> {
        const budgets = await this.list(cloudAccountId, organizationId);
        const activeBudgets = budgets.filter((b) => b.isActive);

        return Promise.all(
            activeBudgets.map((b) => this.getBudgetStatus(b.id, cloudAccountId, organizationId)),
        );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private async requireCloudAccount(cloudAccountId: string, organizationId: string): Promise<CloudAccount> {
        const account = await this.cloudAccountRepo.findOne({
            where: { id: cloudAccountId, organizationId },
        });

        if (!account) {
            throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        return account;
    }

    private getCurrentPeriodDates(period: 'monthly'): { startDate: Date; endDate: Date } {
        const now = new Date();

        if (period === 'monthly') {
            const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { startDate, endDate };
        }

        // Fallback: últimos 30 dias
        const endDate = now;
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        return { startDate, endDate };
    }
}
