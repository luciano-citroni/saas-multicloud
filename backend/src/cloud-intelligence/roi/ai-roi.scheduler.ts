import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AiRoiService } from './ai-roi.service';
import { AiQuotasService } from '../usage/ai-quotas.service';
import { tierHasCapability } from '../usage/ai-tier.policy';

@Injectable()
export class AiRoiScheduler {
    private readonly logger = new Logger(AiRoiScheduler.name);

    constructor(
        private readonly roiService: AiRoiService,
        private readonly quotasService: AiQuotasService,
    ) {}

    @Cron('0 9 * * 1', { timeZone: 'America/Sao_Paulo' })
    async weeklyRoiAndDigest(): Promise<void> {
        const orgs = await this.quotasService.listOrganizationsForDailyIntelligence();
        let captured = 0;
        for (const quota of orgs) {
            const organizationId = quota.organizationId;
            try {
                const snapshot = await this.quotasService.getSnapshot(organizationId);
                if (!tierHasCapability(snapshot.tier, 'daily_intelligence')) continue;
                await this.roiService.captureWeeklySnapshot(organizationId);
                await this.roiService.sendExecutiveWeeklyDigest(organizationId);
                captured += 1;
            } catch (error) {
                this.logger.warn(
                    `roi.weekly.failed org=${organizationId} ${error instanceof Error ? error.message : 'unknown'}`,
                );
            }
        }
        this.logger.log(`roi.weekly.done orgs=${captured}`);
    }
}
