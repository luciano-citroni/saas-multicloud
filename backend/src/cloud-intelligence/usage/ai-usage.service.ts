import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AiUsageRecord } from '../../db/entites/ai-usage-record.entity';
import { AiAuditService } from '../audit/ai-audit.service';

/** Rough USD estimate per 1M tokens when provider does not return cost. */
const DEFAULT_INPUT_COST_PER_1M = 2.5;
const DEFAULT_OUTPUT_COST_PER_1M = 10;

export const CI_ENGAGEMENT_ACTIONS = [
    'rec_viewed',
    'rec_status_changed',
    'prepare_automation',
    'daily_generated',
] as const;

@Injectable()
export class AiUsageService {
    constructor(
        @InjectRepository(AiUsageRecord)
        private readonly usageRepository: Repository<AiUsageRecord>,
        private readonly auditService: AiAuditService,
    ) {}

    async record(input: {
        organizationId: string;
        userId?: string | null;
        agentType: string;
        provider: string;
        model: string;
        inputTokens?: number;
        outputTokens?: number;
        conversationId?: string | null;
        estimatedCost?: number | null;
    }): Promise<AiUsageRecord> {
        const inputTokens = input.inputTokens ?? 0;
        const outputTokens = input.outputTokens ?? 0;
        const estimatedCost =
            input.estimatedCost ??
            (inputTokens / 1_000_000) * DEFAULT_INPUT_COST_PER_1M +
                (outputTokens / 1_000_000) * DEFAULT_OUTPUT_COST_PER_1M;

        const record = this.usageRepository.create({
            organizationId: input.organizationId,
            userId: input.userId ?? null,
            agentType: input.agentType,
            provider: input.provider,
            model: input.model,
            inputTokens,
            outputTokens,
            estimatedCost,
            conversationId: input.conversationId ?? null,
        });
        return this.usageRepository.save(record);
    }

    async sumTokensInRange(
        organizationId: string,
        from: Date,
        to: Date,
        options?: { userId?: string; agentType?: string },
    ): Promise<{ inputTokens: number; outputTokens: number; estimatedCost: number; requests: number }> {
        const qb = this.usageRepository
            .createQueryBuilder('u')
            .select('COALESCE(SUM(u.input_tokens), 0)', 'inputTokens')
            .addSelect('COALESCE(SUM(u.output_tokens), 0)', 'outputTokens')
            .addSelect('COALESCE(SUM(u.estimated_cost), 0)', 'estimatedCost')
            .addSelect('COUNT(*)', 'requests')
            .where('u.organization_id = :organizationId', { organizationId })
            .andWhere('u.created_at BETWEEN :from AND :to', { from, to });

        if (options?.userId) {
            qb.andWhere('u.user_id = :userId', { userId: options.userId });
        }
        if (options?.agentType) {
            qb.andWhere('u.agent_type = :agentType', { agentType: options.agentType });
        }

        const raw = await qb.getRawOne<{
            inputTokens: string;
            outputTokens: string;
            estimatedCost: string;
            requests: string;
        }>();

        return {
            inputTokens: Number(raw?.inputTokens ?? 0),
            outputTokens: Number(raw?.outputTokens ?? 0),
            estimatedCost: Number(raw?.estimatedCost ?? 0),
            requests: Number(raw?.requests ?? 0),
        };
    }

    async getUsageOverview(organizationId: string): Promise<{
        daily: { inputTokens: number; outputTokens: number; estimatedCost: number; requests: number };
        monthly: { inputTokens: number; outputTokens: number; estimatedCost: number; requests: number };
        byAgent: Array<{
            agentType: string;
            inputTokens: number;
            outputTokens: number;
            estimatedCost: number;
            requests: number;
        }>;
        byUser: Array<{
            userId: string | null;
            inputTokens: number;
            outputTokens: number;
            estimatedCost: number;
            requests: number;
        }>;
        engagement: {
            daily: Record<string, number>;
            monthly: Record<string, number>;
        };
    }> {
        const now = new Date();
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const engagementActions = [...CI_ENGAGEMENT_ACTIONS];

        const [daily, monthly, engagementDaily, engagementMonthly] = await Promise.all([
            this.sumTokensInRange(organizationId, startOfDay, now),
            this.sumTokensInRange(organizationId, startOfMonth, now),
            this.auditService.countActionsInRange(organizationId, startOfDay, now, engagementActions),
            this.auditService.countActionsInRange(organizationId, startOfMonth, now, engagementActions),
        ]);

        const byAgentRaw = await this.usageRepository
            .createQueryBuilder('u')
            .select('u.agent_type', 'agentType')
            .addSelect('COALESCE(SUM(u.input_tokens), 0)', 'inputTokens')
            .addSelect('COALESCE(SUM(u.output_tokens), 0)', 'outputTokens')
            .addSelect('COALESCE(SUM(u.estimated_cost), 0)', 'estimatedCost')
            .addSelect('COUNT(*)', 'requests')
            .where('u.organization_id = :organizationId', { organizationId })
            .andWhere('u.created_at BETWEEN :from AND :to', { from: startOfMonth, to: now })
            .groupBy('u.agent_type')
            .orderBy('"estimatedCost"', 'DESC')
            .getRawMany<{
                agentType: string;
                inputTokens: string;
                outputTokens: string;
                estimatedCost: string;
                requests: string;
            }>();

        const byUserRaw = await this.usageRepository
            .createQueryBuilder('u')
            .select('u.user_id', 'userId')
            .addSelect('COALESCE(SUM(u.input_tokens), 0)', 'inputTokens')
            .addSelect('COALESCE(SUM(u.output_tokens), 0)', 'outputTokens')
            .addSelect('COALESCE(SUM(u.estimated_cost), 0)', 'estimatedCost')
            .addSelect('COUNT(*)', 'requests')
            .where('u.organization_id = :organizationId', { organizationId })
            .andWhere('u.created_at BETWEEN :from AND :to', { from: startOfMonth, to: now })
            .groupBy('u.user_id')
            .orderBy('"estimatedCost"', 'DESC')
            .limit(50)
            .getRawMany<{
                userId: string | null;
                inputTokens: string;
                outputTokens: string;
                estimatedCost: string;
                requests: string;
            }>();

        return {
            daily,
            monthly,
            byAgent: byAgentRaw.map((row) => ({
                agentType: row.agentType,
                inputTokens: Number(row.inputTokens),
                outputTokens: Number(row.outputTokens),
                estimatedCost: Number(row.estimatedCost),
                requests: Number(row.requests),
            })),
            byUser: byUserRaw.map((row) => ({
                userId: row.userId,
                inputTokens: Number(row.inputTokens),
                outputTokens: Number(row.outputTokens),
                estimatedCost: Number(row.estimatedCost),
                requests: Number(row.requests),
            })),
            engagement: {
                daily: engagementDaily,
                monthly: engagementMonthly,
            },
        };
    }

    /** Used by quotas — count total tokens (in+out) for a period. */
    async totalTokensBetween(organizationId: string, from: Date, to: Date): Promise<number> {
        const sum = await this.sumTokensInRange(organizationId, from, to);
        return sum.inputTokens + sum.outputTokens;
    }

    async listRecent(organizationId: string, take = 50): Promise<AiUsageRecord[]> {
        return this.usageRepository.find({
            where: { organizationId, createdAt: Between(new Date(0), new Date()) },
            order: { createdAt: 'DESC' },
            take,
        });
    }
}
