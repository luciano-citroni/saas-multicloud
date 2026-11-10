import {
    ForbiddenException,
    Injectable,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorMessages } from '../../common/messages/error-messages';
import { AiOrgQuota } from '../../db/entites/ai-org-quota.entity';
import { resolveAiTier, type AiTier } from './ai-tier.policy';
import { AiUsageService } from './ai-usage.service';

export type QuotaSnapshot = {
    enabled: boolean;
    tier: AiTier;
    dailyLimit: number | null;
    monthlyLimit: number | null;
    dailyUsed: number;
    monthlyUsed: number;
    dailyRemaining: number | null;
    monthlyRemaining: number | null;
    perAgentLimits: Record<string, number>;
    dailyIntelligenceEnabled: boolean;
    notificationGroupIds: string[];
};

@Injectable()
export class AiQuotasService {
    constructor(
        @InjectRepository(AiOrgQuota)
        private readonly quotaRepository: Repository<AiOrgQuota>,
        private readonly usageService: AiUsageService,
        private readonly configService: ConfigService,
    ) {}

    private envLimit(key: string): number | null {
        const raw = this.configService.get<string>(key);
        if (raw === undefined || raw === null || raw.trim() === '') {
            return null;
        }
        const value = Number(raw);
        return Number.isFinite(value) && value >= 0 ? value : null;
    }

    async getOrCreateQuota(organizationId: string): Promise<AiOrgQuota> {
        let quota = await this.quotaRepository.findOne({ where: { organizationId } });
        if (quota) {
            return quota;
        }
        quota = this.quotaRepository.create({
            organizationId,
            dailyLimit: this.envLimit('AI_DEFAULT_DAILY_LIMIT'),
            monthlyLimit: this.envLimit('AI_DEFAULT_MONTHLY_LIMIT'),
            perAgentLimits: {},
            enabled: true,
            tier: 'basic',
            dailyIntelligenceEnabled: true,
            notificationGroupIds: [],
        });
        return this.quotaRepository.save(quota);
    }

    async getTier(organizationId: string): Promise<AiTier> {
        const quota = await this.getOrCreateQuota(organizationId);
        return resolveAiTier({ aiTier: quota.tier, modules: ['cloud_intelligence'] });
    }

    async getSnapshot(organizationId: string): Promise<QuotaSnapshot> {
        const quota = await this.getOrCreateQuota(organizationId);
        const now = new Date();
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

        const dailyLimit = quota.dailyLimit ?? this.envLimit('AI_DEFAULT_DAILY_LIMIT');
        const monthlyLimit = quota.monthlyLimit ?? this.envLimit('AI_DEFAULT_MONTHLY_LIMIT');

        const [dailyUsed, monthlyUsed] = await Promise.all([
            this.usageService.totalTokensBetween(organizationId, startOfDay, now),
            this.usageService.totalTokensBetween(organizationId, startOfMonth, now),
        ]);

        return {
            enabled: quota.enabled,
            tier: resolveAiTier({ aiTier: quota.tier, modules: ['cloud_intelligence'] }),
            dailyLimit,
            monthlyLimit,
            dailyUsed,
            monthlyUsed,
            dailyRemaining: dailyLimit === null ? null : Math.max(0, dailyLimit - dailyUsed),
            monthlyRemaining: monthlyLimit === null ? null : Math.max(0, monthlyLimit - monthlyUsed),
            perAgentLimits: quota.perAgentLimits ?? {},
            dailyIntelligenceEnabled: quota.dailyIntelligenceEnabled ?? true,
            notificationGroupIds: quota.notificationGroupIds ?? [],
        };
    }

    async assertWithinQuota(organizationId: string, agentType?: string): Promise<void> {
        const snapshot = await this.getSnapshot(organizationId);
        if (!snapshot.enabled) {
            throw new ForbiddenException(ErrorMessages.CLOUD_INTELLIGENCE.QUOTA_DISABLED);
        }

        if (snapshot.dailyLimit !== null && snapshot.dailyUsed >= snapshot.dailyLimit) {
            throw new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.QUOTA_EXCEEDED);
        }
        if (snapshot.monthlyLimit !== null && snapshot.monthlyUsed >= snapshot.monthlyLimit) {
            throw new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.QUOTA_EXCEEDED);
        }

        if (agentType && snapshot.perAgentLimits[agentType] !== undefined) {
            const now = new Date();
            const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            const agentUsage = await this.usageService.sumTokensInRange(organizationId, startOfMonth, now, {
                agentType,
            });
            const used = agentUsage.inputTokens + agentUsage.outputTokens;
            if (used >= snapshot.perAgentLimits[agentType]) {
                throw new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.QUOTA_EXCEEDED);
            }
        }
    }

    async updateQuota(
        organizationId: string,
        patch: {
            dailyLimit?: number | null;
            monthlyLimit?: number | null;
            perAgentLimits?: Record<string, number>;
            enabled?: boolean;
            dailyIntelligenceEnabled?: boolean;
            notificationGroupIds?: string[];
        },
    ): Promise<AiOrgQuota> {
        const quota = await this.getOrCreateQuota(organizationId);
        if (patch.dailyLimit !== undefined) {
            quota.dailyLimit = patch.dailyLimit;
        }
        if (patch.monthlyLimit !== undefined) {
            quota.monthlyLimit = patch.monthlyLimit;
        }
        if (patch.perAgentLimits !== undefined) {
            quota.perAgentLimits = patch.perAgentLimits;
        }
        if (patch.enabled !== undefined) {
            quota.enabled = patch.enabled;
        }
        if (patch.dailyIntelligenceEnabled !== undefined) {
            quota.dailyIntelligenceEnabled = patch.dailyIntelligenceEnabled;
        }
        if (patch.notificationGroupIds !== undefined) {
            quota.notificationGroupIds = patch.notificationGroupIds;
        }
        return this.quotaRepository.save(quota);
    }

    async listOrganizationsForDailyIntelligence(): Promise<AiOrgQuota[]> {
        return this.quotaRepository.find({
            where: { enabled: true, dailyIntelligenceEnabled: true },
        });
    }
}
