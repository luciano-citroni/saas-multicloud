import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsRecommendation } from '../../db/entites/ai-finops-recommendation.entity';
import { AiFinopsUsageDaily } from '../../db/entites/ai-finops-usage-daily.entity';
import { AiFinopsLicense } from '../../db/entites/ai-finops-license.entity';
import { ErrorMessages } from '../../common/messages/error-messages';

@Injectable()
export class AiFinopsRecommendationService {
    constructor(
        @InjectRepository(AiFinopsRecommendation)
        private readonly recommendationRepository: Repository<AiFinopsRecommendation>,
        @InjectRepository(AiFinopsUsageDaily)
        private readonly dailyRepository: Repository<AiFinopsUsageDaily>,
        @InjectRepository(AiFinopsLicense)
        private readonly licenseRepository: Repository<AiFinopsLicense>,
    ) {}

    async list(tenantId: string, organizationId?: string) {
        const where: { tenantId: string; organizationId?: string; status?: string } = {
            tenantId,
            status: 'open',
        };
        if (organizationId) where.organizationId = organizationId;
        return this.recommendationRepository.find({ where, order: { identifiedAt: 'DESC' } });
    }

    private async upsertRecommendation(input: {
        tenantId: string;
        organizationId: string;
        title: string;
        description: string;
        estimatedImpact: number;
        rationale: string;
        entityType: string;
        entityId: string;
        suggestedAction: string;
    }) {
        const existing = await this.recommendationRepository.findOne({
            where: {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                title: input.title,
                status: 'open',
            },
        });
        if (existing) return false;
        await this.recommendationRepository.save(
            this.recommendationRepository.create({
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                title: input.title,
                description: input.description,
                estimatedImpact: String(input.estimatedImpact),
                impactCurrency: 'USD',
                rationale: input.rationale,
                entityType: input.entityType,
                entityId: input.entityId,
                suggestedAction: input.suggestedAction,
                status: 'open',
                identifiedAt: new Date(),
            }),
        );
        return true;
    }

    async generateFromUsage(tenantId: string, organizationId: string) {
        const end = new Date();
        const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const priorStart = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
        const rows = await this.dailyRepository
            .createQueryBuilder('daily')
            .where('daily.tenant_id = :tenantId', { tenantId })
            .andWhere('daily.organization_id = :organizationId', { organizationId })
            .andWhere('daily.usage_date >= :start', { start: priorStart.toISOString().slice(0, 10) })
            .andWhere('daily.usage_date <= :end', { end: end.toISOString().slice(0, 10) })
            .getMany();

        if (rows.length < 3) {
            return {
                created: 0,
                message:
                    'Insufficient usage data to generate recommendations. Need at least a few daily rows with real spend/tokens.',
            };
        }

        const recent = rows.filter((r) => r.usageDate >= start.toISOString().slice(0, 10));
        const previous = rows.filter((r) => r.usageDate < start.toISOString().slice(0, 10));

        let created = 0;

        // Rule 1: expensive model concentration
        const byModel = new Map<string, { cost: number; tokens: number; provider: string }>();
        for (const row of recent) {
            const cost = Number(row.officialCost) || Number(row.estimatedCost);
            const current = byModel.get(row.model) ?? { cost: 0, tokens: 0, provider: row.provider };
            current.cost += cost;
            current.tokens += Number(row.totalTokens);
            byModel.set(row.model, current);
        }
        const ranked = Array.from(byModel.entries()).sort((a, b) => b[1].cost - a[1].cost);
        if (ranked.length >= 1 && ranked[0][1].cost > 0) {
            const [model, stats] = ranked[0];
            const cheaper = ranked.find(
                ([alt, altStats]) => alt !== model && altStats.tokens > 0 && altStats.cost / altStats.tokens < stats.cost / Math.max(stats.tokens, 1),
            );
            const ok = await this.upsertRecommendation({
                tenantId,
                organizationId,
                title: `High spend on model ${model}`,
                description: cheaper
                    ? `Model ${model} leads spend; ${cheaper[0]} shows a lower observed unit cost in the same window.`
                    : `Model ${model} accounts for the highest AI spend in the last 14 days.`,
                estimatedImpact: stats.cost * 0.1,
                rationale: `Observed ${stats.tokens} tokens and ${stats.cost.toFixed(4)} tracked cost. Impact estimate assumes a conservative 10% reduction — verify with your workload.`,
                entityType: 'model',
                entityId: model,
                suggestedAction: cheaper
                    ? `Evaluate routing non-critical traffic from ${model} toward ${cheaper[0]}.`
                    : 'Review prompts and consider a lower-cost model for non-critical traffic.',
            });
            if (ok) created += 1;
        }

        // Rule 2: abnormal growth vs prior 14 days
        const recentTokens = recent.reduce((s, r) => s + Number(r.totalTokens), 0);
        const previousTokens = previous.reduce((s, r) => s + Number(r.totalTokens), 0);
        if (previousTokens > 0 && recentTokens > previousTokens * 1.5) {
            const ok = await this.upsertRecommendation({
                tenantId,
                organizationId,
                title: 'Abnormal AI token growth',
                description: `Token usage grew from ${previousTokens} to ${recentTokens} across consecutive 14-day windows.`,
                estimatedImpact: 0,
                rationale: 'Growth exceeds 50% vs the prior window. Investigate new apps, loops, or missing policy limits.',
                entityType: 'organization',
                entityId: organizationId,
                suggestedAction: 'Review top users/apps and tighten gateway policies if unexpected.',
            });
            if (ok) created += 1;
        }

        // Rule 3: Bedrock model drift (many models under aws_bedrock)
        const bedrockModels = new Set(
            recent.filter((r) => r.provider === 'aws_bedrock').map((r) => r.model),
        );
        if (bedrockModels.size >= 5) {
            const ok = await this.upsertRecommendation({
                tenantId,
                organizationId,
                title: 'Bedrock model drift',
                description: `${bedrockModels.size} distinct Bedrock models observed in 14 days.`,
                estimatedImpact: 0,
                rationale: 'Broad model sprawl often increases unit cost variance and complicates governance.',
                entityType: 'provider',
                entityId: 'aws_bedrock',
                suggestedAction: 'Consolidate approved Bedrock models in AI Governance policies.',
            });
            if (ok) created += 1;
        }

        // Rule 4: underutilized seats
        const seats = await this.licenseRepository.find({
            where: {
                tenantId,
                organizationId,
                licenseType: 'seat',
                status: 'active',
            },
        });
        for (const seat of seats) {
            const qty = Number(seat.quantity);
            const remaining = Number(seat.remainingQuantity ?? qty);
            const utilized = qty > 0 ? (qty - remaining) / qty : 1;
            if (qty >= 5 && utilized < 0.4) {
                const ok = await this.upsertRecommendation({
                    tenantId,
                    organizationId,
                    title: `Underutilized seats: ${seat.name}`,
                    description: `Only ${(utilized * 100).toFixed(0)}% of ${seat.name} seats appear consumed.`,
                    estimatedImpact: remaining * Number(seat.unitCost),
                    rationale: 'Seat underutilization inferred from remaining_quantity vs quantity.',
                    entityType: 'license',
                    entityId: seat.id,
                    suggestedAction: 'Reclaim unused seats or reduce commitment at renewal.',
                });
                if (ok) created += 1;
            }
        }

        return {
            created,
            message: created
                ? `Generated ${created} recommendation(s) from usage/licenses (v2).`
                : 'No new recommendations from available data.',
        };
    }

    async findOrFail(tenantId: string, id: string) {
        const row = await this.recommendationRepository.findOne({ where: { id, tenantId } });
        if (!row) throw new NotFoundException(ErrorMessages.AI_FINOPS.RECOMMENDATION_NOT_FOUND);
        return row;
    }
}
