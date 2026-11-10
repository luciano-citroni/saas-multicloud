import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiRecommendation } from '../../db/entites/ai-recommendation.entity';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import { DailyIntelligenceService } from '../daily-intelligence/daily-intelligence.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { listCapabilities } from '../usage/ai-tier.policy';
import { AiQuotasService } from '../usage/ai-quotas.service';
import { AiUsageService } from '../usage/ai-usage.service';

export type DashboardFilters = {
    provider?: string;
    account?: string;
    region?: string;
    period?: string;
    category?: string;
    severity?: string;
};

@Injectable()
export class CloudIntelligenceDashboardService {
    constructor(
        private readonly usageService: AiUsageService,
        private readonly quotasService: AiQuotasService,
        private readonly recommendationsService: RecommendationsService,
        private readonly dailyIntelligenceService: DailyIntelligenceService,
        @InjectRepository(AiRecommendation)
        private readonly recommendationRepository: Repository<AiRecommendation>,
        @InjectRepository(FinopsCostAnomaly)
        private readonly anomalyRepository: Repository<FinopsCostAnomaly>,
        @InjectRepository(GovernanceFinding)
        private readonly findingRepository: Repository<GovernanceFinding>,
    ) {}

    async getDashboard(organizationId: string, filters: DashboardFilters = {}) {
        const [usage, quotas, recommendations, reports, openAnomalies, openFindings] = await Promise.all([
            this.usageService.getUsageOverview(organizationId),
            this.quotasService.getSnapshot(organizationId),
            this.recommendationsService.list(organizationId, {
                status: filters.severity ? undefined : undefined,
                category: filters.category,
                take: 20,
            }),
            this.dailyIntelligenceService.listReports(organizationId, 1),
            this.anomalyRepository.count({ where: { organizationId, status: 'open' } }),
            this.findingRepository.count({
                where: { organizationId, status: 'non_compliant' },
            }),
        ]);

        let filteredRecs = recommendations;
        if (filters.severity) {
            filteredRecs = filteredRecs.filter((r) => r.severity === filters.severity);
        }
        if (filters.account) {
            filteredRecs = filteredRecs.filter(
                (r) => (r.resourceReference as { cloudAccountId?: string } | null)?.cloudAccountId === filters.account,
            );
        }
        if (filters.provider) {
            filteredRecs = filteredRecs.filter(
                (r) =>
                    (r.resourceReference as { provider?: string } | null)?.provider === filters.provider ||
                    (r.evidence as { provider?: string })?.provider === filters.provider,
            );
        }

        const pending = filteredRecs.filter((r) =>
            ['NEW', 'REVIEWING', 'APPROVED'].includes(r.status),
        ).length;

        const potentialSaving = filteredRecs.reduce((sum, r) => {
            const impact = r.estimatedImpact as { potentialSaving?: number } | null;
            return sum + (Number(impact?.potentialSaving) || 0);
        }, 0);

        // Heuristic score 0-100: fewer open issues => higher score.
        const penalty = Math.min(80, openFindings * 2 + openAnomalies * 3 + pending);
        const score = Math.max(0, 100 - penalty);

        return {
            score,
            usage,
            quotas: {
                ...quotas,
                capabilities: listCapabilities(quotas.tier),
            },
            pendingRecommendations: pending,
            openAnomalies,
            openFindings,
            potentialSaving,
            recommendations: filteredRecs.slice(0, 10),
            latestDailyReport: reports[0] ?? null,
            filters,
        };
    }
}
