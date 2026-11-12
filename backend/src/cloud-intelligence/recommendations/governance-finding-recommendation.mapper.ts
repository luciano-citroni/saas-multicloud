import type { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import type {
    AiRecommendationPriority,
    AiRecommendationSeverity,
} from '../../db/entites/ai-recommendation.entity';
import { AiAgentType } from '../agents/agent.interface';
import { canAutomateRecommendation } from './recommendation-capabilities';

export function governanceFindingDedupeKey(finding: {
    cloudAccountId: string;
    policyId: string;
    resourceId: string;
}): string {
    return `gov-policy:${finding.cloudAccountId}:${finding.policyId}:${finding.resourceId}`;
}

function mapFindingSeverity(severity: string): AiRecommendationSeverity {
    if (severity === 'critical') return 'critical';
    if (severity === 'high') return 'high';
    if (severity === 'low') return 'low';
    return 'medium';
}

function severityToPriority(severity: string): AiRecommendationPriority {
    if (severity === 'critical') return 'critical';
    if (severity === 'high') return 'high';
    if (severity === 'low') return 'low';
    return 'medium';
}

export type GovernanceFindingRecommendationPayload = {
    organizationId: string;
    agentType: string;
    category: string;
    title: string;
    description: string;
    severity: AiRecommendationSeverity;
    priority: AiRecommendationPriority;
    evidence: Record<string, unknown>;
    resourceReference: Record<string, unknown>;
    estimatedImpact: Record<string, unknown>;
    confidence: number;
    dedupeKey: string;
    automatable: boolean;
};

/**
 * Maps a persisted governance finding into an AI recommendation upsert payload.
 * Uses a stable dedupe key so re-scans update the same recommendation.
 */
export function mapGovernanceFindingToRecommendation(
    finding: GovernanceFinding,
): GovernanceFindingRecommendationPayload {
    const title = `Governance: ${finding.policyName}`;
    const description = finding.recommendation?.trim()
        ? `${finding.description}\n\n${finding.recommendation}`
        : finding.description;
    const findingMeta =
        finding.metadata && typeof finding.metadata === 'object'
            ? (finding.metadata as Record<string, unknown>)
            : {};
    const evidence = {
        sources: [{ type: 'governance_finding', id: finding.id }],
        correlationKey: null,
        findingId: finding.id,
        policyId: finding.policyId,
        policyName: finding.policyName,
        missingTags: findingMeta.missingTags,
        requiredTags: findingMeta.requiredTags ?? findingMeta.requiredLabels,
        expectedPattern: findingMeta.expectedPattern,
        expectedPatterns: findingMeta.expectedPatterns,
        knowledgeRuleType: findingMeta.knowledgeRuleType,
        source: findingMeta.source,
    };
    const resourceReference = {
        cloudAccountId: finding.cloudAccountId,
        resourceId: finding.resourceId,
        resourceType: finding.resourceType,
    };
    const automatable = canAutomateRecommendation({
        title,
        description,
        evidence,
        resourceReference,
    });

    return {
        organizationId: finding.organizationId,
        agentType: AiAgentType.SECURITY_ANALYST,
        category: finding.category || 'security',
        title,
        description,
        severity: mapFindingSeverity(finding.severity),
        priority: severityToPriority(finding.severity),
        evidence,
        resourceReference,
        estimatedImpact: {
            potentialSaving: null,
            currency: 'USD',
            rankingScore: automatable ? 70 : 55,
        },
        confidence: findingMeta.source === 'org_knowledge_rule' ? 0.85 : 0.7,
        dedupeKey: governanceFindingDedupeKey(finding),
        automatable,
    };
}
