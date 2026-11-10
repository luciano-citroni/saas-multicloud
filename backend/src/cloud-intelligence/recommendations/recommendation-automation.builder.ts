import { randomUUID } from 'crypto';
import { AUTOMATION_ACTION_TYPES } from '../../automation/constants';
import type { AiRecommendation } from '../../db/entites/ai-recommendation.entity';
import {
    canAutomateRecommendation,
    isCostAnomalyRecommendation,
    isRequiredTagsRecommendation,
    isStoppedEc2EbsRecommendation,
    isUnusedEbsRecommendation,
    missingTagsFromRecommendation,
} from './recommendation-capabilities';

export type DraftAutomationGraph = {
    name: string;
    description: string;
    cloudAccountId: string;
    plannedActions: string[];
    nodes: Array<{
        id: string;
        type: string;
        name: string;
        config: Record<string, unknown>;
        position: { x: number; y: number };
    }>;
    edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string }>;
};

type DraftNode = DraftAutomationGraph['nodes'][number];

type S3Remediation = {
    kind: 's3';
    plannedKey: string;
    nodeName: string;
    config: {
        encryption: boolean;
        publicAccessBlock: boolean;
        versioning: boolean;
    };
};

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function policyNameFromTitle(title: string): string {
    return title.replace(/^Governance:\s*/i, '').trim();
}

function resolveS3Remediation(recommendation: AiRecommendation): S3Remediation | null {
    const policy = policyNameFromTitle(recommendation.title).toLowerCase();
    const description = recommendation.description.toLowerCase();
    const ref = asRecord(recommendation.resourceReference);
    const resourceType = String(ref.resourceType ?? '').toLowerCase();
    const isS3 =
        resourceType.includes('s3') ||
        policy.includes('s3 bucket') ||
        description.includes('s3 bucket');

    if (!isS3) return null;

    if (
        policy.includes('server-side encryption') ||
        policy.includes('encryption enabled') ||
        description.includes('server-side encryption')
    ) {
        return {
            kind: 's3',
            plannedKey: 'remediate_s3_encryption',
            nodeName: 'Enable S3 server-side encryption',
            config: {
                encryption: true,
                publicAccessBlock: false,
                versioning: false,
            },
        };
    }

    if (
        policy.includes('publicly accessible') ||
        policy.includes('public access') ||
        description.includes('block public access') ||
        description.includes('publicly accessible')
    ) {
        return {
            kind: 's3',
            plannedKey: 'remediate_s3_public_access',
            nodeName: 'Enable S3 Block Public Access',
            config: {
                encryption: false,
                publicAccessBlock: true,
                versioning: false,
            },
        };
    }

    if (policy.includes('versioning') || description.includes('versioning')) {
        return {
            kind: 's3',
            plannedKey: 'remediate_s3_versioning',
            nodeName: 'Enable S3 versioning',
            config: {
                encryption: false,
                publicAccessBlock: false,
                versioning: true,
            },
        };
    }

    return null;
}

/**
 * Deterministic DRAFT graph from a recommendation.
 * Concrete remediation nodes are included when mapped; publish happens in the service.
 */
export function buildRecommendationAutomationDraft(
    recommendation: AiRecommendation,
): DraftAutomationGraph {
    const ref = asRecord(recommendation.resourceReference);
    const cloudAccountId = String(ref.cloudAccountId ?? '');
    const resourceId = String(ref.resourceId ?? '');
    const resourceType = String(ref.resourceType ?? '');
    const region = String(ref.region ?? 'us-east-1');

    const dataNodeId = randomUUID();
    const identityNodeId = randomUUID();
    const s3Remediation = resolveS3Remediation(recommendation);
    const stoppedEc2 = isStoppedEc2EbsRecommendation(recommendation);
    const unusedEbs = isUnusedEbsRecommendation(recommendation);
    const requiredTags = isRequiredTagsRecommendation(recommendation);
    const missingTags = missingTagsFromRecommendation(recommendation);

    const values: Record<string, string> = {
        recommendationId: recommendation.id,
        category: recommendation.category,
        title: recommendation.title,
        severity: recommendation.severity,
        resourceId,
        resourceType,
        suggestedAction: recommendation.description.slice(0, 500),
        humanReviewRequired: 'true',
    };

    const nodes: DraftNode[] = [
        {
            id: dataNodeId,
            type: AUTOMATION_ACTION_TYPES.AWS_DATA_INPUT,
            name: 'Recommendation context',
            config: { values },
            position: { x: 80, y: 120 },
        },
    ];
    const edges: DraftAutomationGraph['edges'] = [];
    const plannedActions: string[] = ['read_context'];

    let previousNodeId = dataNodeId;
    let x = 360;
    let remediationSummary =
        'No automatic remediation mapping for this finding yet — add the fix in the editor.';
    let hasRemediation = false;

    if (s3Remediation && resourceId) {
        const remediationNodeId = randomUUID();
        nodes.push({
            id: remediationNodeId,
            type: AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE,
            name: s3Remediation.nodeName,
            config: {
                bucketName: resourceId,
                region,
                encryption: s3Remediation.config.encryption,
                publicAccessBlock: s3Remediation.config.publicAccessBlock,
                versioning: s3Remediation.config.versioning,
            },
            position: { x, y: 120 },
        });
        edges.push({
            id: randomUUID(),
            sourceNodeId: previousNodeId,
            targetNodeId: remediationNodeId,
        });
        plannedActions.push(s3Remediation.plannedKey);
        previousNodeId = remediationNodeId;
        x += 280;
        hasRemediation = true;
        remediationSummary = `Remediation included: ${s3Remediation.nodeName} on ${resourceType || 'resource'} ${resourceId}.`;
    } else if (stoppedEc2 && resourceId) {
        const snapshotNodeId = randomUUID();
        const terminateNodeId = randomUUID();

        nodes.push({
            id: snapshotNodeId,
            type: AUTOMATION_ACTION_TYPES.AWS_EC2_CREATE_VOLUME_SNAPSHOTS,
            name: 'Create EBS snapshots from stopped instance',
            config: {
                instanceId: resourceId,
                region,
                descriptionPrefix: 'CI remediation snapshot',
            },
            position: { x, y: 120 },
        });
        edges.push({
            id: randomUUID(),
            sourceNodeId: previousNodeId,
            targetNodeId: snapshotNodeId,
        });
        plannedActions.push('remediate_ec2_snapshot_ebs');
        previousNodeId = snapshotNodeId;
        x += 280;

        nodes.push({
            id: terminateNodeId,
            type: AUTOMATION_ACTION_TYPES.AWS_EC2_TERMINATE_INSTANCE,
            name: 'Terminate EC2 and delete old EBS volumes',
            config: {
                instanceId: resourceId,
                region,
                deleteVolumes: true,
            },
            position: { x, y: 120 },
        });
        edges.push({
            id: randomUUID(),
            sourceNodeId: previousNodeId,
            targetNodeId: terminateNodeId,
        });
        plannedActions.push('remediate_ec2_terminate_delete_ebs');
        previousNodeId = terminateNodeId;
        x += 280;
        hasRemediation = true;
        remediationSummary = `Remediation included: snapshot EBS then terminate ${resourceId} and delete volumes.`;
    } else if (unusedEbs && resourceId) {
        const snapshotNodeId = randomUUID();
        nodes.push({
            id: snapshotNodeId,
            type: AUTOMATION_ACTION_TYPES.AWS_EC2_CREATE_VOLUME_SNAPSHOTS,
            name: 'Snapshot unused EBS volume before cleanup',
            config: {
                volumeIds: [resourceId],
                region,
                descriptionPrefix: 'CI unused EBS snapshot',
            },
            position: { x, y: 120 },
        });
        edges.push({
            id: randomUUID(),
            sourceNodeId: previousNodeId,
            targetNodeId: snapshotNodeId,
        });
        plannedActions.push('remediate_unused_ebs_snapshot');
        previousNodeId = snapshotNodeId;
        x += 280;
        hasRemediation = true;
        remediationSummary = `Remediation included: snapshot unused volume ${resourceId}. Confirm delete manually in the editor if needed.`;
    } else if (requiredTags && resourceId) {
        const tagKeys =
            missingTags.length > 0
                ? missingTags
                : Array.isArray(asRecord(recommendation.evidence).requiredTags)
                  ? (asRecord(recommendation.evidence).requiredTags as unknown[]).map(String)
                  : [];
        const tags = tagKeys.map((key) => ({
            key,
            // Placeholder values — human must set real values before execute.
            value: 'pending-review',
        }));
        const tagNodeId = randomUUID();
        nodes.push({
            id: tagNodeId,
            type: AUTOMATION_ACTION_TYPES.AWS_EC2_CREATE_TAGS,
            name: 'Apply missing required tags',
            config: {
                resourceIds: [resourceId],
                region,
                tags,
            },
            position: { x, y: 120 },
        });
        edges.push({
            id: randomUUID(),
            sourceNodeId: previousNodeId,
            targetNodeId: tagNodeId,
        });
        plannedActions.push('remediate_required_tags');
        previousNodeId = tagNodeId;
        x += 280;
        hasRemediation = true;
        remediationSummary = tags.length
            ? `Remediation included: apply tags [${tagKeys.join(', ')}] on ${resourceId}. Set real values before execute.`
            : `Remediation included: CreateTags draft for ${resourceId}. Review keys/values in the editor.`;
    } else if (isCostAnomalyRecommendation(recommendation)) {
        plannedActions.push('investigate_cost_anomaly');
    } else if (!canAutomateRecommendation(recommendation)) {
        plannedActions.push('manual_remediation');
    } else {
        plannedActions.push('manual_remediation');
    }

    nodes.push({
        id: identityNodeId,
        type: AUTOMATION_ACTION_TYPES.AWS_CALLER_IDENTITY,
        name: 'Validate account',
        config: { region },
        position: { x, y: 120 },
    });
    edges.push({
        id: randomUUID(),
        sourceNodeId: previousNodeId,
        targetNodeId: identityNodeId,
    });
    plannedActions.push('validate_account');

    return {
        name: `AI: ${recommendation.title}`.slice(0, 255),
        description: [
            'Cloud Intelligence automation generated from a recommendation.',
            remediationSummary,
            hasRemediation
                ? 'Published and ready for the user to confirm execution.'
                : 'Draft only — open the editor to add remediation, publish, then execute.',
            '',
            `Resource: ${resourceType || 'n/a'} ${resourceId || ''}`.trim(),
            recommendation.description.slice(0, 1200),
        ].join('\n'),
        cloudAccountId,
        plannedActions,
        nodes,
        edges,
    };
}
