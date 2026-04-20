import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationExecution, AutomationStatus, PricingModel } from '../db/entites/automation-execution.entity';
import { ProvisionedResource, ProvisionedResourceStatus } from '../db/entites/provisioned-resource.entity';
import { CostEstimatorService, type ResourceCostEstimate } from './cost-estimator.service';
import { AwsProvisionerService } from './aws-provisioner.service';
import { ErrorMessages } from '../common/messages/error-messages';
import type { EstimateCostBodyDto, FlowNodeDto, RunAutomationBodyDto } from './dto';

export interface CostEstimateResult {
    resources: ResourceCostEstimate[];
    totals: { onDemand: number; reserved: number; savings: number };
    savingsPercent: number;
}

@Injectable()
export class AutomationService {
    private readonly logger = new Logger(AutomationService.name);

    constructor(
        @InjectRepository(AutomationExecution)
        private readonly executionRepository: Repository<AutomationExecution>,

        @InjectRepository(ProvisionedResource)
        private readonly resourceRepository: Repository<ProvisionedResource>,

        private readonly costEstimator: CostEstimatorService,
        private readonly provisioner: AwsProvisionerService,
    ) {}

    estimateCost(dto: EstimateCostBodyDto): CostEstimateResult {
        const resources = this.costEstimator.estimateFlow(dto.flow.nodes as FlowNodeDto[]);
        const totals = resources.reduce(
            (acc, r) => ({
                onDemand: parseFloat((acc.onDemand + r.onDemand).toFixed(4)),
                reserved: parseFloat((acc.reserved + r.reserved).toFixed(4)),
                savings: parseFloat((acc.savings + r.savings).toFixed(4)),
            }),
            { onDemand: 0, reserved: 0, savings: 0 },
        );

        const savingsPercent =
            totals.onDemand > 0
                ? Math.round(((totals.onDemand - totals.savings) / totals.onDemand) * 100)
                : 0;

        return { resources, totals, savingsPercent };
    }

    async runAutomation(dto: RunAutomationBodyDto, organizationId: string): Promise<AutomationExecution> {
        const nodes = dto.flow.nodes as FlowNodeDto[];
        const estimates = this.costEstimator.estimateFlow(nodes);
        const pricingModel = dto.pricingModel as PricingModel;

        const totalCost = estimates.reduce((sum, e) => {
            return sum + this.costEstimator.applyPricingModel(e.onDemand, pricingModel);
        }, 0);

        const execution = this.executionRepository.create({
            organizationId,
            cloudAccountId: dto.cloudAccountId,
            pricingModel,
            totalEstimatedCost: parseFloat(totalCost.toFixed(4)),
            status: AutomationStatus.RUNNING,
            flowDefinition: dto.flow as unknown as Record<string, unknown>,
        });

        await this.executionRepository.save(execution);

        const startedAt = Date.now();

        try {
            const resourceEntities: ProvisionedResource[] = [];

            for (const node of nodes) {
                const estimate = estimates.find((e) => e.nodeId === node.id)!;
                const nodeCost = this.costEstimator.applyPricingModel(estimate.onDemand, pricingModel);

                const resource = this.resourceRepository.create({
                    executionId: execution.id,
                    resourceType: node.type,
                    region: this.getRegion(node),
                    config: node.config as Record<string, unknown>,
                    estimatedCost: parseFloat(nodeCost.toFixed(4)),
                    pricingModel,
                    status: ProvisionedResourceStatus.PENDING,
                });

                await this.resourceRepository.save(resource);

                try {
                    const result = await this.provisioner.provisionNode(
                        node.type,
                        node.config as Record<string, unknown>,
                        dto.cloudAccountId,
                        organizationId,
                    );

                    resource.awsResourceId = result.awsResourceId;
                    resource.status = ProvisionedResourceStatus.PROVISIONED;
                    await this.resourceRepository.save(resource);

                    this.logger.log(`Recurso provisionado: ${node.type} → ${result.awsResourceId}`);
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
                    resource.status = ProvisionedResourceStatus.FAILED;
                    resource.errorMessage = errMsg;
                    await this.resourceRepository.save(resource);
                    this.logger.error(`Falha ao provisionar ${node.type}: ${errMsg}`);
                }

                resourceEntities.push(resource);
            }

            const anyFailed = resourceEntities.some((r) => r.status === ProvisionedResourceStatus.FAILED);
            execution.status = anyFailed ? AutomationStatus.FAILED : AutomationStatus.COMPLETED;
            execution.durationMs = Date.now() - startedAt;
            await this.executionRepository.save(execution);

            return this.executionRepository.findOneOrFail({
                where: { id: execution.id },
                relations: ['resources'],
            });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
            execution.status = AutomationStatus.FAILED;
            execution.errorMessage = errMsg;
            execution.durationMs = Date.now() - startedAt;
            await this.executionRepository.save(execution);

            return this.executionRepository.findOneOrFail({
                where: { id: execution.id },
                relations: ['resources'],
            });
        }
    }

    async listExecutions(organizationId: string): Promise<AutomationExecution[]> {
        return this.executionRepository.find({
            where: { organizationId },
            relations: ['resources'],
            order: { createdAt: 'DESC' },
        });
    }

    async getExecution(id: string, organizationId: string): Promise<AutomationExecution> {
        const execution = await this.executionRepository.findOne({
            where: { id, organizationId },
            relations: ['resources'],
        });

        if (!execution) {
            throw new NotFoundException(ErrorMessages.AUTOMATION.NOT_FOUND);
        }

        return execution;
    }

    private getRegion(node: FlowNodeDto): string {
        const config = node.config as Record<string, unknown>;
        return String(config.region ?? 'us-east-1');
    }
}
