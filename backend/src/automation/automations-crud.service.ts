import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, In, Repository } from 'typeorm';
import {
    Automation,
    AutomationCloudProvider,
    AutomationWorkflowStatus,
} from '../db/entites/automation.entity';
import { AutomationNode } from '../db/entites/automation-node.entity';
import { AutomationEdge } from '../db/entites/automation-edge.entity';
import { AutomationVersion } from '../db/entites/automation-version.entity';
import {
    AutomationExecution,
    AutomationStatus,
} from '../db/entites/automation-execution.entity';
import {
    AutomationExecutionNode,
    AutomationExecutionNodeStatus,
} from '../db/entites/automation-execution-node.entity';
import { ProvisionedResource, ProvisionedResourceStatus } from '../db/entites/provisioned-resource.entity';
import { CloudService } from '../cloud/cloud.service';
import { ErrorMessages } from '../common/messages/error-messages';
import { listActions } from './action-definitions';
import type { AutomationProvider } from './provider-resource-catalog';
import { AutomationAccessService } from './automation-access.service';
import {
    AUTOMATION_EXECUTION_JOB_NAME,
    AUTOMATION_EXECUTION_QUEUE,
} from './constants';
import { WorkflowValidator } from './workflow/workflow-validator';
import type { WorkflowSnapshot } from './workflow/workflow.types';
import type {
    CreateAutomationDto,
    ExecuteAutomationDto,
    UpdateAutomationDto,
} from './automations.dto';
import { AutomationPlanService } from './automation-plan.service';
import { AutomationTemplateService } from './automation-template.service';
import { AutomationAuditService } from './automation-audit.service';
import { CloudFormationAutomationService } from './cloudformation-automation.service';
import { AwsAutomationProvider } from './providers/aws/aws-automation-provider';
import { resolveIdempotentSlot, sensitiveVariableNames } from './bindings';
import { ParameterCipher } from './parameter-cipher';
import type { PreparedChangeSet } from './workflow/automation-node-runner';

@Injectable()
export class AutomationsCrudService {
    private readonly logger = new Logger(AutomationsCrudService.name);

    constructor(
        @InjectRepository(Automation)
        private readonly automationRepository: Repository<Automation>,

        @InjectRepository(AutomationNode)
        private readonly nodeRepository: Repository<AutomationNode>,

        @InjectRepository(AutomationEdge)
        private readonly edgeRepository: Repository<AutomationEdge>,

        @InjectRepository(AutomationVersion)
        private readonly versionRepository: Repository<AutomationVersion>,

        @InjectRepository(AutomationExecution)
        private readonly executionRepository: Repository<AutomationExecution>,

        @InjectRepository(AutomationExecutionNode)
        private readonly executionNodeRepository: Repository<AutomationExecutionNode>,

        @InjectRepository(ProvisionedResource)
        private readonly provisionedResourceRepository: Repository<ProvisionedResource>,

        @InjectQueue(AUTOMATION_EXECUTION_QUEUE)
        private readonly executionQueue: Queue,

        private readonly dataSource: DataSource,
        private readonly cloudService: CloudService,
        private readonly accessService: AutomationAccessService,
        private readonly workflowValidator: WorkflowValidator,
        private readonly planService: AutomationPlanService,
        private readonly templateService: AutomationTemplateService,
        private readonly auditService: AutomationAuditService,
        private readonly cloudFormation: CloudFormationAutomationService,
        private readonly awsProvider: AwsAutomationProvider,
        private readonly parameterCipher: ParameterCipher,
    ) {}

    listActionDefinitions(provider?: AutomationProvider | null) {
        return listActions(provider);
    }

    async list(tenantId: string): Promise<Automation[]> {
        return this.automationRepository.find({
            where: { tenantId },
            order: { updatedAt: 'DESC' },
        });
    }

    async findById(id: string, tenantId: string): Promise<Automation> {
        const automation = await this.automationRepository.findOne({
            where: { id, tenantId },
            relations: ['nodes', 'edges'],
        });

        if (!automation) {
            throw new NotFoundException(ErrorMessages.AUTOMATION.WORKFLOW_NOT_FOUND);
        }

        return automation;
    }

    async create(tenantId: string, userId: string, dto: CreateAutomationDto): Promise<Automation> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);
        await this.assertCloudAccount(dto.cloudAccountId, tenantId);

        const automation = this.automationRepository.create({
            tenantId,
            cloudAccountId: dto.cloudAccountId,
            name: dto.name,
            description: dto.description ?? null,
            cloudProvider: dto.cloudProvider ?? AutomationCloudProvider.AWS,
            status: AutomationWorkflowStatus.DRAFT,
            version: 0,
            createdBy: userId,
            updatedBy: userId,
            variables: {},
        });

        await this.automationRepository.save(automation);

        this.logger.log(`automation.created automationId=${automation.id}`);

        return this.findById(automation.id, tenantId);
    }

    async update(
        id: string,
        tenantId: string,
        userId: string,
        dto: UpdateAutomationDto,
    ): Promise<Automation> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);

        const automation = await this.findById(id, tenantId);

        if (automation.status !== AutomationWorkflowStatus.DRAFT) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.NOT_DRAFT);
        }

        if (dto.name !== undefined) automation.name = dto.name;
        if (dto.description !== undefined) automation.description = dto.description;
        if (dto.cloudAccountId !== undefined) {
            await this.assertCloudAccount(dto.cloudAccountId, tenantId);
            automation.cloudAccountId = dto.cloudAccountId;
        }
        automation.updatedBy = userId;
        if (dto.variables !== undefined) {
            automation.variables = dto.variables;
        }

        await this.automationRepository.save(automation);

        if (dto.nodes !== undefined || dto.edges !== undefined) {
            await this.replaceGraph(automation.id, dto.nodes ?? [], dto.edges ?? []);
        }

        this.logger.log(`automation.updated automationId=${id}`);

        return this.findById(id, tenantId);
    }

    async delete(id: string, tenantId: string): Promise<void> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);
        const automation = await this.findById(id, tenantId);
        await this.automationRepository.remove(automation);
        await this.auditService.record({ tenantId, action: 'automation.deleted', entityType: 'automation', entityId: id });
    }

    async publish(id: string, tenantId: string, userId: string): Promise<Automation> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);

        const automation = await this.findById(id, tenantId);
        const snapshot = this.toSnapshot(automation);
        snapshot.templates = await this.templateService.embedForNodes(tenantId, snapshot.nodes);
        this.workflowValidator.validate(snapshot, automation.cloudProvider);
        const storedSnapshot = this.redactSnapshot(snapshot);

        const newVersion = automation.version + 1;

        await this.versionRepository.save(
            this.versionRepository.create({
                automationId: automation.id,
                version: newVersion,
                snapshot: storedSnapshot as unknown as Record<string, unknown>,
                publishedBy: userId,
            }),
        );

        automation.version = newVersion;
        automation.status = AutomationWorkflowStatus.ACTIVE;
        automation.updatedBy = userId;
        await this.automationRepository.save(automation);

        this.logger.log(`automation.published automationId=${id} version=${newVersion}`);
        await this.auditService.record({ tenantId, actorId: userId, action: 'automation.published', entityType: 'automation', entityId: id, metadata: { version: newVersion } });

        return this.findById(id, tenantId);
    }

    async activate(id: string, tenantId: string, userId: string): Promise<Automation> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);

        const automation = await this.findById(id, tenantId);

        if (automation.version === 0) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.NOT_PUBLISHED);
        }

        automation.status = AutomationWorkflowStatus.ACTIVE;
        automation.updatedBy = userId;
        await this.automationRepository.save(automation);

        return this.findById(id, tenantId);
    }

    async deactivate(id: string, tenantId: string, userId: string): Promise<Automation> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);

        const automation = await this.findById(id, tenantId);
        automation.status = AutomationWorkflowStatus.INACTIVE;
        automation.updatedBy = userId;
        await this.automationRepository.save(automation);

        return this.findById(id, tenantId);
    }

    async execute(id: string, tenantId: string, userId: string, dto: ExecuteAutomationDto): Promise<AutomationExecution> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);
        if (dto.confirm !== true) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.CONFIRMATION_REQUIRED);
        }

        const automation = await this.findById(id, tenantId);
        if (automation.version === 0) throw new BadRequestException(ErrorMessages.AUTOMATION.NOT_PUBLISHED);
        if (automation.status !== AutomationWorkflowStatus.ACTIVE) throw new BadRequestException(ErrorMessages.AUTOMATION.NOT_ACTIVE);
        await this.assertCloudAccount(automation.cloudAccountId, tenantId);
        this.assertRequiredVariables(automation.variables, dto.parameters);

        const existingRequest = dto.clientRequestId
            ? await this.executionRepository.findOne({ where: { automationId: automation.id, clientRequestId: dto.clientRequestId } })
            : null;
        const active = await this.executionRepository.findOne({
            where: { automationId: automation.id, organizationId: tenantId, status: In([AutomationStatus.PENDING, AutomationStatus.RUNNING]) },
        });
        const slot = resolveIdempotentSlot(Boolean(existingRequest), Boolean(active && active.id !== existingRequest?.id));
        if (slot === 'reuse' && existingRequest) return existingRequest;
        if (slot === 'blocked') throw new ConflictException(ErrorMessages.AUTOMATION.EXECUTION_IN_PROGRESS);

        const versionRecord = await this.versionRepository.findOne({ where: { automationId: automation.id, version: automation.version } });
        if (!versionRecord) throw new BadRequestException(ErrorMessages.AUTOMATION.NOT_PUBLISHED);
        const snapshot = versionRecord.snapshot as unknown as WorkflowSnapshot;
        const parameters = { ...this.variableDefaults(automation.variables), ...(dto.parameters ?? {}) };
        const changeSets = ((automation.pendingPlan as { changeSets?: PreparedChangeSet[] } | null)?.changeSets ?? []);

        const execution = await this.executionRepository.save(
            this.executionRepository.create({
                organizationId: tenantId,
                cloudAccountId: automation.cloudAccountId,
                automationId: automation.id,
                automationVersion: automation.version,
                triggeredBy: userId,
                clientRequestId: dto.clientRequestId ?? null,
                pricingModel: null,
                totalEstimatedCost: 0,
                status: AutomationStatus.PENDING,
                flowDefinition: snapshot as unknown as Record<string, unknown>,
            }),
        );
        await this.executionRepository.update(execution.id, { parametersEncrypted: this.parameterCipher.encrypt(parameters) });

        for (const node of snapshot.nodes) {
            await this.executionNodeRepository.save(
                this.executionNodeRepository.create({
                    executionId: execution.id,
                    nodeId: node.id,
                    status: AutomationExecutionNodeStatus.PENDING,
                }),
            );
        }

        await this.executionQueue.add(
            AUTOMATION_EXECUTION_JOB_NAME,
            {
                executionId: execution.id,
                tenantId,
                cloudAccountId: automation.cloudAccountId,
                automationId: automation.id,
                cloudProvider: automation.cloudProvider,
                acknowledgeCapabilities: dto.acknowledgeCapabilities === true,
                changeSets,
            },
            { attempts: 1, removeOnComplete: { count: 100 }, removeOnFail: { count: 50 } },
        );

        automation.pendingPlan = null;
        await this.automationRepository.save(automation);
        await this.auditService.record({ tenantId, actorId: userId, action: 'automation.executed', entityType: 'automation', entityId: id, metadata: { executionId: execution.id } });
        return execution;
    }

    async validate(id: string, tenantId: string) {
        const automation = await this.findById(id, tenantId);
        const snapshot = await this.snapshotForRead(automation, tenantId);
        this.workflowValidator.validate(snapshot, automation.cloudProvider);
        return { valid: true, version: automation.version, status: automation.status };
    }

    async plan(id: string, tenantId: string) {
        await this.accessService.assertAutomationModuleEnabled(tenantId);
        const automation = await this.findById(id, tenantId);
        await this.discardPendingPlan(automation, tenantId);
        const snapshot = await this.snapshotForRead(automation, tenantId);
        this.workflowValidator.validate(snapshot, automation.cloudProvider);
        const plan = await this.planService.build({
            tenantId,
            automationId: automation.id,
            cloudAccountId: automation.cloudAccountId,
            snapshot,
            createChangeSets: true,
        });
        automation.pendingPlan = { createdAt: new Date().toISOString(), changeSets: plan.changeSets };
        await this.automationRepository.save(automation);
        return { ...plan, limitations: plan.limitations };
    }

    async cancelPlan(id: string, tenantId: string) {
        const automation = await this.findById(id, tenantId);
        await this.discardPendingPlan(automation, tenantId);
        automation.pendingPlan = null;
        await this.automationRepository.save(automation);
        return { cancelled: true };
    }

    async revise(id: string, tenantId: string, userId: string) {
        await this.accessService.assertAutomationModuleEnabled(tenantId);
        const automation = await this.findById(id, tenantId);
        if (automation.status === AutomationWorkflowStatus.DRAFT) return automation;
        automation.status = AutomationWorkflowStatus.DRAFT;
        automation.updatedBy = userId;
        await this.automationRepository.save(automation);
        await this.auditService.record({ tenantId, actorId: userId, action: 'automation.revised', entityType: 'automation', entityId: id });
        return this.findById(id, tenantId);
    }

    async listExecutions(automationId: string, tenantId: string): Promise<AutomationExecution[]> {
        await this.findById(automationId, tenantId);

        return this.executionRepository.find({
            where: { automationId, organizationId: tenantId },
            order: { createdAt: 'DESC' },
        });
    }

    async getExecution(
        automationId: string,
        executionId: string,
        tenantId: string,
    ): Promise<AutomationExecution> {
        await this.findById(automationId, tenantId);

        const execution = await this.executionRepository.findOne({
            where: { id: executionId, automationId, organizationId: tenantId },
            relations: ['executionNodes', 'resources'],
        });

        if (!execution) {
            throw new NotFoundException(ErrorMessages.AUTOMATION.NOT_FOUND);
        }

        return execution;
    }

    async rollbackExecution(
        automationId: string,
        executionId: string,
        tenantId: string,
        userId: string,
    ): Promise<AutomationExecution> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);
        const automation = await this.findById(automationId, tenantId);
        const execution = await this.getExecution(automationId, executionId, tenantId);

        if (execution.status === AutomationStatus.PENDING || execution.status === AutomationStatus.RUNNING) {
            throw new ConflictException(ErrorMessages.AUTOMATION.ROLLBACK_IN_PROGRESS);
        }
        if (execution.status === AutomationStatus.ROLLED_BACK) {
            return execution;
        }
        if (execution.status !== AutomationStatus.SUCCESS && execution.status !== AutomationStatus.COMPLETED) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.ROLLBACK_NOT_ALLOWED);
        }

        const resources = await this.provisionedResourceRepository.find({
            where: {
                executionId,
                status: ProvisionedResourceStatus.PROVISIONED,
            },
            order: { createdAt: 'DESC' },
        });

        const errors: string[] = [];
        const stacksDone = new Set<string>();
        const providerContext = { cloudAccountId: execution.cloudAccountId, tenantId };

        for (const resource of resources) {
            try {
                if (resource.stackId) {
                    if (stacksDone.has(resource.stackId)) {
                        resource.status = ProvisionedResourceStatus.ROLLED_BACK;
                        await this.provisionedResourceRepository.save(resource);
                        continue;
                    }
                    await this.cloudFormation.deleteCreatedStack(
                        execution.cloudAccountId,
                        tenantId,
                        resource.region,
                        resource.stackId,
                    );
                    stacksDone.add(resource.stackId);
                    await this.provisionedResourceRepository.update(
                        { executionId, stackId: resource.stackId },
                        { status: ProvisionedResourceStatus.ROLLED_BACK },
                    );
                    continue;
                }

                if (!resource.awsResourceId) {
                    resource.status = ProvisionedResourceStatus.ROLLED_BACK;
                    await this.provisionedResourceRepository.save(resource);
                    continue;
                }

                await this.awsProvider.destroyResource(
                    resource.resourceType,
                    resource.awsResourceId,
                    resource.region,
                    resource.config ?? {},
                    providerContext,
                );
                resource.status = ProvisionedResourceStatus.ROLLED_BACK;
                await this.provisionedResourceRepository.save(resource);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'rollback failed';
                errors.push(`${resource.resourceType} ${resource.awsResourceId ?? resource.stackId ?? ''}: ${message}`);
                this.logger.error(`automation.rollback.failed executionId=${executionId} resource=${resource.id}`);
            }
        }

        if (errors.length) {
            execution.errorMessage = [`Rollback parcial`, ...errors].join('; ');
            await this.executionRepository.save(execution);
            throw new BadRequestException(ErrorMessages.AUTOMATION.ROLLBACK_FAILED);
        }

        execution.status = AutomationStatus.ROLLED_BACK;
        execution.errorMessage = null;
        await this.executionRepository.save(execution);
        await this.auditService.record({
            tenantId,
            actorId: userId,
            action: 'automation.execution.rolled_back',
            entityType: 'automation_execution',
            entityId: executionId,
            metadata: { automationId: automation.id, resources: resources.length },
        });

        return this.getExecution(automationId, executionId, tenantId);
    }

    async duplicate(id: string, tenantId: string, userId: string): Promise<Automation> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);

        const source = await this.findById(id, tenantId);

        const copy = await this.create(tenantId, userId, {
            name: `${source.name} (copy)`,
            description: source.description,
            cloudAccountId: source.cloudAccountId,
            cloudProvider: source.cloudProvider,
        });

        const snapshot = this.toSnapshot(source);
        await this.replaceGraph(copy.id, snapshot.nodes, snapshot.edges);
        const row = await this.automationRepository.findOneByOrFail({ id: copy.id });
        row.variables = source.variables ?? {};
        await this.automationRepository.save(row);

        return this.findById(copy.id, tenantId);
    }

    private async replaceGraph(
        automationId: string,
        nodes: Array<{
            id: string;
            type: string;
            name: string;
            config: Record<string, unknown>;
            position?: { x: number; y: number } | null;
        }>,
        edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string }>,
    ): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            await manager.delete(AutomationEdge, { automationId });
            await manager.delete(AutomationNode, { automationId });

            if (nodes.length > 0) {
                const nodeEntities = nodes.map((node) =>
                    manager.create(AutomationNode, {
                        id: node.id,
                        automationId,
                        type: node.type,
                        name: node.name,
                        config: node.config,
                        position: node.position ?? null,
                    }),
                );
                await manager.save(nodeEntities);
            }

            if (edges.length > 0) {
                const edgeEntities = edges.map((edge) =>
                    manager.create(AutomationEdge, {
                        id: edge.id,
                        automationId,
                        sourceNodeId: edge.sourceNodeId,
                        targetNodeId: edge.targetNodeId,
                    }),
                );
                await manager.save(edgeEntities);
            }
        });
    }

    private toSnapshot(automation: Automation): WorkflowSnapshot {
        return {
            nodes: (automation.nodes ?? []).map((node) => ({
                id: node.id,
                type: node.type,
                name: node.name,
                config: node.config,
                position: node.position,
            })),
            edges: (automation.edges ?? []).map((edge) => ({
                id: edge.id,
                sourceNodeId: edge.sourceNodeId,
                targetNodeId: edge.targetNodeId,
            })),
            variables: (automation.variables ?? {}) as WorkflowSnapshot['variables'],
        };
    }

    private async assertCloudAccount(cloudAccountId: string, tenantId: string): Promise<void> {
        const account = await this.cloudService.findByIdAndTenant(cloudAccountId, tenantId);
        if (!account) {
            throw new NotFoundException(ErrorMessages.AUTOMATION.CLOUD_ACCOUNT_NOT_FOUND);
        }
    }

    private variableDefaults(variables: Record<string, unknown> | undefined): Record<string, unknown> {
        const defaults: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(variables ?? {})) {
            const variable = value as { default?: unknown };
            if (variable.default !== undefined) defaults[name] = variable.default;
        }
        return defaults;
    }

    private redactSnapshot(snapshot: WorkflowSnapshot): WorkflowSnapshot {
        const sensitive = sensitiveVariableNames(snapshot.variables);
        const variables = { ...(snapshot.variables ?? {}) };
        for (const name of sensitive) {
            const variable = variables[name];
            if (variable) variables[name] = { ...variable, default: undefined };
        }
        return { ...snapshot, variables };
    }

    private async snapshotForRead(automation: Automation, tenantId: string): Promise<WorkflowSnapshot> {
        if (automation.status === AutomationWorkflowStatus.DRAFT || automation.version === 0) {
            const snapshot = this.toSnapshot(automation);
            snapshot.templates = await this.templateService.embedForNodes(tenantId, snapshot.nodes);
            return snapshot;
        }
        const versionRecord = await this.versionRepository.findOne({ where: { automationId: automation.id, version: automation.version } });
        if (!versionRecord) throw new BadRequestException(ErrorMessages.AUTOMATION.NOT_PUBLISHED);
        return versionRecord.snapshot as unknown as WorkflowSnapshot;
    }

    private assertRequiredVariables(variables: Record<string, unknown>, parameters?: Record<string, unknown>) {
        for (const [name, value] of Object.entries(variables ?? {})) {
            const variable = value as { required?: boolean; default?: unknown };
            if (variable.required && variable.default === undefined && !(parameters && name in parameters)) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.VARIABLE_UNRESOLVED);
            }
        }
    }

    private async discardPendingPlan(automation: Automation, tenantId: string) {
        const changeSets = (automation.pendingPlan as { changeSets?: PreparedChangeSet[] } | null)?.changeSets ?? [];
        for (const changeSet of changeSets) {
            await this.cloudFormation.discardReviewStack(
                automation.cloudAccountId,
                tenantId,
                changeSet.region,
                changeSet.stackName,
                changeSet.changeSetName,
            );
        }
    }
}
