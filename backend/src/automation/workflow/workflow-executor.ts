import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    AutomationExecution,
    AutomationStatus,
} from '../../db/entites/automation-execution.entity';
import {
    AutomationExecutionNode,
    AutomationExecutionNodeStatus,
} from '../../db/entites/automation-execution-node.entity';
import { ProvisionedResource, ProvisionedResourceStatus } from '../../db/entites/provisioned-resource.entity';
import { PricingModel } from '../../db/entites/automation-execution.entity';
import { normalizeActionType, AUTOMATION_ACTION_TYPES } from '../constants';
import { getActionDefinition } from '../action-definitions';
import { AwsAutomationProvider } from '../providers/aws/aws-automation-provider';
import { DependencyResolver } from './dependency-resolver';
import { OutputResolver } from './output-resolver';
import { WorkflowValidator } from './workflow-validator';
import type { WorkflowSnapshot } from './workflow.types';

export interface ExecuteWorkflowParams {
    executionId: string;
    tenantId: string;
    cloudAccountId: string;
    snapshot: WorkflowSnapshot;
    cloudProvider: string;
    pricingModel?: PricingModel | null;
}

@Injectable()
export class WorkflowExecutor {
    private readonly logger = new Logger(WorkflowExecutor.name);

    constructor(
        @InjectRepository(AutomationExecution)
        private readonly executionRepository: Repository<AutomationExecution>,

        @InjectRepository(AutomationExecutionNode)
        private readonly executionNodeRepository: Repository<AutomationExecutionNode>,

        @InjectRepository(ProvisionedResource)
        private readonly provisionedResourceRepository: Repository<ProvisionedResource>,

        private readonly workflowValidator: WorkflowValidator,
        private readonly dependencyResolver: DependencyResolver,
        private readonly outputResolver: OutputResolver,
        private readonly awsProvider: AwsAutomationProvider,
    ) {}

    async execute(params: ExecuteWorkflowParams): Promise<AutomationExecution> {
        const { executionId, tenantId, cloudAccountId, snapshot, cloudProvider, pricingModel } = params;

        this.workflowValidator.validate(snapshot, cloudProvider);
        const batches = this.dependencyResolver.resolveBatches(snapshot);

        const execution = await this.executionRepository.findOneOrFail({ where: { id: executionId } });

        execution.status = AutomationStatus.RUNNING;
        execution.startedAt = new Date();
        await this.executionRepository.save(execution);

        this.logger.log(`automation.execution.started executionId=${executionId}`);

        const nodeOutputs = new Map<string, Record<string, unknown>>();
        const skippedNodes = new Set<string>();
        let executionFailed = false;
        let failureError: string | null = null;

        const executionNodes = await this.executionNodeRepository.find({ where: { executionId } });
        const executionNodeMap = new Map(executionNodes.map((n) => [n.nodeId, n]));

        const startedAt = Date.now();

        try {
            for (const batch of batches) {
                for (const nodeId of batch) {
                    if (skippedNodes.has(nodeId)) continue;

                    const node = snapshot.nodes.find((n) => n.id === nodeId);
                    if (!node) continue;

                    const execNode = executionNodeMap.get(nodeId);
                    if (!execNode) continue;

                    execNode.status = AutomationExecutionNodeStatus.RUNNING;
                    execNode.startedAt = new Date();
                    await this.executionNodeRepository.save(execNode);

                    this.logger.log(`automation.node.started executionId=${executionId} nodeId=${nodeId}`);

                    try {
                        const resolvedConfig = this.outputResolver.resolveConfig(node.config, nodeOutputs);
                        execNode.input = resolvedConfig;

                        const canonicalType = normalizeActionType(node.type);
                        const definition = getActionDefinition(canonicalType);

                        if (!definition) {
                            throw new Error('Unsupported action type');
                        }

                        let result: { output: Record<string, unknown>; resourceId: string | null };

                        if (definition.provider === 'AWS') {
                            const awsConfig =
                                canonicalType === AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE
                                    ? {
                                          ...resolvedConfig,
                                          originDomainName: resolvedConfig.origin,
                                      }
                                    : resolvedConfig;

                            result = await this.awsProvider.executeAction(canonicalType, awsConfig, {
                                cloudAccountId,
                                tenantId,
                            });
                        } else {
                            throw new Error('Unsupported cloud provider');
                        }

                        nodeOutputs.set(nodeId, result.output);
                        execNode.output = result.output;
                        execNode.resourceId = result.resourceId;
                        execNode.status = AutomationExecutionNodeStatus.SUCCESS;
                        execNode.finishedAt = new Date();
                        await this.executionNodeRepository.save(execNode);

                        if (pricingModel) {
                            await this.provisionedResourceRepository.save(
                                this.provisionedResourceRepository.create({
                                    executionId,
                                    resourceType: canonicalType,
                                    awsResourceId: result.resourceId,
                                    region: String(resolvedConfig.region ?? 'us-east-1'),
                                    config: resolvedConfig,
                                    estimatedCost: 0,
                                    pricingModel,
                                    status: ProvisionedResourceStatus.PROVISIONED,
                                }),
                            );
                        }

                        this.logger.log(`automation.node.success executionId=${executionId} nodeId=${nodeId}`);
                    } catch (err) {
                        const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
                        execNode.status = AutomationExecutionNodeStatus.FAILED;
                        execNode.error = errMsg;
                        execNode.finishedAt = new Date();
                        await this.executionNodeRepository.save(execNode);

                        executionFailed = true;
                        failureError = errMsg;

                        const dependents = this.dependencyResolver.getDependents(snapshot, nodeId);
                        for (const dependentId of dependents) {
                            skippedNodes.add(dependentId);
                            const dependentExecNode = executionNodeMap.get(dependentId);
                            if (dependentExecNode) {
                                dependentExecNode.status = AutomationExecutionNodeStatus.SKIPPED;
                                dependentExecNode.finishedAt = new Date();
                                await this.executionNodeRepository.save(dependentExecNode);
                            }
                        }

                        this.logger.error(`automation.node.failed executionId=${executionId} nodeId=${nodeId}`);
                    }
                }
            }

            execution.status = executionFailed ? AutomationStatus.FAILED : AutomationStatus.SUCCESS;
            execution.errorMessage = failureError;
            execution.finishedAt = new Date();
            execution.durationMs = Date.now() - startedAt;
            await this.executionRepository.save(execution);

            if (executionFailed) {
                this.logger.error(`automation.execution.failed executionId=${executionId}`);
            } else {
                this.logger.log(`automation.execution.success executionId=${executionId}`);
            }

            return this.executionRepository.findOneOrFail({
                where: { id: executionId },
                relations: ['executionNodes', 'resources'],
            });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
            execution.status = AutomationStatus.FAILED;
            execution.errorMessage = errMsg;
            execution.finishedAt = new Date();
            execution.durationMs = Date.now() - startedAt;
            await this.executionRepository.save(execution);

            this.logger.error(`automation.execution.failed executionId=${executionId}`);
            throw err;
        }
    }
}
