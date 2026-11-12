import { Injectable } from '@nestjs/common';
import { GcpStorageBucket } from '../../../db/entites/gcp-storage-bucket.entity';
import {
    evaluateRequiredTagsFinding,
    resolveApplicableRequiredTags,
} from '../org-knowledge-policy.helpers';
import {
    FindingSeverity,
    GovernancePolicy,
    PolicyContext,
    PolicyEvaluationResult,
} from '../policy.interface';

@Injectable()
export class GcpStorageRequiredLabelsPolicy implements GovernancePolicy {
    readonly id = 'gcp-storage-required-labels';
    readonly name = 'GCP Storage Bucket Must Have Required Labels';
    readonly description =
        'Cloud Storage buckets must have organization-required labels from the knowledge base when configured.';
    readonly resourceType = 'GcpStorageBucket';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'gcp';
    readonly category = 'storage' as const;
    readonly frameworks = ['CIS_GCP_2_0', 'SOC2'] as const;

    evaluate(bucket: GcpStorageBucket, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'gcp', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: bucket.name,
                resourceType: this.resourceType,
                resourceLabel: `Storage bucket "${bucket.name}"`,
                tags: bucket.labels,
                requiredTags,
                extraMetadata: { requiredLabels: requiredTags },
            }),
        ];
    }
}
