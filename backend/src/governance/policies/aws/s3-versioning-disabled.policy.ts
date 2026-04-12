import { Injectable } from '@nestjs/common';

import { AwsS3Bucket } from '../../../db/entites/aws-s3-bucket.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class S3VersioningDisabledPolicy implements GovernancePolicy {
    readonly id = 'aws-s3-versioning-disabled';
    readonly name = 'S3 Bucket Should Have Versioning Enabled';
    readonly description =
        'S3 buckets used for persistent data should have versioning enabled to protect against accidental deletions and allow recovery of previous object versions.';
    readonly resourceType = 'S3Bucket';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'storage' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'NIST_800_53'] as const;

    evaluate(bucket: AwsS3Bucket, _context: PolicyContext): PolicyEvaluationResult[] {
        const versioningActive = bucket.versioningStatus === 'Enabled';

        if (!versioningActive) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: bucket.bucketName,
                    resourceType: this.resourceType,
                    description: `S3 bucket "${bucket.bucketName}" does not have versioning enabled (status: ${bucket.versioningStatus ?? 'not enabled'}). Objects cannot be recovered after accidental deletion or overwrite.`,
                    recommendation:
                        'Enable versioning on the S3 bucket to preserve and recover previous versions of every object. Consider also enabling MFA Delete for additional protection of versioned data.',
                    metadata: {
                        bucketName: bucket.bucketName,
                        region: bucket.region,
                        versioningStatus: bucket.versioningStatus ?? 'not_configured',
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: bucket.bucketName,
                resourceType: this.resourceType,
                description: `S3 bucket "${bucket.bucketName}" has versioning enabled.`,
                recommendation: '',
            },
        ];
    }
}
