import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { CLOUD_INTELLIGENCE_DAILY_JOB, CLOUD_INTELLIGENCE_DAILY_QUEUE } from '../constants';
import { resolveAiTier, tierHasCapability } from '../usage/ai-tier.policy';
import { AiQuotasService } from '../usage/ai-quotas.service';

@Injectable()
export class DailyIntelligenceScheduler {
    private readonly logger = new Logger(DailyIntelligenceScheduler.name);

    constructor(
        @InjectQueue(CLOUD_INTELLIGENCE_DAILY_QUEUE)
        private readonly dailyQueue: Queue,
        private readonly quotasService: AiQuotasService,
    ) {}

    @Cron('0 8 * * *', { timeZone: 'America/Sao_Paulo' })
    async enqueueDailyJobs(): Promise<void> {
        const quotas = await this.quotasService.listOrganizationsForDailyIntelligence();
        let enqueued = 0;
        for (const quota of quotas) {
            const tier = resolveAiTier({ aiTier: quota.tier, modules: ['cloud_intelligence'] });
            if (!tierHasCapability(tier, 'daily_intelligence')) {
                continue;
            }
            await this.dailyQueue.add(
                CLOUD_INTELLIGENCE_DAILY_JOB,
                { organizationId: quota.organizationId },
                {
                    jobId: `ci-daily:${quota.organizationId}:${new Date().toISOString().slice(0, 10)}`,
                    removeOnComplete: 100,
                    removeOnFail: 50,
                },
            );
            enqueued += 1;
        }
        this.logger.log(`daily.scheduler.enqueued count=${enqueued}`);
    }
}
