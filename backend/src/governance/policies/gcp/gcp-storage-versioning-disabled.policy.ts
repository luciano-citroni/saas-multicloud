import { Injectable } from '@nestjs/common';

import { GcpStorageBucket } from '../../../db/entites/gcp-storage-bucket.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class GcpStorageVersioningDisabledPolicy implements GovernancePolicy {
    readonly id = 'gcp-storage-versioning-disabled';
    readonly name = 'GCP Storage Bucket Should Have Versioning Enabled';
    readonly description =
        'Cloud Storage buckets used for persistent data should have Object Versioning enabled to protect against accidental deletion or overwrites.';
    readonly resourceType = 'GcpStorageBucket';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'gcp';

    evaluate(bucket: GcpStorageBucket, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!bucket.versioningEnabled) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: bucket.name,
                    resourceType: this.resourceType,
                    description: `Cloud Storage bucket "${bucket.name}" does not have Object Versioning enabled. Accidental deletions or overwrites cannot be recovered.`,
                    recommendation:
                        'Enable Object Versioning on the bucket to preserve previous versions of objects and allow recovery from accidental changes.',
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
                description: `Cloud Storage bucket "${bucket.name}" has Object Versioning enabled.`,
                recommendation: '',
            },
        ];
    }
}
