import { Injectable } from '@nestjs/common';

import { AwsSecurityGroup, SecurityGroupRule } from '../../../db/entites/aws-security-group.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

const SSH_PORT = 22;
const OPEN_CIDR_V4 = '0.0.0.0/0';
const OPEN_CIDR_V6 = '::/0';

function ruleAllowsPort(rule: SecurityGroupRule, port: number): boolean {
    if (rule.protocol === '-1') return true;
    if (rule.fromPort === null || rule.toPort === null) return false;
    return rule.fromPort <= port && rule.toPort >= port;
}

function ruleIsOpenToInternet(rule: SecurityGroupRule): boolean {
    return rule.ipv4Ranges.some((r) => r.cidr === OPEN_CIDR_V4) || rule.ipv6Ranges.some((r) => r.cidr === OPEN_CIDR_V6);
}

@Injectable()
export class SgNoOpenSshPolicy implements GovernancePolicy {
    readonly id = 'aws-sg-no-open-ssh';
    readonly name = 'Security Group Must Not Allow SSH From Any IP';
    readonly description = `Security groups should not allow SSH (port ${SSH_PORT}) access from 0.0.0.0/0 or ::/0.`;
    readonly resourceType = 'SecurityGroup';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'aws';

    evaluate(sg: AwsSecurityGroup, _context: PolicyContext): PolicyEvaluationResult[] {
        const openSshRules = (sg.inboundRules ?? []).filter(
            (rule) => ruleAllowsPort(rule, SSH_PORT) && ruleIsOpenToInternet(rule),
        );

        if (openSshRules.length > 0) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: sg.awsSecurityGroupId,
                    resourceType: this.resourceType,
                    description: `Security Group "${sg.name}" (${sg.awsSecurityGroupId}) allows SSH (port ${SSH_PORT}) access from any IP address (0.0.0.0/0 or ::/0).`,
                    recommendation:
                        'Restrict SSH access to specific trusted CIDR ranges (e.g., your corporate VPN IP or bastion host IP) instead of allowing 0.0.0.0/0.',
                    metadata: {
                        securityGroupId: sg.awsSecurityGroupId,
                        name: sg.name,
                        vpcId: sg.awsVpcId,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: sg.awsSecurityGroupId,
                resourceType: this.resourceType,
                description: `Security Group "${sg.name}" does not allow unrestricted SSH (port ${SSH_PORT}) access.`,
                recommendation: '',
            },
        ];
    }
}
