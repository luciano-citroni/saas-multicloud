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
import type { PreparedChangeSet } from '../workflow/automation-node-runner';

export interface AutomationExecutionJobPayload {
    executionId: string;
    tenantId: string;
    cloudAccountId: string;
    automationId: string;
    snapshot?: WorkflowSnapshot;
    cloudProvider: string;
    pricingModel?: string | null;
    parameters?: Record<string, unknown>;
    acknowledgeCapabilities?: boolean;
    changeSets?: PreparedChangeSet[];
}

@Processor(AUTOMATION_EXECUTION_QUEUE, { concurrency: AUTOMATION_EXECUTION_WORKER_CONCURRENCY })
export class AutomationExecutionProcessor extends WorkerHost {
    private readonly logger = new Logger(AutomationExecutionProcessor.name);

    constructor(private readonly workflowExecutor: WorkflowExecutor) {
        super();
    }

    async process(job: Job<AutomationExecutionJobPayload>): Promise<void> {
        if (job.name !== AUTOMATION_EXECUTION_JOB_NAME) return;

        const { executionId, tenantId, cloudAccountId, automationId, snapshot, cloudProvider, pricingModel, parameters, acknowledgeCapabilities, changeSets } = job.data;

        this.logger.log(`Processando execução de automação ${executionId}`);

        await this.workflowExecutor.execute({
            executionId,
            tenantId,
            cloudAccountId,
            automationId,
            snapshot,
            cloudProvider,
            pricingModel: pricingModel as never,
            parameters,
            acknowledgeCapabilities,
            changeSets,
        });
    }
}
