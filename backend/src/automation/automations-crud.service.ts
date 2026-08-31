import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
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
import { CloudService } from '../cloud/cloud.service';
import { ErrorMessages } from '../common/messages/error-messages';
import { ACTION_DEFINITIONS } from './action-definitions';
import { AutomationAccessService } from './automation-access.service';
import {
    AUTOMATION_EXECUTION_JOB_NAME,
    AUTOMATION_EXECUTION_QUEUE,
} from './constants';
import { WorkflowValidator } from './workflow/workflow-validator';
import type { WorkflowSnapshot } from './workflow/workflow.types';
import type {
    CreateAutomationDto,
    UpdateAutomationDto,
} from './automations.dto';

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

        @InjectQueue(AUTOMATION_EXECUTION_QUEUE)
        private readonly executionQueue: Queue,

        private readonly dataSource: DataSource,
        private readonly cloudService: CloudService,
        private readonly accessService: AutomationAccessService,
        private readonly workflowValidator: WorkflowValidator,
    ) {}

    listActionDefinitions() {
        return ACTION_DEFINITIONS;
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
    }

    async publish(id: string, tenantId: string, userId: string): Promise<Automation> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);

        const automation = await this.findById(id, tenantId);
        const snapshot = this.toSnapshot(automation);

        this.workflowValidator.validate(snapshot, automation.cloudProvider);

        const newVersion = automation.version + 1;

        await this.versionRepository.save(
            this.versionRepository.create({
                automationId: automation.id,
                version: newVersion,
                snapshot: snapshot as unknown as Record<string, unknown>,
                publishedBy: userId,
            }),
        );

        automation.version = newVersion;
        automation.status = AutomationWorkflowStatus.ACTIVE;
        automation.updatedBy = userId;
        await this.automationRepository.save(automation);

        this.logger.log(`automation.published automationId=${id} version=${newVersion}`);

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

    async execute(id: string, tenantId: string, userId: string): Promise<AutomationExecution> {
        await this.accessService.assertAutomationModuleEnabled(tenantId);

        const automation = await this.findById(id, tenantId);

        if (automation.version === 0) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.NOT_PUBLISHED);
        }

        if (automation.status !== AutomationWorkflowStatus.ACTIVE) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.NOT_ACTIVE);
        }

        await this.assertCloudAccount(automation.cloudAccountId, tenantId);

        const versionRecord = await this.versionRepository.findOne({
            where: { automationId: automation.id, version: automation.version },
        });

        if (!versionRecord) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.NOT_PUBLISHED);
        }

        const snapshot = versionRecord.snapshot as unknown as WorkflowSnapshot;

        const execution = this.executionRepository.create({
            organizationId: tenantId,
            cloudAccountId: automation.cloudAccountId,
            automationId: automation.id,
            automationVersion: automation.version,
            triggeredBy: userId,
            pricingModel: null,
            totalEstimatedCost: 0,
            status: AutomationStatus.PENDING,
            flowDefinition: snapshot as unknown as Record<string, unknown>,
        });

        await this.executionRepository.save(execution);

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
                snapshot,
                cloudProvider: automation.cloudProvider,
            },
            {
                attempts: 1,
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 },
            },
        );

        this.logger.log(`automation.execution.started executionId=${execution.id} automationId=${id}`);

        return execution;
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
        };
    }

    private async assertCloudAccount(cloudAccountId: string, tenantId: string): Promise<void> {
        const account = await this.cloudService.findByIdAndTenant(cloudAccountId, tenantId);
        if (!account) {
            throw new NotFoundException(ErrorMessages.AUTOMATION.CLOUD_ACCOUNT_NOT_FOUND);
        }
    }
}
