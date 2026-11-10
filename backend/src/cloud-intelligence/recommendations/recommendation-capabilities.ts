import type { AiRecommendation } from '../../db/entites/ai-recommendation.entity';

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

export function isCostAnomalyRecommendation(
    recommendation: Pick<AiRecommendation, 'title' | 'evidence' | 'resourceReference'>,
): boolean {
    const title = recommendation.title.toLowerCase();
    const evidence = asRecord(recommendation.evidence);
    const ref = asRecord(recommendation.resourceReference);
    return (
        title.startsWith('cost anomaly:') ||
        typeof evidence.anomalyId === 'string' ||
        String(ref.resourceType ?? '').toLowerCase() === 'costanomaly'
    );
}

export function isStoppedEc2EbsRecommendation(
    recommendation: Pick<AiRecommendation, 'title' | 'description' | 'evidence' | 'resourceReference'>,
): boolean {
    const evidence = asRecord(recommendation.evidence);
    const ref = asRecord(recommendation.resourceReference);
    const type = String(evidence.type ?? '').toLowerCase();
    const title = recommendation.title.toLowerCase();
    const description = recommendation.description.toLowerCase();
    const resourceId = String(ref.resourceId ?? '');
    const resourceType = String(ref.resourceType ?? '').toLowerCase();

    if (type === 'stopped-ec2-ebs-cost') return true;
    if (title.includes('stopped-ec2-ebs-cost')) return true;
    if (resourceId.startsWith('i-') && description.includes('snapshot') && description.includes('ebs')) {
        return true;
    }
    if (
        resourceType.includes('ec2') &&
        (description.includes('está parada') || description.includes('stopped')) &&
        description.includes('ebs')
    ) {
        return true;
    }
    return false;
}

export function isUnusedEbsRecommendation(
    recommendation: Pick<AiRecommendation, 'title' | 'description' | 'evidence' | 'resourceReference'>,
): boolean {
    const evidence = asRecord(recommendation.evidence);
    const ref = asRecord(recommendation.resourceReference);
    const type = String(evidence.type ?? '').toLowerCase();
    const resourceId = String(ref.resourceId ?? '');
    const resourceType = String(ref.resourceType ?? '').toLowerCase();
    const title = recommendation.title.toLowerCase();
    const description = recommendation.description.toLowerCase();

    if (type === 'unused_ebs' || type === 'unused_disk') return true;
    if (resourceId.startsWith('vol-') && (title.includes('unused') || description.includes('unused'))) {
        return true;
    }
    if (
        (resourceType.includes('ebs') || resourceType.includes('volume')) &&
        (title.includes('sem uso') || title.includes('unused') || description.includes('unused'))
    ) {
        return true;
    }
    return false;
}

export function isRequiredTagsRecommendation(
    recommendation: Pick<AiRecommendation, 'title' | 'description' | 'evidence' | 'resourceReference'>,
): boolean {
    const evidence = asRecord(recommendation.evidence);
    const ref = asRecord(recommendation.resourceReference);
    const policyId = String(evidence.policyId ?? '').toLowerCase();
    const policy = recommendation.title.replace(/^Governance:\s*/i, '').trim().toLowerCase();
    const description = recommendation.description.toLowerCase();
    const resourceId = String(ref.resourceId ?? '');
    const resourceType = String(ref.resourceType ?? '').toLowerCase();
    const missingTags = evidence.missingTags;

    if (policyId === 'aws-ec2-required-tags' || policyId === 'gcp-vm-required-labels') {
        return true;
    }
    if (Array.isArray(missingTags) && missingTags.length > 0) {
        return true;
    }
    if (
        (policy.includes('required tags') ||
            policy.includes('required labels') ||
            description.includes('missing required tags') ||
            description.includes('missing required labels') ||
            description.includes('missing tags')) &&
        (resourceId.startsWith('i-') ||
            resourceType.includes('ec2') ||
            resourceType.includes('vm') ||
            resourceType.includes('instance'))
    ) {
        return true;
    }
    return false;
}

export function missingTagsFromRecommendation(
    recommendation: Pick<AiRecommendation, 'description' | 'evidence'>,
): string[] {
    const evidence = asRecord(recommendation.evidence);
    if (Array.isArray(evidence.missingTags)) {
        return evidence.missingTags.map((tag) => String(tag).trim()).filter(Boolean);
    }
    const match = recommendation.description.match(/missing required tags?:\s*([^.]+)/i);
    if (!match?.[1]) return [];
    return match[1]
        .split(/[,;]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}

export function canAutomateRecommendation(
    recommendation: Pick<AiRecommendation, 'title' | 'description' | 'evidence' | 'resourceReference'>,
): boolean {
    if (isCostAnomalyRecommendation(recommendation)) return false;
    if (isStoppedEc2EbsRecommendation(recommendation)) return true;
    if (isUnusedEbsRecommendation(recommendation)) return true;
    if (isRequiredTagsRecommendation(recommendation)) return true;

    const policy = recommendation.title.replace(/^Governance:\s*/i, '').trim().toLowerCase();
    const description = recommendation.description.toLowerCase();
    const ref = asRecord(recommendation.resourceReference);
    const resourceType = String(ref.resourceType ?? '').toLowerCase();
    const isS3 =
        resourceType.includes('s3') ||
        policy.includes('s3 bucket') ||
        description.includes('s3 bucket');

    if (!isS3) return false;

    return (
        policy.includes('server-side encryption') ||
        policy.includes('encryption enabled') ||
        description.includes('server-side encryption') ||
        policy.includes('publicly accessible') ||
        policy.includes('public access') ||
        description.includes('block public access') ||
        description.includes('publicly accessible') ||
        policy.includes('versioning') ||
        description.includes('versioning')
    );
}

export function regionFromAvailabilityZone(availabilityZone: string | null | undefined): string | null {
    if (!availabilityZone || availabilityZone.length < 2) return null;
    // us-east-1a → us-east-1
    return availabilityZone.slice(0, -1);
}
