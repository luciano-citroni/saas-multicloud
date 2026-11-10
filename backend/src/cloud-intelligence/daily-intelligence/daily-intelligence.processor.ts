import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
    CLOUD_INTELLIGENCE_DAILY_CONCURRENCY,
    CLOUD_INTELLIGENCE_DAILY_JOB,
    CLOUD_INTELLIGENCE_DAILY_QUEUE,
} from '../constants';
import { DailyIntelligenceService } from './daily-intelligence.service';

@Processor(CLOUD_INTELLIGENCE_DAILY_QUEUE, {
    concurrency: CLOUD_INTELLIGENCE_DAILY_CONCURRENCY,
})
export class DailyIntelligenceProcessor extends WorkerHost {
    private readonly logger = new Logger(DailyIntelligenceProcessor.name);

    constructor(private readonly dailyIntelligenceService: DailyIntelligenceService) {
        super();
    }

    async process(job: Job<{ organizationId: string }>): Promise<void> {
        if (job.name !== CLOUD_INTELLIGENCE_DAILY_JOB) {
            return;
        }
        const organizationId = job.data.organizationId;
        this.logger.log(`daily.processor.start org=${organizationId} job=${job.id}`);
        await this.dailyIntelligenceService.generateForOrganization(organizationId);
        this.logger.log(`daily.processor.done org=${organizationId} job=${job.id}`);
    }
}
