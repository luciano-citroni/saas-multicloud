import { Injectable } from '@nestjs/common';

import { GcpStorageBucket } from '../../../db/entites/gcp-storage-bucket.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class GcpStorageUniformAccessPolicy implements GovernancePolicy {
    readonly id = 'gcp-storage-uniform-access';
    readonly name = 'GCP Storage Bucket Must Use Uniform Bucket-Level Access';
    readonly description =
        'Cloud Storage buckets should have Uniform Bucket-Level Access enabled to enforce consistent IAM-based access control and prevent ACL-based permission grants.';
    readonly resourceType = 'GcpStorageBucket';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'gcp';

    evaluate(bucket: GcpStorageBucket, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!bucket.uniformBucketLevelAccess) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: bucket.name,
                    resourceType: this.resourceType,
                    description: `Cloud Storage bucket "${bucket.name}" does not have Uniform Bucket-Level Access enabled, allowing per-object ACL grants that may bypass IAM policies.`,
                    recommendation:
                        'Enable Uniform Bucket-Level Access on the bucket to disable object-level ACLs and enforce IAM-only access control.',
                    metadata: {
                        bucketName: bucket.name,
                        location: bucket.location,
                        storageClass: bucket.storageClass,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: bucket.name,
                resourceType: this.resourceType,
                description: `Cloud Storage bucket "${bucket.name}" has Uniform Bucket-Level Access enabled.`,
                recommendation: '',
            },
        ];
    }
}
