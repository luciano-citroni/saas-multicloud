import { Injectable } from '@nestjs/common';

import { AwsIamRole } from '../../../db/entites/aws-iam-role.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** Maximum recommended session duration in seconds (4 hours). */
const MAX_SESSION_DURATION_HOURS = 4;
const MAX_SESSION_DURATION_SECONDS = MAX_SESSION_DURATION_HOURS * 3600;

@Injectable()
export class IamRoleLongSessionPolicy implements GovernancePolicy {
    readonly id = 'aws-iam-role-long-session';
    readonly name = `IAM Role Session Duration Should Not Exceed ${MAX_SESSION_DURATION_HOURS} Hours`;
    readonly description = `IAM roles should have a maximum session duration of at most ${MAX_SESSION_DURATION_HOURS} hours. Longer sessions increase the window of opportunity for credential misuse if a session token is compromised.`;
    readonly resourceType = 'IAMRole';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'identity' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'NIST_800_53'] as const;

    evaluate(role: AwsIamRole, _context: PolicyContext): PolicyEvaluationResult[] {
        // Skip AWS service-linked roles
        if (role.path.startsWith('/aws-service-role/')) {
            return [
                {
                    status: 'compliant',
                    resourceId: role.roleArn,
                    resourceType: this.resourceType,
                    description: `IAM role "${role.roleName}" is an AWS service-linked role — session duration check not applicable.`,
                    recommendation: '',
                },
            ];
        }

        if (role.maxSessionDuration > MAX_SESSION_DURATION_SECONDS) {
            const hours = Math.round(role.maxSessionDuration / 3600);
            return [
                {
                    status: 'non_compliant',
                    resourceId: role.roleArn,
                    resourceType: this.resourceType,
                    description: `IAM role "${role.roleName}" has a maximum session duration of ${hours} hours, exceeding the recommended ${MAX_SESSION_DURATION_HOURS} hours. Long-lived sessions increase exposure risk if credentials are stolen.`,
                    recommendation: `Reduce the maximum session duration of IAM role "${role.roleName}" to ${MAX_SESSION_DURATION_HOURS} hours (${MAX_SESSION_DURATION_SECONDS} seconds) or less. Short-lived credentials limit the blast radius of credential theft.`,
                    metadata: {
                        roleName: role.roleName,
                        roleArn: role.roleArn,
                        maxSessionDurationSeconds: role.maxSessionDuration,
                        maxSessionDurationHours: hours,
                        maximumAllowedHours: MAX_SESSION_DURATION_HOURS,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: role.roleArn,
                resourceType: this.resourceType,
                description: `IAM role "${role.roleName}" has an acceptable maximum session duration (${Math.round(role.maxSessionDuration / 3600)} hours).`,
                recommendation: '',
            },
        ];
    }
}
