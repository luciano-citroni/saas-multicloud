import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationsCrudService } from '../../automation/automations-crud.service';
import { BillingService } from '../../billing/billing.service';
import { SystemModule } from '../../common/modules/system-modules';
import { ErrorMessages } from '../../common/messages/error-messages';
import {
    AutomationCloudProvider,
    AutomationWorkflowStatus,
} from '../../db/entites/automation.entity';
import type { AiRecommendation } from '../../db/entites/ai-recommendation.entity';
import { AwsEc2Instance } from '../../db/entites/aws-ec2.entity';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import { FinopsRecommendation } from '../../db/entites/finops-recommendation.entity';
import { AiAuditService } from '../audit/ai-audit.service';
import { tierHasCapability } from '../usage/ai-tier.policy';
import { AiQuotasService } from '../usage/ai-quotas.service';
import {
    buildRecommendationAutomationDraft,
    type DraftAutomationGraph,
} from './recommendation-automation.builder';
import {
    canAutomateRecommendation,
    isCostAnomalyRecommendation,
    regionFromAvailabilityZone,
} from './recommendation-capabilities';
import { RecommendationsService } from './recommendations.service';

function hasAutomaticRemediation(plannedActions: string[]): boolean {
    return plannedActions.some((action) => action.startsWith('remediate_'));
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

@Injectable()
export class RecommendationAutomationService {
    private readonly logger = new Logger(RecommendationAutomationService.name);

    constructor(
        private readonly recommendationsService: RecommendationsService,
        private readonly automationsCrudService: AutomationsCrudService,
        private readonly quotasService: AiQuotasService,
        private readonly billingService: BillingService,
        private readonly auditService: AiAuditService,
        @InjectRepository(FinopsCostAnomaly)
        private readonly anomalyRepository: Repository<FinopsCostAnomaly>,
        @InjectRepository(FinopsRecommendation)
        private readonly finopsRecommendationRepository: Repository<FinopsRecommendation>,
        @InjectRepository(AwsEc2Instance)
        private readonly ec2Repository: Repository<AwsEc2Instance>,
    ) {}

    /**
     * Builds the full remediation workflow and publishes it when a concrete
     * remediation exists, leaving only the user Execute confirmation.
     */
    async prepareAutomation(recommendationId: string, organizationId: string, userId: string) {
        const tier = await this.quotasService.getTier(organizationId);
        if (!tierHasCapability(tier, 'recommendation_automation')) {
            throw new ForbiddenException(ErrorMessages.CLOUD_INTELLIGENCE.AGENT_UNAVAILABLE);
        }
        await this.billingService.assertModuleEnabled(organizationId, SystemModule.AUTOMATION);

        let recommendation = await this.recommendationsService.findOrFail(recommendationId, organizationId);
        recommendation = await this.hydrateResourceReference(recommendation, organizationId);

        if (isCostAnomalyRecommendation(recommendation) || !canAutomateRecommendation(recommendation)) {
            throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.AUTOMATION_NOT_MAPPED);
        }

        if (recommendation.status === 'NEW') {
            recommendation = await this.recommendationsService.updateStatus(
                recommendationId,
                organizationId,
                'REVIEWING',
            );
        }

        const draft = buildRecommendationAutomationDraft(recommendation);
        if (!draft.cloudAccountId) {
            throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.MISSING_CLOUD_ACCOUNT);
        }

        const existingAutomationId = (
            recommendation.resourceReference as { automationId?: string } | null
        )?.automationId;

        let automationId: string;
        let alreadyPrepared = false;

        const existing = existingAutomationId
            ? await this.findExistingAutomationOrNull(existingAutomationId, organizationId)
            : null;

        if (existing) {
            if (existing.status !== AutomationWorkflowStatus.DRAFT) {
                await this.automationsCrudService.revise(existing.id, organizationId, userId);
            }

            await this.automationsCrudService.update(existing.id, organizationId, userId, {
                name: draft.name,
                description: draft.description,
                nodes: draft.nodes,
                edges: draft.edges,
            });

            automationId = existing.id;
            alreadyPrepared = true;
        } else {
            if (existingAutomationId) {
                this.logger.warn(
                    `recommendation.prepare.stale-automation id=${recommendationId} missingAutomationId=${existingAutomationId}`,
                );
            }

            const automation = await this.automationsCrudService.create(organizationId, userId, {
                name: draft.name,
                description: draft.description,
                cloudAccountId: draft.cloudAccountId,
                cloudProvider: AutomationCloudProvider.AWS,
            });

            await this.automationsCrudService.update(automation.id, organizationId, userId, {
                nodes: draft.nodes,
                edges: draft.edges,
            });

            automationId = automation.id;
        }

        const canPublish = hasAutomaticRemediation(draft.plannedActions);
        let readyToExecute = false;
        let automationStatus: AutomationWorkflowStatus = AutomationWorkflowStatus.DRAFT;
        const plannedActions = [...draft.plannedActions];

        if (canPublish) {
            await this.automationsCrudService.publish(automationId, organizationId, userId);
            readyToExecute = true;
            automationStatus = AutomationWorkflowStatus.ACTIVE;
            if (!plannedActions.includes('ready_to_execute')) {
                plannedActions.push('ready_to_execute');
            }
            if (recommendation.status === 'NEW' || recommendation.status === 'REVIEWING') {
                recommendation = await this.recommendationsService.updateStatus(
                    recommendationId,
                    organizationId,
                    'APPROVED',
                );
            }
        }

        recommendation = await this.recommendationsService.patchResourceReference(
            recommendationId,
            organizationId,
            {
                ...(recommendation.resourceReference ?? {}),
                automationId,
                automationStatus,
                requiresHumanReview: true,
                readyToExecute,
                plannedActions,
            },
        );

        await this.auditService.record({
            organizationId,
            actorId: userId,
            action: 'prepare_automation',
            entityType: 'ai_recommendation',
            entityId: recommendationId,
            metadata: {
                automationId,
                requiresHumanReview: true,
                readyToExecute,
                plannedActions,
                alreadyPrepared,
            },
        });

        this.logger.log(
            `recommendation.prepare id=${recommendationId} automationId=${automationId} readyToExecute=${readyToExecute}`,
        );

        return {
            recommendation,
            automationId,
            editorUrl: `/automations/${automationId}`,
            executeUrl: readyToExecute ? `/automations/${automationId}?execute=1` : undefined,
            plannedActions,
            requiresHumanReview: true,
            readyToExecute,
            alreadyPrepared,
            draftSummary: summarizeDraft(draft, readyToExecute),
        };
    }

    /**
     * Acknowledge the linked FinOps cost anomaly and close the recommendation.
     */
    async acknowledgeAnomaly(recommendationId: string, organizationId: string, userId: string) {
        let recommendation = await this.recommendationsService.findOrFail(
            recommendationId,
            organizationId,
        );

        if (!isCostAnomalyRecommendation(recommendation)) {
            throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.AUTOMATION_NOT_MAPPED);
        }

        recommendation = await this.hydrateResourceReference(recommendation, organizationId);
        const evidence = asRecord(recommendation.evidence);
        const anomalyId = typeof evidence.anomalyId === 'string' ? evidence.anomalyId : null;
        if (!anomalyId) {
            throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.RECOMMENDATION_NOT_FOUND);
        }

        const anomaly = await this.anomalyRepository.findOne({
            where: { id: anomalyId, organizationId },
        });
        if (!anomaly) {
            throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.RECOMMENDATION_NOT_FOUND);
        }

        if (anomaly.status === 'open') {
            anomaly.status = 'acknowledged';
            await this.anomalyRepository.save(anomaly);
        }

        if (recommendation.status !== 'DISMISSED' && recommendation.status !== 'COMPLETED') {
            recommendation = await this.recommendationsService.updateStatus(
                recommendationId,
                organizationId,
                'DISMISSED',
            );
        }

        await this.auditService.record({
            organizationId,
            actorId: userId,
            action: 'recommendation_acknowledge_anomaly',
            entityType: 'ai_recommendation',
            entityId: recommendationId,
            metadata: { anomalyId, anomalyStatus: 'acknowledged' },
        });

        return {
            recommendation,
            anomalyId,
            anomalyStatus: 'acknowledged',
        };
    }

    /**
     * User confirmation gate: execute the published automation created by prepare.
     */
    async executeAutomation(recommendationId: string, organizationId: string, userId: string) {
        const tier = await this.quotasService.getTier(organizationId);
        if (!tierHasCapability(tier, 'recommendation_automation')) {
            throw new ForbiddenException(ErrorMessages.CLOUD_INTELLIGENCE.AGENT_UNAVAILABLE);
        }
        await this.billingService.assertModuleEnabled(organizationId, SystemModule.AUTOMATION);

        let recommendation = await this.recommendationsService.findOrFail(
            recommendationId,
            organizationId,
        );
        const automationId = (recommendation.resourceReference as { automationId?: string } | null)
            ?.automationId;

        if (!automationId) {
            throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.HUMAN_REVIEW_REQUIRED);
        }

        const automation = await this.automationsCrudService.findById(automationId, organizationId);
        if (automation.version === 0 || automation.status === AutomationWorkflowStatus.DRAFT) {
            throw new BadRequestException({
                message: ErrorMessages.CLOUD_INTELLIGENCE.HUMAN_REVIEW_REQUIRED,
                editorUrl: `/automations/${automationId}`,
                requiresHumanReview: true,
                readyToExecute: false,
            });
        }

        recommendation = await this.recommendationsService.updateStatus(
            recommendationId,
            organizationId,
            'EXECUTING',
        );

        const execution = await this.automationsCrudService.execute(automationId, organizationId, userId, {
            confirm: true,
        });

        await this.auditService.record({
            organizationId,
            actorId: userId,
            action: 'recommendation_execute_automation',
            entityType: 'ai_recommendation',
            entityId: recommendationId,
            metadata: {
                automationId,
                executionId: execution.id,
            },
        });

        this.logger.log(
            `recommendation.execute id=${recommendationId} automationId=${automationId} executionId=${execution.id}`,
        );

        return {
            recommendation,
            automationId,
            executionId: execution.id,
            executionUrl: `/automations/${automationId}/executions/${execution.id}`,
            editorUrl: `/automations/${automationId}`,
        };
    }

    private async findExistingAutomationOrNull(automationId: string, organizationId: string) {
        try {
            return await this.automationsCrudService.findById(automationId, organizationId);
        } catch (error) {
            if (error instanceof NotFoundException) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Older Daily rows may lack cloudAccountId. Recover it from linked FinOps evidence.
     */
    private async hydrateResourceReference(
        recommendation: AiRecommendation,
        organizationId: string,
    ): Promise<AiRecommendation> {
        const ref = asRecord(recommendation.resourceReference);
        if (typeof ref.cloudAccountId === 'string' && ref.cloudAccountId.trim()) {
            return recommendation;
        }

        const evidence = asRecord(recommendation.evidence);
        const patch: Record<string, unknown> = { ...ref };

        const anomalyId = typeof evidence.anomalyId === 'string' ? evidence.anomalyId : null;
        if (anomalyId) {
            const anomaly = await this.anomalyRepository.findOne({
                where: { id: anomalyId, organizationId },
            });
            if (anomaly) {
                patch.cloudAccountId = anomaly.cloudAccountId;
                patch.region = anomaly.region || ref.region || 'us-east-1';
                patch.resourceType = ref.resourceType || 'CostAnomaly';
                patch.resourceId = ref.resourceId || anomaly.service;
                patch.service = anomaly.service;
            }
        }

        const finopsRecommendationId =
            typeof evidence.finopsRecommendationId === 'string'
                ? evidence.finopsRecommendationId
                : null;
        if (!patch.cloudAccountId && finopsRecommendationId) {
            const saving = await this.finopsRecommendationRepository.findOne({
                where: { id: finopsRecommendationId, organizationId },
            });
            if (saving) {
                patch.cloudAccountId = saving.cloudAccountId;
                patch.resourceId = saving.resourceId ?? ref.resourceId;
                patch.resourceType = saving.resourceType ?? ref.resourceType;
            }
        }

        const resourceId = typeof patch.resourceId === 'string' ? patch.resourceId : String(ref.resourceId ?? '');
        if (resourceId.startsWith('i-') && !patch.region) {
            const ec2 = await this.ec2Repository.findOne({ where: { awsInstanceId: resourceId } });
            const region = regionFromAvailabilityZone(ec2?.availabilityZone);
            if (region) patch.region = region;
        }

        if (typeof patch.cloudAccountId !== 'string' || !patch.cloudAccountId.trim()) {
            return recommendation;
        }

        return this.recommendationsService.patchResourceReference(
            recommendation.id,
            organizationId,
            patch,
        );
    }
}

function summarizeDraft(draft: DraftAutomationGraph, readyToExecute: boolean): string {
    if (readyToExecute) {
        return `Automation published with ${draft.nodes.length} steps. Waiting for user execute confirmation.`;
    }
    return 'Draft created without automatic remediation mapping. Open the editor to add the fix, then publish.';
}
