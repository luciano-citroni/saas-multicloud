import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiRecommendation } from '../../db/entites/ai-recommendation.entity';
import { AiRoiSnapshot } from '../../db/entites/ai-roi-snapshot.entity';
import { AiOrgQuota } from '../../db/entites/ai-org-quota.entity';
import { MailerService } from '../../mailer/mailer.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DailyBriefingComposer } from '../daily-intelligence/daily-briefing.composer';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { aggregateDailySignals } from '../daily-intelligence/daily-signal.aggregator';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import { FinopsRecommendation } from '../../db/entites/finops-recommendation.entity';
import { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import { tierHasCapability } from '../usage/ai-tier.policy';
import { AiQuotasService } from '../usage/ai-quotas.service';

@Injectable()
export class AiRoiService {
    private readonly logger = new Logger(AiRoiService.name);

    constructor(
        @InjectRepository(AiRoiSnapshot)
        private readonly snapshotRepository: Repository<AiRoiSnapshot>,
        @InjectRepository(AiRecommendation)
        private readonly recommendationRepository: Repository<AiRecommendation>,
        @InjectRepository(AiOrgQuota)
        private readonly quotaRepository: Repository<AiOrgQuota>,
        @InjectRepository(FinopsCostAnomaly)
        private readonly anomalyRepository: Repository<FinopsCostAnomaly>,
        @InjectRepository(GovernanceFinding)
        private readonly findingRepository: Repository<GovernanceFinding>,
        @InjectRepository(FinopsRecommendation)
        private readonly finopsRecommendationRepository: Repository<FinopsRecommendation>,
        private readonly recommendationsService: RecommendationsService,
        private readonly briefingComposer: DailyBriefingComposer,
        private readonly quotasService: AiQuotasService,
        private readonly notificationsService: NotificationsService,
        private readonly mailerService: MailerService,
    ) {}

    async listSnapshots(organizationId: string, take = 12): Promise<AiRoiSnapshot[]> {
        return this.snapshotRepository.find({
            where: { organizationId },
            order: { periodEnd: 'DESC' },
            take,
        });
    }

    async getLatest(organizationId: string): Promise<AiRoiSnapshot | null> {
        const rows = await this.listSnapshots(organizationId, 1);
        return rows[0] ?? null;
    }

    async captureWeeklySnapshot(organizationId: string, now = new Date()): Promise<AiRoiSnapshot> {
        const periodEnd = now.toISOString().slice(0, 10);
        const start = new Date(now);
        start.setUTCDate(start.getUTCDate() - 7);
        const periodStart = start.toISOString().slice(0, 10);

        const pending = await this.recommendationRepository.find({
            where: {
                organizationId,
                status: In(['NEW', 'REVIEWING', 'APPROVED', 'EXECUTING']),
            },
            take: 500,
        });
        const completed = await this.recommendationRepository
            .createQueryBuilder('r')
            .where('r.organization_id = :organizationId', { organizationId })
            .andWhere('r.status = :status', { status: 'COMPLETED' })
            .andWhere('r.updated_at >= :from', { from: start })
            .getMany();

        const potentialSaving = pending.reduce((sum, row) => {
            const impact = row.estimatedImpact as { potentialSaving?: unknown } | null;
            const value = Number(impact?.potentialSaving ?? 0);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
        const completedSaving = completed.reduce((sum, row) => {
            const impact = row.estimatedImpact as { potentialSaving?: unknown } | null;
            const value = Number(impact?.potentialSaving ?? 0);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0);

        let snapshot = await this.snapshotRepository.findOne({
            where: { organizationId, periodStart, periodEnd },
        });
        if (!snapshot) {
            snapshot = this.snapshotRepository.create({
                organizationId,
                periodStart,
                periodEnd,
            });
        }
        snapshot.potentialSaving = potentialSaving;
        snapshot.completedSaving = completedSaving;
        snapshot.completedCount = completed.length;
        snapshot.pendingCount = pending.length;
        snapshot.currency = 'USD';
        snapshot.metadata = { capturedAt: now.toISOString() };
        return this.snapshotRepository.save(snapshot);
    }

    async captureAllEnabledOrgs(): Promise<number> {
        const quotas = await this.quotaRepository.find({ where: { enabled: true } });
        let count = 0;
        for (const quota of quotas) {
            try {
                await this.captureWeeklySnapshot(quota.organizationId);
                count += 1;
            } catch (error) {
                this.logger.warn(
                    `roi.capture.failed org=${quota.organizationId} ${error instanceof Error ? error.message : 'unknown'}`,
                );
            }
        }
        return count;
    }

    async sendExecutiveWeeklyDigest(organizationId: string): Promise<void> {
        const snapshot = await this.quotasService.getSnapshot(organizationId);
        if (!tierHasCapability(snapshot.tier, 'daily_intelligence')) {
            return;
        }

        const [anomalies, findings, savings] = await Promise.all([
            this.anomalyRepository.find({
                where: { organizationId, status: 'open' },
                take: 50,
                order: { createdAt: 'DESC' },
            }),
            this.findingRepository.find({
                where: { organizationId, status: 'non_compliant' },
                take: 50,
                order: { createdAt: 'DESC' },
            }),
            this.finopsRecommendationRepository.find({
                where: { organizationId, status: 'open' },
                take: 50,
                order: { createdAt: 'DESC' },
            }),
        ]);

        const ranked = aggregateDailySignals({ findings, anomalies, savings });
        const ids = new Map<string, string>();
        for (const signal of ranked.slice(0, 5)) {
            const existing = await this.recommendationsService.list(organizationId, { take: 100 });
            const match = existing.find((row) => row.dedupeKey === signal.dedupeKey);
            if (match) ids.set(signal.dedupeKey, match.id);
        }

        const briefing = await this.briefingComposer.compose({
            signals: ranked,
            recommendationIdsByDedupe: ids,
            counts: {
                anomalies: anomalies.length,
                findings: findings.length,
                savings: savings.length,
            },
        });
        const roi = await this.captureWeeklySnapshot(organizationId);
        const summary = [
            `Weekly Cloud Intelligence executive digest`,
            briefing.headline,
            `Potential open saving: ${roi.potentialSaving} ${roi.currency}`,
            `Completed saving (7d): ${roi.completedSaving} ${roi.currency}`,
            ...briefing.actions.map((action, i) => `${i + 1}. ${action.title} — ${action.nextStep}`),
        ].join('\n');

        const groupIds = snapshot.notificationGroupIds ?? [];
        if (!groupIds.length) return;
        const emails = await this.notificationsService.listActiveEmailsFromGroups(
            organizationId,
            groupIds,
        );
        if (emails.length) {
            await this.mailerService.sendCloudIntelligenceDigest({
                to: emails,
                summary,
                findings: { briefing, roi },
            });
        }
    }
}
