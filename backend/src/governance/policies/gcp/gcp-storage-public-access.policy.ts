import { Injectable } from '@nestjs/common';

import { GcpStorageBucket } from '../../../db/entites/gcp-storage-bucket.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class GcpStoragePublicAccessPolicy implements GovernancePolicy {
    readonly id = 'gcp-storage-public-access';
    readonly name = 'GCP Storage Bucket Must Not Be Publicly Accessible';
    readonly description =
        'Cloud Storage buckets should have Public Access Prevention set to "enforced" to prevent unintended public exposure of data.';
    readonly resourceType = 'GcpStorageBucket';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'gcp';

    evaluate(bucket: GcpStorageBucket, _context: PolicyContext): PolicyEvaluationResult[] {
        const isEnforced = bucket.publicAccessPrevention === 'enforced';

        if (!isEnforced) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: bucket.name,
                    resourceType: this.resourceType,
                    description: `Cloud Storage bucket "${bucket.name}" has Public Access Prevention set to "${bucket.publicAccessPrevention ?? 'inherited'}" and may be publicly accessible.`,
                    recommendation:
                        'Set Public Access Prevention to "enforced" on the bucket to block all public access regardless of IAM policies or ACLs.',
                    metadata: {
                        bucketName: bucket.name,
                        location: bucket.location,
                        publicAccessPrevention: bucket.publicAccessPrevention ?? 'inherited',
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: bucket.name,
                resourceType: this.resourceType,
                description: `Cloud Storage bucket "${bucket.name}" has Public Access Prevention enforced.`,
                recommendation: '',
            },
        ];
    }
}
