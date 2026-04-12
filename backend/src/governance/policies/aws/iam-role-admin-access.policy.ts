import { Injectable } from '@nestjs/common';

import { AwsIamRole } from '../../../db/entites/aws-iam-role.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** AWS managed policy ARNs that grant full administrative access. */
const ADMIN_POLICY_ARNS = new Set([
    'arn:aws:iam::aws:policy/AdministratorAccess',
]);

/** Policy names considered overly permissive. */
const ADMIN_POLICY_NAMES = new Set([
    'AdministratorAccess',
]);

@Injectable()
export class IamRoleAdminAccessPolicy implements GovernancePolicy {
    readonly id = 'aws-iam-role-admin-access';
    readonly name = 'IAM Role Must Not Have Unrestricted Administrator Access';
    readonly description =
        'IAM roles should not be granted unrestricted administrative access (AdministratorAccess policy or equivalent). Roles must follow the principle of least privilege.';
    readonly resourceType = 'IAMRole';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'aws';
    readonly category = 'identity' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'PCI_DSS_3_2_1', 'SOC2', 'NIST_800_53', 'ISO_27001'] as const;

    evaluate(role: AwsIamRole, _context: PolicyContext): PolicyEvaluationResult[] {
        // Skip AWS service-linked roles (path starts with /aws-service-role/)
        if (role.path.startsWith('/aws-service-role/')) {
            return [
                {
                    status: 'compliant',
                    resourceId: role.roleArn,
                    resourceType: this.resourceType,
                    description: `IAM role "${role.roleName}" is an AWS service-linked role — admin check not applicable.`,
                    recommendation: '',
                },
            ];
        }

        const attachedPolicies = role.attachedPolicies ?? [];
        const adminPolicies = attachedPolicies.filter(
            (p) => ADMIN_POLICY_ARNS.has(p.policyArn) || ADMIN_POLICY_NAMES.has(p.policyName)
        );

        if (adminPolicies.length > 0) {
            const policyList = adminPolicies.map((p) => p.policyName).join(', ');
            return [
                {
                    status: 'non_compliant',
                    resourceId: role.roleArn,
                    resourceType: this.resourceType,
                    description: `IAM role "${role.roleName}" has administrator-level access via policy: ${policyList}. This violates the principle of least privilege.`,
                    recommendation:
                        'Replace the AdministratorAccess policy with a custom policy that grants only the permissions actually required by this role. Review and restrict attached policies to follow the least-privilege principle.',
                    metadata: {
                        roleName: role.roleName,
                        roleArn: role.roleArn,
                        adminPolicies,
                        allAttachedPolicies: attachedPolicies.map((p) => p.policyName),
                        maxSessionDuration: role.maxSessionDuration,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: role.roleArn,
                resourceType: this.resourceType,
                description: `IAM role "${role.roleName}" does not have unrestricted administrator access.`,
                recommendation: '',
            },
        ];
    }
}
