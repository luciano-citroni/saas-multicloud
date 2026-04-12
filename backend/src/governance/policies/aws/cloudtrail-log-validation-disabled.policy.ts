import { Injectable } from '@nestjs/common';

import { AwsCloudTrailTrail } from '../../../db/entites/aws-cloudtrail-trail.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class CloudTrailLogValidationDisabledPolicy implements GovernancePolicy {
    readonly id = 'aws-cloudtrail-log-validation-disabled';
    readonly name = 'CloudTrail Log File Validation Must Be Enabled';
    readonly description =
        'CloudTrail trails should have log file integrity validation enabled to detect if log files were modified, deleted, or forged after delivery to S3. This is essential for forensic investigation.';
    readonly resourceType = 'CloudTrailTrail';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'aws';
    readonly category = 'logging' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'PCI_DSS_3_2_1', 'NIST_800_53'] as const;

    evaluate(trail: AwsCloudTrailTrail, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!trail.logFileValidationEnabled) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: trail.trailArn,
                    resourceType: this.resourceType,
                    description: `CloudTrail trail "${trail.name}" does not have log file integrity validation enabled. Log files may be tampered with without detection.`,
                    recommendation:
                        'Enable CloudTrail log file integrity validation. This creates a digest file for each log delivery that can be used to verify that logs have not been tampered with. Required by CIS AWS Foundations Benchmark 2.2.',
                    metadata: {
                        trailName: trail.name,
                        trailArn: trail.trailArn,
                        homeRegion: trail.homeRegion,
                        isMultiRegion: trail.isMultiRegionTrail,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: trail.trailArn,
                resourceType: this.resourceType,
                description: `CloudTrail trail "${trail.name}" has log file integrity validation enabled.`,
                recommendation: '',
            },
        ];
    }
}
