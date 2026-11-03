import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    AutomationExecution,
    AutomationStatus,
    PricingModel,
} from '../../db/entites/automation-execution.entity';
import {
    AutomationExecutionNode,
    AutomationExecutionNodeStatus,
} from '../../db/entites/automation-execution-node.entity';
import { ProvisionedResource, ProvisionedResourceStatus } from '../../db/entites/provisioned-resource.entity';
import { normalizeActionType } from '../constants';
import { redactSensitive, sensitiveVariableNames } from '../bindings';
import { DependencyResolver } from './dependency-resolver';
import { OutputResolver } from './output-resolver';
import { WorkflowValidator } from './workflow-validator';
import { AutomationNodeRunner, type PreparedChangeSet } from './automation-node-runner';
import { ParameterCipher } from '../parameter-cipher';
import { CloudFormationAutomationService } from '../cloudformation-automation.service';
import { AwsAutomationProvider } from '../providers/aws/aws-automation-provider';
import type { WorkflowSnapshot } from './workflow.types';

const PARALLEL_LIMIT = 3;

export interface ExecuteWorkflowParams {
    executionId: string;
    tenantId: string;
    cloudAccountId: string;
    automationId: string;
    snapshot?: WorkflowSnapshot;
    cloudProvider: string;
    pricingModel?: PricingModel | null;
    parameters?: Record<string, unknown>;
    acknowledgeCapabilities?: boolean;
    changeSets?: PreparedChangeSet[];
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
        private readonly nodeRunner: AutomationNodeRunner,
        private readonly cloudFormation: CloudFormationAutomationService,
        private readonly parameterCipher: ParameterCipher,
        private readonly awsProvider: AwsAutomationProvider,
    ) {}

    async execute(params: ExecuteWorkflowParams): Promise<AutomationExecution> {
        const { executionId, tenantId, cloudAccountId, cloudProvider, pricingModel } = params;
        const execution = await this.executionRepository.findOneOrFail({ where: { id: executionId } });
        const snapshot = params.snapshot ?? this.snapshotFromFlow(execution.flowDefinition);
        const parameters = (await this.readParameters(executionId)) ?? params.parameters;
        this.workflowValidator.validate(snapshot, cloudProvider);
        const batches = this.dependencyResolver.resolveBatches(snapshot);

        const nodeOutputs = new Map<string, Record<string, unknown>>();
        const skippedNodes = new Set<string>();
        let executionFailed = false;
        let failureError: string | null = null;
        let inventorySyncStatus = 'NOT_APPLICABLE';
        const executionNodes = await this.executionNodeRepository.find({ where: { executionId } });
        const executionNodeMap = new Map(executionNodes.map((node) => [node.nodeId, node]));
        const startedAt = Date.now();
        const variables = this.resolveVariables(snapshot, parameters);
        const sensitiveKeys = sensitiveVariableNames(snapshot.variables);

        // Use update() — save() on an entity loaded without select:false columns nulls parametersEncrypted.
        const displayParameters = parameters
            ? (redactSensitive(parameters, sensitiveKeys) as Record<string, unknown>)
            : null;
        const flowDefinition = {
            ...(execution.flowDefinition ?? {}),
            ...(displayParameters ? { usedParameters: displayParameters } : {}),
        };
        execution.status = AutomationStatus.RUNNING;
        execution.startedAt = new Date();
        execution.flowDefinition = flowDefinition;
        await this.executionRepository.update(executionId, {
            status: AutomationStatus.RUNNING,
            startedAt: execution.startedAt,
            flowDefinition,
        });

        try {
            for (const batch of batches) {
                const runnable = batch.filter((nodeId) => !skippedNodes.has(nodeId));
                await this.runPool(runnable, async (nodeId) => {
                    if (skippedNodes.has(nodeId)) return;
                    const node = snapshot.nodes.find((item) => item.id === nodeId);
                    const execNode = executionNodeMap.get(nodeId);
                    if (!node || !execNode) return;

                    execNode.status = AutomationExecutionNodeStatus.RUNNING;
                    execNode.startedAt = new Date();
                    await this.executionNodeRepository.save(execNode);

                    try {
                        const resolvedConfig = this.outputResolver.resolveConfig(node.config, nodeOutputs, variables);
                        const canonicalType = normalizeActionType(node.type);
                        const templateKey = `${resolvedConfig.templateId}:${resolvedConfig.templateVersion}`;
                        const result = await this.nodeRunner.run(canonicalType, resolvedConfig, {
                            cloudAccountId,
                            tenantId,
                            executionId,
                            automationId: params.automationId,
                            nodeId,
                            cloudProvider: (cloudProvider as 'AWS' | 'GCP' | 'AZURE') || 'AWS',
                            template: snapshot.templates?.[templateKey],
                            acknowledgeCapabilities: params.acknowledgeCapabilities === true,
                            preparedChangeSet: params.changeSets?.find((changeSet) => changeSet.nodeId === nodeId),
                        });

                        const redactedKeys = new Set([...sensitiveKeys, ...(result.sensitiveKeys ?? [])]);
                        execNode.input = redactSensitive(resolvedConfig, redactedKeys) as Record<string, unknown>;
                        execNode.output = redactSensitive(result.output, redactedKeys) as Record<string, unknown>;
                        execNode.resourceId = result.resourceId;
                        execNode.awsOperationId = result.awsOperationId ?? null;
                        execNode.status = AutomationExecutionNodeStatus.SUCCESS;
                        execNode.finishedAt = new Date();
                        await this.executionNodeRepository.save(execNode);
                        nodeOutputs.set(nodeId, result.output);

                        if (result.inventorySyncStatus === 'FAILED') inventorySyncStatus = 'FAILED';
                        else if (result.inventorySyncStatus === 'SYNCED' && inventorySyncStatus !== 'FAILED') inventorySyncStatus = 'SYNCED';

                        const provisioned = result.provisioned?.length
                            ? result.provisioned
                            : result.resourceId
                              ? [
                                    {
                                        resourceType: canonicalType,
                                        awsResourceId: result.resourceId,
                                        arn: null as string | null,
                                        region: String(resolvedConfig.region ?? 'us-east-1'),
                                        stackId: null as string | null,
                                    },
                                ]
                              : [];

                        for (const resource of provisioned) {
                            await this.provisionedResourceRepository.save(
                                this.provisionedResourceRepository.create({
                                    executionId,
                                    resourceType: resource.resourceType,
                                    awsResourceId: resource.awsResourceId,
                                    arn: resource.arn,
                                    stackId: resource.stackId,
                                    region: resource.region,
                                    config: {
                                        actionType: canonicalType,
                                        ...(redactSensitive(resolvedConfig, redactedKeys) as Record<string, unknown>),
                                    },
                                    estimatedCost: 0,
                                    pricingModel: pricingModel ?? PricingModel.ON_DEMAND,
                                    status: ProvisionedResourceStatus.PROVISIONED,
                                    inventorySyncStatus: result.inventorySyncStatus ?? 'NOT_APPLICABLE',
                                }),
                            );
                        }
                    } catch (error) {
                        const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
                        execNode.status = AutomationExecutionNodeStatus.FAILED;
                        execNode.error = errMsg;
                        execNode.finishedAt = new Date();
                        await this.executionNodeRepository.save(execNode);
                        executionFailed = true;
                        failureError = errMsg;
                        for (const dependentId of this.dependencyResolver.getDependents(snapshot, nodeId)) {
                            skippedNodes.add(dependentId);
                            const dependent = executionNodeMap.get(dependentId);
                            if (dependent && dependent.status === AutomationExecutionNodeStatus.PENDING) {
                                dependent.status = AutomationExecutionNodeStatus.SKIPPED;
                                dependent.finishedAt = new Date();
                                await this.executionNodeRepository.save(dependent);
                            }
                        }
                        this.logger.error(`automation.node.failed executionId=${executionId} nodeId=${nodeId}`);
                    }
                });

                // Stop scheduling further batches once a node fails — avoid creating more resources to roll back.
                if (executionFailed) break;
            }

            if (executionFailed) {
                const rollbackErrors = await this.rollbackProvisionedResources(executionId, tenantId, cloudAccountId);
                if (rollbackErrors.length) {
                    failureError = [failureError, 'Falha ao reverter alguns recursos:', ...rollbackErrors]
                        .filter(Boolean)
                        .join(' ');
                } else {
                    failureError = [failureError, 'Recursos criados nesta execução foram revertidos automaticamente.']
                        .filter(Boolean)
                        .join(' ');
                }
            }

            execution.status = executionFailed ? AutomationStatus.FAILED : AutomationStatus.SUCCESS;
            execution.errorMessage = failureError;
            execution.inventorySyncStatus = inventorySyncStatus;
            execution.finishedAt = new Date();
            execution.durationMs = Date.now() - startedAt;
            await this.executionRepository.update(executionId, {
                status: execution.status,
                errorMessage: execution.errorMessage,
                inventorySyncStatus: execution.inventorySyncStatus,
                finishedAt: execution.finishedAt,
                durationMs: execution.durationMs,
                // Clear secrets on success; keep encrypted params on failure for replay.
                ...(execution.status === AutomationStatus.SUCCESS || execution.status === AutomationStatus.COMPLETED
                    ? { parametersEncrypted: null }
                    : {}),
            });
            return this.executionRepository.findOneOrFail({ where: { id: executionId }, relations: ['executionNodes', 'resources'] });
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
            const rollbackErrors = await this.rollbackProvisionedResources(executionId, tenantId, cloudAccountId);
            execution.status = AutomationStatus.FAILED;
            execution.errorMessage = [errMsg, ...rollbackErrors].filter(Boolean).join(' ');
            execution.finishedAt = new Date();
            execution.durationMs = Date.now() - startedAt;
            await this.executionRepository.update(executionId, {
                status: AutomationStatus.FAILED,
                errorMessage: execution.errorMessage,
                finishedAt: execution.finishedAt,
                durationMs: execution.durationMs,
            });
            throw error;
        }
    }

    private snapshotFromFlow(flow: Record<string, unknown>): WorkflowSnapshot {
        const snapshot = { ...flow };
        delete snapshot.runtimeParameters;
        delete snapshot.usedParameters;
        return snapshot as unknown as WorkflowSnapshot;
    }

    private async readParameters(executionId: string): Promise<Record<string, unknown> | undefined> {
        const row = await this.executionRepository
            .createQueryBuilder('execution')
            .addSelect('execution.parametersEncrypted')
            .where('execution.id = :id', { id: executionId })
            .getOne();
        if (!row?.parametersEncrypted) return undefined;
        const decoded = this.parameterCipher.decrypt(row.parametersEncrypted);
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return undefined;
        return decoded as Record<string, unknown>;
    }

    private async rollbackProvisionedResources(
        executionId: string,
        tenantId: string,
        cloudAccountId: string,
    ): Promise<string[]> {
        const resources = await this.provisionedResourceRepository.find({
            where: { executionId, status: ProvisionedResourceStatus.PROVISIONED },
            order: { createdAt: 'DESC' },
        });
        if (resources.length === 0) return [];

        this.logger.log(
            `automation.auto_rollback.start executionId=${executionId} resources=${resources.length}`,
        );

        const errors: string[] = [];
        const stacksDone = new Set<string>();
        const providerContext = { cloudAccountId, tenantId };

        for (const resource of resources) {
            if (resource.executionId !== executionId) continue;

            const claimed = await this.provisionedResourceRepository.update(
                { id: resource.id, status: ProvisionedResourceStatus.PROVISIONED },
                { status: ProvisionedResourceStatus.ROLLING_BACK, errorMessage: null },
            );
            if (!claimed.affected) continue;

            try {
                if (resource.stackId) {
                    if (stacksDone.has(resource.stackId)) {
                        await this.provisionedResourceRepository.update(resource.id, {
                            status: ProvisionedResourceStatus.ROLLED_BACK,
                            errorMessage: null,
                        });
                        continue;
                    }
                    await this.cloudFormation.deleteCreatedStack(
                        cloudAccountId,
                        tenantId,
                        resource.region,
                        resource.stackId,
                    );
                    stacksDone.add(resource.stackId);
                    await this.provisionedResourceRepository.update(
                        { executionId, stackId: resource.stackId },
                        { status: ProvisionedResourceStatus.ROLLED_BACK, errorMessage: null },
                    );
                    continue;
                }

                if (!resource.awsResourceId) {
                    await this.provisionedResourceRepository.update(resource.id, {
                        status: ProvisionedResourceStatus.ROLLED_BACK,
                        errorMessage: null,
                    });
                    continue;
                }

                await this.awsProvider.destroyResource(
                    resource.resourceType,
                    resource.awsResourceId,
                    resource.region,
                    resource.config ?? {},
                    providerContext,
                );
                await this.provisionedResourceRepository.update(resource.id, {
                    status: ProvisionedResourceStatus.ROLLED_BACK,
                    errorMessage: null,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'rollback failed';
                errors.push(`${resource.resourceType} ${resource.awsResourceId ?? resource.stackId ?? ''}: ${message}`);
                await this.provisionedResourceRepository.update(resource.id, {
                    status: ProvisionedResourceStatus.PROVISIONED,
                    errorMessage: message,
                });
                this.logger.error(
                    `automation.auto_rollback.failed executionId=${executionId} resource=${resource.id}`,
                );
            }
        }

        return errors;
    }

    private resolveVariables(snapshot: WorkflowSnapshot, parameters?: Record<string, unknown>): Record<string, unknown> {
        const resolved: Record<string, unknown> = {};
        for (const [name, variable] of Object.entries(snapshot.variables ?? {})) {
            if (parameters && name in parameters) resolved[name] = parameters[name];
            else if (variable.default !== undefined) resolved[name] = variable.default;
        }
        return resolved;
    }

    private async runPool(ids: string[], worker: (id: string) => Promise<void>): Promise<void> {
        const queue = [...ids];
        const runners = Array.from({ length: Math.min(PARALLEL_LIMIT, queue.length) }, async () => {
            while (queue.length > 0) {
                const id = queue.shift();
                if (!id) return;
                await worker(id);
            }
        });
        await Promise.all(runners);
    }
}
