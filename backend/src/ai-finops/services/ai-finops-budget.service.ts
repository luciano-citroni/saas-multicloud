import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsBudget } from '../../db/entites/ai-finops-budget.entity';
import { AiFinopsUsageDaily } from '../../db/entites/ai-finops-usage-daily.entity';
import { AiFinopsLicense } from '../../db/entites/ai-finops-license.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import type { CreateBudgetDto, UpdateBudgetDto } from '../dto';
import { AiFinopsAuditService } from './ai-finops-audit.service';
import { AiFinopsConnectionService } from './ai-finops-connection.service';
import { AiFinopsAlertDispatchService } from './ai-finops-alert-dispatch.service';

@Injectable()
export class AiFinopsBudgetService {
    constructor(
        @InjectRepository(AiFinopsBudget)
        private readonly budgetRepository: Repository<AiFinopsBudget>,
        @InjectRepository(AiFinopsUsageDaily)
        private readonly dailyRepository: Repository<AiFinopsUsageDaily>,
        @InjectRepository(AiFinopsLicense)
        private readonly licenseRepository: Repository<AiFinopsLicense>,
        private readonly connections: AiFinopsConnectionService,
        private readonly audit: AiFinopsAuditService,
        private readonly alerts: AiFinopsAlertDispatchService,
    ) {}

    async list(tenantId: string, organizationId?: string) {
        const where: { tenantId: string; organizationId?: string } = { tenantId };
        if (organizationId) {
            await this.connections.assertOrganizationBelongsToTenant(tenantId, organizationId);
            where.organizationId = organizationId;
        }
        return this.budgetRepository.find({ where, order: { createdAt: 'DESC' } });
    }

    async findOrFail(tenantId: string, budgetId: string) {
        const budget = await this.budgetRepository.findOne({ where: { id: budgetId, tenantId } });
        if (!budget) throw new NotFoundException(ErrorMessages.AI_FINOPS.BUDGET_NOT_FOUND);
        return budget;
    }

    async create(tenantId: string, userId: string | null, dto: CreateBudgetDto) {
        await this.connections.assertOrganizationBelongsToTenant(tenantId, dto.organizationId);
        const budget = await this.budgetRepository.save(
            this.budgetRepository.create({
                tenantId,
                organizationId: dto.organizationId,
                name: dto.name,
                scopeType: dto.scopeType,
                scopeId: dto.scopeId ?? null,
                budgetAmount: String(dto.budgetAmount),
                currency: dto.currency,
                period: dto.period,
                alertThresholds: dto.alertThresholds,
                alertChannels: dto.alertChannels,
                alertNotificationGroupIds: dto.alertNotificationGroupIds,
                status: 'active',
            }),
        );
        await this.audit.log({
            tenantId,
            userId,
            action: 'budget.created',
            entityType: 'ai_finops_budget',
            entityId: budget.id,
        });
        return budget;
    }

    async update(tenantId: string, userId: string | null, budgetId: string, dto: UpdateBudgetDto) {
        const budget = await this.findOrFail(tenantId, budgetId);
        if (dto.name !== undefined) budget.name = dto.name;
        if (dto.scopeType !== undefined) budget.scopeType = dto.scopeType;
        if (dto.scopeId !== undefined) budget.scopeId = dto.scopeId;
        if (dto.budgetAmount !== undefined) budget.budgetAmount = String(dto.budgetAmount);
        if (dto.currency !== undefined) budget.currency = dto.currency;
        if (dto.period !== undefined) budget.period = dto.period;
        if (dto.alertThresholds !== undefined) budget.alertThresholds = dto.alertThresholds;
        if (dto.alertChannels !== undefined) budget.alertChannels = dto.alertChannels;
        if (dto.alertNotificationGroupIds !== undefined) {
            budget.alertNotificationGroupIds = dto.alertNotificationGroupIds;
        }
        const saved = await this.budgetRepository.save(budget);
        await this.audit.log({
            tenantId,
            userId,
            action: 'budget.updated',
            entityType: 'ai_finops_budget',
            entityId: budgetId,
        });
        return saved;
    }

    async remove(tenantId: string, userId: string | null, budgetId: string) {
        const budget = await this.findOrFail(tenantId, budgetId);
        await this.budgetRepository.remove(budget);
        await this.audit.log({
            tenantId,
            userId,
            action: 'budget.deleted',
            entityType: 'ai_finops_budget',
            entityId: budgetId,
        });
    }

    private periodStart(period: string): string {
        const now = new Date();
        if (period === 'daily') return now.toISOString().slice(0, 10);
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    }

    async computeStatus(tenantId: string, budgetId: string) {
        const budget = await this.findOrFail(tenantId, budgetId);
        const amount = Number(budget.budgetAmount);

        if (budget.scopeType === 'license' || budget.scopeType === 'credit') {
            const licenses = budget.scopeId
                ? await this.licenseRepository.find({
                      where: {
                          tenantId,
                          organizationId: budget.organizationId,
                          id: budget.scopeId,
                      },
                  })
                : await this.licenseRepository.find({
                      where: { tenantId, organizationId: budget.organizationId },
                  });
            const filtered =
                budget.scopeType === 'credit'
                    ? licenses.filter(
                          (l) => l.licenseType === 'credit_pack' || l.licenseType === 'commitment',
                      )
                    : licenses.filter((l) => l.licenseType === 'seat');
            const spent = filtered.reduce((sum, l) => {
                if (budget.scopeType === 'credit') {
                    const total = Number(l.quantity);
                    const remaining = Number(l.remainingQuantity ?? l.quantity);
                    return sum + Math.max(0, total - remaining) * Number(l.unitCost || 1);
                }
                return sum + Number(l.quantity) * Number(l.unitCost);
            }, 0);
            const percent = amount > 0 ? (spent / amount) * 100 : 0;
            return {
                budget,
                spentOfficial: spent,
                spentEstimatedGateway: 0,
                percent,
                thresholdsHit: budget.alertThresholds.filter((t) => percent >= t),
                note: `Budget status uses ${budget.scopeType} burn only (not mixed with token costs).`,
            };
        }

        const start = this.periodStart(budget.period);
        const qb = this.dailyRepository
            .createQueryBuilder('daily')
            .select('COALESCE(SUM(daily.official_cost::numeric), 0)', 'official')
            .addSelect('COALESCE(SUM(daily.estimated_cost::numeric), 0)', 'estimated')
            .where('daily.tenant_id = :tenantId', { tenantId })
            .andWhere('daily.organization_id = :organizationId', { organizationId: budget.organizationId })
            .andWhere('daily.usage_date >= :start', { start })
            .andWhere('daily.usage_source = :source', { source: 'provider_admin' });

        if (budget.scopeType === 'provider' && budget.scopeId) {
            qb.andWhere('daily.provider = :scopeId', { scopeId: budget.scopeId });
        }
        if (budget.scopeType === 'connection' && budget.scopeId) {
            qb.andWhere('daily.connection_id = :scopeId', { scopeId: budget.scopeId });
        }
        if (budget.scopeType === 'model' && budget.scopeId) {
            qb.andWhere('daily.model = :scopeId', { scopeId: budget.scopeId });
        }
        if (budget.scopeType === 'team' && budget.scopeId) {
            qb.andWhere('daily.team_id = :scopeId', { scopeId: budget.scopeId });
        }
        if (budget.scopeType === 'user' && budget.scopeId) {
            // Accept SaaS user UUID or provider-native external id (OpenAI user_*, etc.).
            const uuidRe =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (uuidRe.test(budget.scopeId)) {
                qb.andWhere(
                    '(daily.user_id = :scopeId OR daily.provider_user_external_id = :scopeId)',
                    { scopeId: budget.scopeId },
                );
            } else {
                qb.andWhere('daily.provider_user_external_id = :scopeId', {
                    scopeId: budget.scopeId,
                });
            }
        }
        if (budget.scopeType === 'application' && budget.scopeId) {
            qb.andWhere('daily.application_id = :scopeId', { scopeId: budget.scopeId });
        }

        const raw = await qb.getRawOne<{ official: string; estimated: string }>();
        const spent = Number(raw?.official ?? 0);
        const percent = amount > 0 ? (spent / amount) * 100 : 0;
        return {
            budget,
            spentOfficial: spent,
            spentEstimatedGateway: Number(raw?.estimated ?? 0),
            percent,
            thresholdsHit: budget.alertThresholds.filter((t) => percent >= t),
            note: 'Budget status uses official provider_admin costs only.',
        };
    }

    async evaluateAndNotify(tenantId?: string) {
        const budgets = await this.budgetRepository.find({
            where: tenantId ? { tenantId, status: 'active' } : { status: 'active' },
        });
        for (const budget of budgets) {
            const status = await this.computeStatus(budget.tenantId, budget.id);
            for (const threshold of status.thresholdsHit) {
                const alertType = threshold >= 100 ? 'budget_threshold' : 'policy_near_limit';
                await this.alerts.emit({
                    tenantId: budget.tenantId,
                    organizationId: budget.organizationId,
                    alertType,
                    scopeType: 'budget',
                    scopeId: budget.id,
                    dedupeKey: `${budget.period}:${this.periodStart(budget.period)}:${threshold}`,
                    message: `AI FinOps budget "${budget.name}" reached ${threshold}% (${status.percent.toFixed(1)}%).`,
                    notificationGroupIds: budget.alertNotificationGroupIds,
                    channels: budget.alertChannels,
                    emailPayload: {
                        budgetName: budget.name,
                        usagePercentage: status.percent,
                        currentSpend: status.spentOfficial,
                        limitAmount: Number(budget.budgetAmount),
                        currency: budget.currency,
                        triggeredAlerts: [threshold],
                        scope: budget.scopeType,
                    },
                });
            }
        }
    }
}
