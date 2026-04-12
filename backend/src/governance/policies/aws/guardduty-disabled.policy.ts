import { Injectable } from '@nestjs/common';

import { AwsGuardDutyDetector } from '../../../db/entites/aws-guardduty-detector.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class GuardDutyDisabledPolicy implements GovernancePolicy {
    readonly id = 'aws-guardduty-disabled';
    readonly name = 'AWS GuardDuty Must Be Enabled';
    readonly description =
        'Amazon GuardDuty should be enabled in all AWS regions. GuardDuty continuously monitors for malicious activity and unauthorized behavior using machine learning, anomaly detection, and threat intelligence.';
    readonly resourceType = 'GuardDutyDetector';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'aws';
    readonly category = 'monitoring' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'SOC2', 'NIST_800_53', 'ISO_27001'] as const;

    evaluate(detector: AwsGuardDutyDetector, _context: PolicyContext): PolicyEvaluationResult[] {
        if (detector.status !== 'ENABLED') {
            return [
                {
                    status: 'non_compliant',
                    resourceId: detector.detectorId,
                    resourceType: this.resourceType,
                    description: `GuardDuty detector "${detector.detectorId}" is not enabled (status: ${detector.status ?? 'unknown'}). Threat detection is inactive for this account/region.`,
                    recommendation:
                        'Enable Amazon GuardDuty in this AWS account and region. GuardDuty should be active in all regions where you have workloads. It provides threat intelligence and anomaly detection with no agents to install.',
                    metadata: {
                        detectorId: detector.detectorId,
                        status: detector.status,
                        findingsCount: detector.findingsCount,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: detector.detectorId,
                resourceType: this.resourceType,
                description: `GuardDuty detector "${detector.detectorId}" is enabled and actively monitoring for threats.`,
                recommendation: '',
            },
        ];
    }
}
