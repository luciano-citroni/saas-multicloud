import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { CloudService } from '../../cloud/cloud.service';
import { ErrorMessages } from '../../common/messages/error-messages';
import { AiDailyReport } from '../../db/entites/ai-daily-report.entity';
import { AiRecommendation } from '../../db/entites/ai-recommendation.entity';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import { FinopsRecommendation } from '../../db/entites/finops-recommendation.entity';
import { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import { MailerService } from '../../mailer/mailer.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AiAuditService } from '../audit/ai-audit.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { tierHasCapability } from '../usage/ai-tier.policy';
import { AiQuotasService } from '../usage/ai-quotas.service';
import { DailyBriefingComposer } from './daily-briefing.composer';
import {
    aggregateDailySignals,
    DAILY_RANKING_VERSION,
    DAILY_TOP_UPSERT,
} from './daily-signal.aggregator';

@Injectable()
export class DailyIntelligenceService {
    private readonly logger = new Logger(DailyIntelligenceService.name);

    constructor(
        @InjectRepository(AiDailyReport)
        private readonly reportRepository: Repository<AiDailyReport>,
        @InjectRepository(AiRecommendation)
        private readonly recommendationRepository: Repository<AiRecommendation>,
        @InjectRepository(FinopsCostAnomaly)
        private readonly anomalyRepository: Repository<FinopsCostAnomaly>,
        @InjectRepository(GovernanceFinding)
        private readonly findingRepository: Repository<GovernanceFinding>,
        @InjectRepository(FinopsRecommendation)
        private readonly finopsRecommendationRepository: Repository<FinopsRecommendation>,
        private readonly cloudService: CloudService,
        private readonly quotasService: AiQuotasService,
        private readonly recommendationsService: RecommendationsService,
        private readonly notificationsService: NotificationsService,
        private readonly mailerService: MailerService,
        private readonly briefingComposer: DailyBriefingComposer,
        private readonly auditService: AiAuditService,
    ) {}

    async listReports(organizationId: string, take = 30): Promise<AiDailyReport[]> {
        return this.reportRepository.find({
            where: { organizationId },
            order: { reportDate: 'DESC' },
            take,
        });
    }

    async getReport(id: string, organizationId: string): Promise<AiDailyReport> {
        const report = await this.reportRepository.findOne({ where: { id, organizationId } });
        if (!report) {
            throw new NotFoundException(ErrorMessages.CLOUD_INTELLIGENCE.NO_DATA);
        }
        return report;
    }

    async generateForOrganization(organizationId: string, reportDate = new Date()): Promise<AiDailyReport | null> {
        const snapshot = await this.quotasService.getSnapshot(organizationId);
        if (!snapshot.enabled || !snapshot.dailyIntelligenceEnabled) {
            this.logger.log(`daily.skip disabled org=${organizationId}`);
            return null;
        }
        if (!tierHasCapability(snapshot.tier, 'daily_intelligence')) {
            this.logger.log(`daily.skip tier=${snapshot.tier} org=${organizationId}`);
            return null;
        }

        const dateStr = reportDate.toISOString().slice(0, 10);
        const since = new Date(reportDate);
        since.setUTCDate(since.getUTCDate() - 1);

        const accounts = await this.cloudService.findByOrganization(organizationId, {});

        const [newRecs, openAnomalies, openFindings, openFinopsSavings] = await Promise.all([
            this.recommendationRepository.find({
                where: {
                    organizationId,
                    status: 'NEW',
                    createdAt: MoreThanOrEqual(since),
                },
                take: 50,
            }),
            this.anomalyRepository.find({
                where: {
                    organizationId,
                    status: 'open',
                },
                order: { createdAt: 'DESC' },
                take: 100,
            }),
            this.findingRepository.find({
                where: {
                    organizationId,
                    status: 'non_compliant',
                },
                order: { createdAt: 'DESC' },
                take: 100,
            }),
            this.finopsRecommendationRepository.find({
                where: {
                    organizationId,
                    status: 'open',
                },
                order: { createdAt: 'DESC' },
                take: 100,
            }),
        ]);

        const recentlySynced = accounts.filter(
            (account) => account.lastGeneralSyncAt && account.lastGeneralSyncAt >= since,
        ).length;

        const actionableCount = openAnomalies.length + openFindings.length + openFinopsSavings.length;

        if (actionableCount === 0) {
            this.logger.log(
                `daily.no-sources org=${organizationId} date=${dateStr} synced=${recentlySynced}`,
            );
            const summary = [
                `Daily Cloud Intelligence (${dateStr})`,
                `- ${recentlySynced} account(s) with recent sync.`,
                `- 0 open cost anomal(y/ies).`,
                `- 0 open governance finding(s).`,
                `- 0 open FinOps opportunit(y/ies).`,
                `- 0 recommendation(s) created/updated.`,
                '',
                'No recommendations were created: Daily needs open FinOps anomalies, non_compliant findings, or open FinOps opportunities. Sync alone does not create recommendations.',
            ].join('\n');

            const report = await this.upsertReport(organizationId, dateStr, {
                summary,
                findings: {
                    newRecommendations: newRecs.length,
                    openAnomalies: 0,
                    newFindings: 0,
                    openFinopsSavings: 0,
                    syncedAccounts: recentlySynced,
                    accountCount: accounts.length,
                    recommendationsCreated: 0,
                    briefing: {
                        headline: 'Nenhuma ação priorizada — sem fontes FinOps/Governança abertas.',
                        actions: [],
                        llmUsed: false,
                    },
                },
                recommendationIds: newRecs.map((r) => r.id),
                metadata: {
                    hasRelevantChanges: recentlySynced > 0 || newRecs.length > 0,
                    skipped: true,
                    reason: 'no_actionable_sources',
                    rankingVersion: DAILY_RANKING_VERSION,
                    llmUsed: false,
                },
            });

            await this.auditService.record({
                organizationId,
                action: 'daily_generated',
                entityType: 'ai_daily_report',
                entityId: report.id,
                metadata: { skipped: true, reason: 'no_actionable_sources' },
            });

            return report;
        }

        const ranked = aggregateDailySignals({
            findings: openFindings,
            anomalies: openAnomalies,
            savings: openFinopsSavings,
        });
        const topSignals = ranked.slice(0, DAILY_TOP_UPSERT);

        const recommendationIds: string[] = [];
        const recommendationIdsByDedupe = new Map<string, string>();

        for (const signal of topSignals) {
            const { recommendation } = await this.recommendationsService.upsertRecommendation({
                organizationId,
                agentType: signal.agentType,
                category: signal.category,
                title: signal.title,
                description: signal.description,
                severity: signal.severity,
                priority: signal.priority,
                evidence: signal.evidence,
                resourceReference: signal.resourceReference,
                estimatedImpact: signal.estimatedImpact,
                confidence: signal.confidence,
                dedupeKey: signal.dedupeKey,
            });
            recommendationIds.push(recommendation.id);
            recommendationIdsByDedupe.set(signal.dedupeKey, recommendation.id);
        }

        const briefing = await this.briefingComposer.compose({
            signals: topSignals,
            recommendationIdsByDedupe,
            counts: {
                anomalies: openAnomalies.length,
                findings: openFindings.length,
                savings: openFinopsSavings.length,
            },
        });

        const summary = [
            `Daily Cloud Intelligence (${dateStr})`,
            `- ${recentlySynced} account(s) with recent sync.`,
            `- ${openAnomalies.length} open cost anomal(y/ies).`,
            `- ${openFindings.length} open governance finding(s).`,
            `- ${openFinopsSavings.length} open FinOps opportunit(y/ies).`,
            `- ${recommendationIds.length} recommendation(s) created/updated.`,
            `- Ranking ${DAILY_RANKING_VERSION}; briefing llm=${briefing.llmUsed}.`,
            '',
            briefing.headline,
            ...briefing.actions.map(
                (action, index) =>
                    `${index + 1}. ${action.title} (score ${action.rankingScore}) — ${action.nextStep}`,
            ),
            '',
            'Open the Recommendations tab to review, approve, and prepare automations.',
        ].join('\n');

        const report = await this.upsertReport(organizationId, dateStr, {
            summary,
            findings: {
                newRecommendations: newRecs.length,
                openAnomalies: openAnomalies.length,
                newFindings: openFindings.length,
                openFinopsSavings: openFinopsSavings.length,
                syncedAccounts: recentlySynced,
                accountCount: accounts.length,
                recommendationsCreated: recommendationIds.length,
                briefing,
            },
            recommendationIds: Array.from(new Set([...recommendationIds, ...newRecs.map((r) => r.id)])),
            metadata: {
                hasRelevantChanges: true,
                skipped: false,
                reason: 'recommendations_generated',
                rankingVersion: DAILY_RANKING_VERSION,
                llmUsed: briefing.llmUsed,
            },
        });

        await this.notifyIfConfigured(organizationId, snapshot.notificationGroupIds, summary, report.findings);
        await this.auditService.record({
            organizationId,
            action: 'daily_generated',
            entityType: 'ai_daily_report',
            entityId: report.id,
            metadata: {
                skipped: false,
                recommendationsCreated: recommendationIds.length,
                llmUsed: briefing.llmUsed,
                rankingVersion: DAILY_RANKING_VERSION,
            },
        });
        return report;
    }

    private async upsertReport(
        organizationId: string,
        reportDate: string,
        data: {
            summary: string;
            findings: Record<string, unknown>;
            recommendationIds: string[];
            metadata: Record<string, unknown>;
        },
    ): Promise<AiDailyReport> {
        let report = await this.reportRepository.findOne({ where: { organizationId, reportDate } });
        if (!report) {
            report = this.reportRepository.create({ organizationId, reportDate, ...data });
        } else {
            Object.assign(report, data);
        }
        return this.reportRepository.save(report);
    }

    private async notifyIfConfigured(
        organizationId: string,
        groupIds: string[],
        summary: string,
        findings: Record<string, unknown>,
    ): Promise<void> {
        if (!groupIds?.length) return;
        try {
            const groups = await this.notificationsService.findGroupsByIds(organizationId, groupIds);
            if (!groups.length) return;
            const emails = await this.notificationsService.listActiveEmailsFromGroups(
                organizationId,
                groupIds,
            );
            if (emails.length) {
                await this.mailerService.sendCloudIntelligenceDigest({
                    to: emails,
                    summary,
                    findings,
                });
            }
            await this.notificationsService.sendWhatsappAlertToGroups(
                organizationId,
                groupIds,
                summary,
            );
        } catch (error) {
            this.logger.warn(
                `daily.notify.failed org=${organizationId} ${error instanceof Error ? error.message : 'unknown'}`,
            );
        }
    }
}
