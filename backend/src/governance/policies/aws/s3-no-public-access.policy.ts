import { Injectable } from '@nestjs/common';

import { AwsS3Bucket } from '../../../db/entites/aws-s3-bucket.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class S3NoPublicAccessPolicy implements GovernancePolicy {
    readonly id = 'aws-s3-no-public-access';
    readonly name = 'S3 Bucket Block Public Access Must Be Enabled';
    readonly description =
        'S3 buckets should have all four Block Public Access settings enabled. This checks BPA configuration — not whether objects are currently world-readable via ACL.';
    readonly resourceType = 'S3Bucket';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'aws';
    readonly category = 'storage' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'PCI_DSS_3_2_1', 'SOC2', 'NIST_800_53'] as const;

    evaluate(bucket: AwsS3Bucket, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!bucket.publicAccessBlocked) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: bucket.bucketName,
                    resourceType: this.resourceType,
                    description: `S3 bucket "${bucket.bucketName}" does not have all Block Public Access settings enabled (ACLs/policy). The bucket may still be private via ACL, but BPA is incomplete.`,
                    recommendation:
                        'Enable all four Block Public Access settings on the S3 bucket: BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets. This is independent of current object ACLs — a private bucket can still fail this control if BPA is off.',
                    metadata: {
                        bucketName: bucket.bucketName,
                        bucketArn: bucket.bucketArn,
                        region: bucket.region,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: bucket.bucketName,
                resourceType: this.resourceType,
                description: `S3 bucket "${bucket.bucketName}" has Block Public Access enabled.`,
                recommendation: '',
            },
        ];
    }
}
