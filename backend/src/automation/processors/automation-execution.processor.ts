import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
    AUTOMATION_EXECUTION_JOB_NAME,
    AUTOMATION_EXECUTION_QUEUE,
    AUTOMATION_EXECUTION_WORKER_CONCURRENCY,
    AUTOMATION_ROLLBACK_JOB_NAME,
} from '../constants';
import { AutomationsCrudService } from '../automations-crud.service';
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

export interface AutomationRollbackJobPayload {
    executionId: string;
    tenantId: string;
    automationId: string;
    triggeredBy: string;
}

@Processor(AUTOMATION_EXECUTION_QUEUE, { concurrency: AUTOMATION_EXECUTION_WORKER_CONCURRENCY })
export class AutomationExecutionProcessor extends WorkerHost {
    private readonly logger = new Logger(AutomationExecutionProcessor.name);

    constructor(
        private readonly workflowExecutor: WorkflowExecutor,
        private readonly automationsCrudService: AutomationsCrudService,
    ) {
        super();
    }

    async process(job: Job<AutomationExecutionJobPayload | AutomationRollbackJobPayload>): Promise<void> {
        if (job.name === AUTOMATION_ROLLBACK_JOB_NAME) {
            const data = job.data as AutomationRollbackJobPayload;
            this.logger.log(`Processando rollback de automação ${data.executionId}`);
            await this.automationsCrudService.processRollback(data);
            return;
        }

        if (job.name !== AUTOMATION_EXECUTION_JOB_NAME) return;

        const {
            executionId,
            tenantId,
            cloudAccountId,
            automationId,
            snapshot,
            cloudProvider,
            pricingModel,
            parameters,
            acknowledgeCapabilities,
            changeSets,
        } = job.data as AutomationExecutionJobPayload;

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
