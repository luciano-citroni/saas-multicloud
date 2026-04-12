import { Injectable } from '@nestjs/common';

import { AwsS3Bucket } from '../../../db/entites/aws-s3-bucket.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class S3LoggingDisabledPolicy implements GovernancePolicy {
    readonly id = 'aws-s3-logging-disabled';
    readonly name = 'S3 Bucket Should Have Server Access Logging Enabled';
    readonly description =
        'S3 buckets should have server access logging enabled to capture detailed records of requests made to the bucket, supporting security audits and incident investigations.';
    readonly resourceType = 'S3Bucket';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'logging' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'SOC2', 'NIST_800_53'] as const;

    evaluate(bucket: AwsS3Bucket, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!bucket.loggingEnabled) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: bucket.bucketName,
                    resourceType: this.resourceType,
                    description: `S3 bucket "${bucket.bucketName}" does not have server access logging enabled. Access requests are not being recorded.`,
                    recommendation:
                        'Enable S3 server access logging on the bucket and configure a target logging bucket. This provides an audit trail of all requests for security analysis and compliance.',
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
                description: `S3 bucket "${bucket.bucketName}" has server access logging enabled (target: ${bucket.loggingTargetBucket ?? 'configured'}).`,
                recommendation: '',
            },
        ];
    }
}
