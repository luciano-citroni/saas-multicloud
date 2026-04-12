import { Injectable } from '@nestjs/common';

import { AwsCloudTrailTrail } from '../../../db/entites/aws-cloudtrail-trail.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class CloudTrailEnabledPolicy implements GovernancePolicy {
    readonly id = 'aws-cloudtrail-enabled';
    readonly name = 'CloudTrail Trail Must Be Actively Logging';
    readonly description = 'CloudTrail trails should be enabled and actively logging API calls to ensure a complete audit trail of all AWS activity.';
    readonly resourceType = 'CloudTrailTrail';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'aws';
    readonly category = 'logging' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'SOC2', 'NIST_800_53', 'ISO_27001'] as const;

    evaluate(trail: AwsCloudTrailTrail, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!trail.isLogging) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: trail.trailArn,
                    resourceType: this.resourceType,
                    description: `CloudTrail trail "${trail.name}" is not actively logging. API calls are not being audited.`,
                    recommendation:
                        'Enable logging on the CloudTrail trail via the AWS Console or CLI: aws cloudtrail start-logging --name <trail-name>. Consider enabling multi-region logging and log file validation.',
                    metadata: {
                        trailName: trail.name,
                        trailArn: trail.trailArn,
                        homeRegion: trail.homeRegion,
                        isMultiRegion: trail.isMultiRegionTrail,
                        logFileValidationEnabled: trail.logFileValidationEnabled,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: trail.trailArn,
                resourceType: this.resourceType,
                description: `CloudTrail trail "${trail.name}" is actively logging${trail.isMultiRegionTrail ? ' (multi-region)' : ''}.`,
                recommendation: '',
            },
        ];
    }
}
