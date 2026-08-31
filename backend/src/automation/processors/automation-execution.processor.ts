import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
    AUTOMATION_EXECUTION_JOB_NAME,
    AUTOMATION_EXECUTION_QUEUE,
    AUTOMATION_EXECUTION_WORKER_CONCURRENCY,
} from '../constants';
import { WorkflowExecutor } from '../workflow/workflow-executor';
import type { WorkflowSnapshot } from '../workflow/workflow.types';

export interface AutomationExecutionJobPayload {
    executionId: string;
    tenantId: string;
    cloudAccountId: string;
    snapshot: WorkflowSnapshot;
    cloudProvider: string;
    pricingModel?: string | null;
}

@Processor(AUTOMATION_EXECUTION_QUEUE, { concurrency: AUTOMATION_EXECUTION_WORKER_CONCURRENCY })
export class AutomationExecutionProcessor extends WorkerHost {
    private readonly logger = new Logger(AutomationExecutionProcessor.name);

    constructor(private readonly workflowExecutor: WorkflowExecutor) {
        super();
    }

    async process(job: Job<AutomationExecutionJobPayload>): Promise<void> {
        if (job.name !== AUTOMATION_EXECUTION_JOB_NAME) return;

        const { executionId, tenantId, cloudAccountId, snapshot, cloudProvider, pricingModel } = job.data;

        this.logger.log(`Processando execução de automação ${executionId}`);

        await this.workflowExecutor.execute({
            executionId,
            tenantId,
            cloudAccountId,
            snapshot,
            cloudProvider,
            pricingModel: pricingModel as never,
        });
    }
}
