import type { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import type { FinopsRecommendation } from '../../db/entites/finops-recommendation.entity';
import type { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import type {
    AiRecommendationPriority,
    AiRecommendationSeverity,
} from '../../db/entites/ai-recommendation.entity';
import { AiAgentType } from '../agents/agent.interface';
import { canAutomateRecommendation } from '../recommendations/recommendation-capabilities';

export const DAILY_RANKING_VERSION = 'v1';
export const DAILY_TOP_UPSERT = 25;
export const DAILY_BRIEFING_TOP = 5;

export type DailySignalSourceType = 'governance_finding' | 'finops_anomaly' | 'finops_saving';

export type DailySignalSource = {
    type: DailySignalSourceType;
    id: string;
};

export type RankedDailySignal = {
    dedupeKey: string;
    correlationKey: string | null;
    agentType: string;
    category: string;
    title: string;
    description: string;
    severity: AiRecommendationSeverity;
    priority: AiRecommendationPriority;
    confidence: number;
    rankingScore: number;
    automatable: boolean;
    evidence: Record<string, unknown>;
    resourceReference: Record<string, unknown> | null;
    estimatedImpact: {
        potentialSaving: number | null;
        currency: string;
        rankingScore: number;
    };
    sources: DailySignalSource[];
};

const FINOPS_TYPE_LABELS: Record<string, string> = {
    'stopped-ec2-ebs-cost': 'EC2 parada com custo de EBS',
    unused_ebs: 'Volume EBS sem uso',
    underutilized_ec2: 'EC2 subutilizada',
    oversized_rds: 'RDS superdimensionado',
    unused_disk: 'Disco sem uso',
};

function humanizeFinopsType(type: string): string {
    if (FINOPS_TYPE_LABELS[type]) return FINOPS_TYPE_LABELS[type];
    return type.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function severityWeight(severity: string): number {
    switch (severity) {
        case 'critical':
            return 40;
        case 'high':
            return 30;
        case 'medium':
            return 18;
        case 'low':
            return 8;
        default:
            return 12;
    }
}

function priorityWeight(priority: string): number {
    switch (priority) {
        case 'critical':
            return 20;
        case 'high':
            return 16;
        case 'medium':
            return 10;
        case 'low':
            return 4;
        default:
            return 8;
    }
}

function impactScore(amount: number | null | undefined): number {
    const value = Number(amount ?? 0);
    if (!Number.isFinite(value) || value <= 0) return 0;
    // Log-ish scale capped at 25
    return Math.min(25, Math.round(Math.log10(value + 1) * 10));
}

function recencyBonus(createdAt: Date | string | null | undefined, now = new Date()): number {
    if (!createdAt) return 0;
    const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(created.getTime())) return 0;
    const ageDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 2) return 10;
    if (ageDays <= 7) return 6;
    if (ageDays <= 30) return 3;
    return 0;
}

function scoreToPriority(score: number): AiRecommendationPriority {
    if (score >= 75) return 'critical';
    if (score >= 55) return 'high';
    if (score >= 35) return 'medium';
    return 'low';
}

function mapFindingSeverity(severity: string): AiRecommendationSeverity {
    if (severity === 'critical') return 'critical';
    if (severity === 'high') return 'high';
    if (severity === 'low') return 'low';
    return 'medium';
}

function mapSavingSeverity(priority: string): AiRecommendationSeverity {
    if (priority === 'high') return 'high';
    if (priority === 'low') return 'low';
    return 'medium';
}

function resourceKey(cloudAccountId: string, resourceId: string): string {
    return `${cloudAccountId}::${resourceId}`;
}

function buildProbeForAutomation(input: {
    title: string;
    description: string;
    evidence: Record<string, unknown>;
    resourceReference: Record<string, unknown> | null;
}): boolean {
    return canAutomateRecommendation({
        title: input.title,
        description: input.description,
        evidence: input.evidence,
        resourceReference: input.resourceReference,
    });
}

/**
 * Correlate FinOps savings + Governance findings by resourceId;
 * keep anomalies as service/region grain. Rank deterministically.
 */
export function aggregateDailySignals(input: {
    findings: GovernanceFinding[];
    anomalies: FinopsCostAnomaly[];
    savings: FinopsRecommendation[];
    now?: Date;
}): RankedDailySignal[] {
    const now = input.now ?? new Date();
    const signals: RankedDailySignal[] = [];

    type ResourceBucket = {
        cloudAccountId: string;
        resourceId: string;
        findings: GovernanceFinding[];
        savings: FinopsRecommendation[];
    };

    const buckets = new Map<string, ResourceBucket>();

    for (const finding of input.findings) {
        if (!finding.resourceId || !finding.cloudAccountId) continue;
        const key = resourceKey(finding.cloudAccountId, finding.resourceId);
        const bucket = buckets.get(key) ?? {
            cloudAccountId: finding.cloudAccountId,
            resourceId: finding.resourceId,
            findings: [],
            savings: [],
        };
        bucket.findings.push(finding);
        buckets.set(key, bucket);
    }

    for (const saving of input.savings) {
        if (!saving.resourceId || !saving.cloudAccountId) continue;
        const key = resourceKey(saving.cloudAccountId, saving.resourceId);
        const bucket = buckets.get(key) ?? {
            cloudAccountId: saving.cloudAccountId,
            resourceId: saving.resourceId,
            findings: [],
            savings: [],
        };
        bucket.savings.push(saving);
        buckets.set(key, bucket);
    }

    for (const bucket of buckets.values()) {
        const correlated = bucket.findings.length > 0 && bucket.savings.length > 0;
        if (correlated) {
            const primaryFinding = [...bucket.findings].sort(
                (a, b) => severityWeight(b.severity) - severityWeight(a.severity),
            )[0];
            const primarySaving = [...bucket.savings].sort(
                (a, b) => Number(b.potentialSaving ?? 0) - Number(a.potentialSaving ?? 0),
            )[0];
            const potentialSaving = bucket.savings.reduce(
                (sum, item) => sum + Number(item.potentialSaving ?? 0),
                0,
            );
            const currency = primarySaving.currency || 'USD';
            const title = `${humanizeFinopsType(primarySaving.type)} + ${primaryFinding.policyName}`.slice(
                0,
                300,
            );
            const description = [
                primarySaving.recommendation?.trim() || primarySaving.description,
                primaryFinding.recommendation || primaryFinding.description,
            ]
                .filter(Boolean)
                .join('\n\n');
            const sources: DailySignalSource[] = [
                ...bucket.findings.map((f) => ({ type: 'governance_finding' as const, id: f.id })),
                ...bucket.savings.map((s) => ({ type: 'finops_saving' as const, id: s.id })),
            ];
            const findingMeta =
                primaryFinding.metadata && typeof primaryFinding.metadata === 'object'
                    ? (primaryFinding.metadata as Record<string, unknown>)
                    : {};
            const evidence = {
                sources,
                correlationKey: `corr:${bucket.cloudAccountId}:${bucket.resourceId}`,
                findingId: primaryFinding.id,
                finopsRecommendationId: primarySaving.id,
                type: primarySaving.type,
                typeLabel: humanizeFinopsType(primarySaving.type),
                policyId: primaryFinding.policyId,
                policyName: primaryFinding.policyName,
                missingTags: findingMeta.missingTags,
                requiredTags: findingMeta.requiredTags,
            };
            const resourceReference = {
                cloudAccountId: bucket.cloudAccountId,
                resourceId: bucket.resourceId,
                resourceType: primarySaving.resourceType || primaryFinding.resourceType,
            };
            const automatable = buildProbeForAutomation({
                title: `Governance: ${primaryFinding.policyName}`,
                description,
                evidence,
                resourceReference,
            });
            const rankingScore = Math.min(
                100,
                severityWeight(primaryFinding.severity) +
                    priorityWeight(primarySaving.priority) +
                    impactScore(potentialSaving) +
                    12 + // correlation bonus
                    (automatable ? 8 : 0) +
                    Math.max(
                        recencyBonus(primaryFinding.createdAt, now),
                        recencyBonus(primarySaving.createdAt, now),
                    ),
            );
            signals.push({
                dedupeKey: `corr:${bucket.cloudAccountId}:${bucket.resourceId}`,
                correlationKey: `corr:${bucket.cloudAccountId}:${bucket.resourceId}`,
                agentType: AiAgentType.SECURITY_ANALYST,
                category: 'security',
                title,
                description,
                severity: mapFindingSeverity(primaryFinding.severity),
                priority: scoreToPriority(rankingScore),
                confidence: 0.78,
                rankingScore,
                automatable,
                evidence,
                resourceReference,
                estimatedImpact: {
                    potentialSaving: potentialSaving > 0 ? potentialSaving : null,
                    currency,
                    rankingScore,
                },
                sources,
            });
            continue;
        }

        for (const finding of bucket.findings) {
            const title = `Governance: ${finding.policyName}`;
            const description = finding.description;
            const sources: DailySignalSource[] = [{ type: 'governance_finding', id: finding.id }];
            const findingMeta =
                finding.metadata && typeof finding.metadata === 'object'
                    ? (finding.metadata as Record<string, unknown>)
                    : {};
            const evidence = {
                sources,
                correlationKey: null,
                findingId: finding.id,
                policyId: finding.policyId,
                policyName: finding.policyName,
                missingTags: findingMeta.missingTags,
                requiredTags: findingMeta.requiredTags,
            };
            const resourceReference = {
                cloudAccountId: finding.cloudAccountId,
                resourceId: finding.resourceId,
                resourceType: finding.resourceType,
            };
            const automatable = buildProbeForAutomation({
                title,
                description,
                evidence,
                resourceReference,
            });
            const rankingScore = Math.min(
                100,
                severityWeight(finding.severity) +
                    (automatable ? 8 : 0) +
                    recencyBonus(finding.createdAt, now),
            );
            signals.push({
                dedupeKey: `gov-finding:${finding.id}`,
                correlationKey: null,
                agentType: AiAgentType.SECURITY_ANALYST,
                category: 'security',
                title,
                description,
                severity: mapFindingSeverity(finding.severity),
                priority: scoreToPriority(rankingScore),
                confidence: 0.7,
                rankingScore,
                automatable,
                evidence,
                resourceReference,
                estimatedImpact: {
                    potentialSaving: null,
                    currency: 'USD',
                    rankingScore,
                },
                sources,
            });
        }

        for (const saving of bucket.savings) {
            const problem = saving.description?.trim() || humanizeFinopsType(saving.type);
            const action = saving.recommendation?.trim() || saving.description;
            const sources: DailySignalSource[] = [{ type: 'finops_saving', id: saving.id }];
            const evidence = {
                sources,
                correlationKey: null,
                finopsRecommendationId: saving.id,
                type: saving.type,
                typeLabel: humanizeFinopsType(saving.type),
                resourceType: saving.resourceType,
            };
            const resourceReference = {
                cloudAccountId: saving.cloudAccountId,
                resourceId: saving.resourceId,
                resourceType: saving.resourceType,
            };
            const automatable = buildProbeForAutomation({
                title: problem,
                description: action,
                evidence,
                resourceReference,
            });
            const potentialSaving =
                saving.potentialSaving != null ? Number(saving.potentialSaving) : null;
            const rankingScore = Math.min(
                100,
                priorityWeight(saving.priority) +
                    impactScore(potentialSaving) +
                    (automatable ? 8 : 0) +
                    recencyBonus(saving.createdAt, now),
            );
            signals.push({
                dedupeKey: `finops-saving:${saving.id}`,
                correlationKey: null,
                agentType: AiAgentType.FINOPS_ANALYST,
                category: 'finops',
                title: problem.slice(0, 300),
                description: action,
                severity: mapSavingSeverity(saving.priority),
                priority: scoreToPriority(rankingScore),
                confidence: 0.7,
                rankingScore,
                automatable,
                evidence,
                resourceReference,
                estimatedImpact: {
                    potentialSaving,
                    currency: saving.currency || 'USD',
                    rankingScore,
                },
                sources,
            });
        }
    }

    // Orphan savings/findings without resourceId
    for (const finding of input.findings) {
        if (finding.resourceId && finding.cloudAccountId) continue;
        const title = `Governance: ${finding.policyName}`;
        const rankingScore = Math.min(
            100,
            severityWeight(finding.severity) + recencyBonus(finding.createdAt, now),
        );
        signals.push({
            dedupeKey: `gov-finding:${finding.id}`,
            correlationKey: null,
            agentType: AiAgentType.SECURITY_ANALYST,
            category: 'security',
            title,
            description: finding.description,
            severity: mapFindingSeverity(finding.severity),
            priority: scoreToPriority(rankingScore),
            confidence: 0.65,
            rankingScore,
            automatable: false,
            evidence: {
                sources: [{ type: 'governance_finding', id: finding.id }],
                findingId: finding.id,
                policyId: finding.policyId,
            },
            resourceReference: {
                cloudAccountId: finding.cloudAccountId,
                resourceId: finding.resourceId,
                resourceType: finding.resourceType,
            },
            estimatedImpact: { potentialSaving: null, currency: 'USD', rankingScore },
            sources: [{ type: 'governance_finding', id: finding.id }],
        });
    }

    for (const saving of input.savings) {
        if (saving.resourceId && saving.cloudAccountId) continue;
        const problem = saving.description?.trim() || humanizeFinopsType(saving.type);
        const action = saving.recommendation?.trim() || saving.description;
        const potentialSaving =
            saving.potentialSaving != null ? Number(saving.potentialSaving) : null;
        const rankingScore = Math.min(
            100,
            priorityWeight(saving.priority) +
                impactScore(potentialSaving) +
                recencyBonus(saving.createdAt, now),
        );
        signals.push({
            dedupeKey: `finops-saving:${saving.id}`,
            correlationKey: null,
            agentType: AiAgentType.FINOPS_ANALYST,
            category: 'finops',
            title: problem.slice(0, 300),
            description: action,
            severity: mapSavingSeverity(saving.priority),
            priority: scoreToPriority(rankingScore),
            confidence: 0.65,
            rankingScore,
            automatable: false,
            evidence: {
                sources: [{ type: 'finops_saving', id: saving.id }],
                finopsRecommendationId: saving.id,
                type: saving.type,
                typeLabel: humanizeFinopsType(saving.type),
            },
            resourceReference: {
                cloudAccountId: saving.cloudAccountId,
                resourceId: saving.resourceId,
                resourceType: saving.resourceType,
            },
            estimatedImpact: {
                potentialSaving,
                currency: saving.currency || 'USD',
                rankingScore,
            },
            sources: [{ type: 'finops_saving', id: saving.id }],
        });
    }

    for (const anomaly of input.anomalies) {
        const sources: DailySignalSource[] = [{ type: 'finops_anomaly', id: anomaly.id }];
        const potentialSaving = Number(anomaly.financialImpact);
        const rankingScore = Math.min(
            100,
            severityWeight(anomaly.severity) +
                impactScore(potentialSaving) +
                Math.min(10, Math.round(Number(anomaly.deviationPercentage ?? 0) / 10)) +
                recencyBonus(anomaly.createdAt, now),
        );
        signals.push({
            dedupeKey: `finops-anomaly:${anomaly.id}`,
            correlationKey: null,
            agentType: AiAgentType.FINOPS_ANALYST,
            category: 'finops',
            title: `Cost anomaly: ${anomaly.service}`,
            description: anomaly.description ?? 'Open FinOps anomaly detected.',
            severity: anomaly.severity,
            priority: scoreToPriority(rankingScore),
            confidence: 0.65,
            rankingScore,
            automatable: false,
            evidence: {
                sources,
                anomalyId: anomaly.id,
                service: anomaly.service,
                region: anomaly.region,
                deviationPercentage: Number(anomaly.deviationPercentage),
            },
            resourceReference: {
                cloudAccountId: anomaly.cloudAccountId,
                resourceType: 'CostAnomaly',
                resourceId: anomaly.service,
                region: anomaly.region || 'us-east-1',
                service: anomaly.service,
            },
            estimatedImpact: {
                potentialSaving: Number.isFinite(potentialSaving) ? potentialSaving : null,
                currency: anomaly.currency || 'USD',
                rankingScore,
            },
            sources,
        });
    }

    return signals.sort((a, b) => b.rankingScore - a.rankingScore || a.title.localeCompare(b.title));
}
