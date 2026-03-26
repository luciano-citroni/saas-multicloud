import { Injectable } from '@nestjs/common';

import { AwsS3Bucket } from '../../../db/entites/aws-s3-bucket.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class S3EncryptionEnabledPolicy implements GovernancePolicy {
    readonly id = 'aws-s3-encryption-enabled';
    readonly name = 'S3 Bucket Must Have Server-Side Encryption Enabled';
    readonly description = 'S3 buckets should have server-side encryption (SSE-S3 or SSE-KMS) enabled to protect data at rest.';
    readonly resourceType = 'S3Bucket';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'aws';

    evaluate(bucket: AwsS3Bucket, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!bucket.encryptionEnabled) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: bucket.bucketName,
                    resourceType: this.resourceType,
                    description: `S3 bucket "${bucket.bucketName}" does not have server-side encryption enabled.`,
                    recommendation:
                        'Enable server-side encryption on the S3 bucket. Use SSE-KMS (aws:kms) for stronger key management or SSE-S3 (AES256) as a minimum baseline.',
                    metadata: {
                        bucketName: bucket.bucketName,
                        region: bucket.region,
                        encryptionType: bucket.encryptionType,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: bucket.bucketName,
                resourceType: this.resourceType,
                description: `S3 bucket "${bucket.bucketName}" has server-side encryption enabled (${bucket.encryptionType ?? 'unknown type'}).`,
                recommendation: '',
            },
        ];
    }
}
