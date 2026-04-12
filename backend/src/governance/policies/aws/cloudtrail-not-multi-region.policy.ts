import { Injectable } from '@nestjs/common';

import { AwsCloudTrailTrail } from '../../../db/entites/aws-cloudtrail-trail.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class CloudTrailNotMultiRegionPolicy implements GovernancePolicy {
    readonly id = 'aws-cloudtrail-not-multi-region';
    readonly name = 'CloudTrail Trail Should Be a Multi-Region Trail';
    readonly description =
        'CloudTrail should be configured as a multi-region trail to ensure that API activity across all AWS regions is captured in the audit log. Single-region trails miss activity in other regions.';
    readonly resourceType = 'CloudTrailTrail';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'aws';
    readonly category = 'logging' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'SOC2', 'NIST_800_53'] as const;

    evaluate(trail: AwsCloudTrailTrail, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!trail.isMultiRegionTrail) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: trail.trailArn,
                    resourceType: this.resourceType,
                    description: `CloudTrail trail "${trail.name}" is a single-region trail (home region: ${trail.homeRegion ?? 'unknown'}). API activity in other AWS regions will not be logged.`,
                    recommendation:
                        'Configure the CloudTrail trail as a multi-region trail to capture API events across all AWS regions. This ensures comprehensive audit coverage and is required by CIS AWS Foundations Benchmark.',
                    metadata: {
                        trailName: trail.name,
                        trailArn: trail.trailArn,
                        homeRegion: trail.homeRegion,
                        isLogging: trail.isLogging,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: trail.trailArn,
                resourceType: this.resourceType,
                description: `CloudTrail trail "${trail.name}" is configured as a multi-region trail.`,
                recommendation: '',
            },
        ];
    }
}
