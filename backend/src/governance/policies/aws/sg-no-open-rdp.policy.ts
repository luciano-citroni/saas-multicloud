import { Injectable } from '@nestjs/common';

import { AwsSecurityGroup, SecurityGroupRule } from '../../../db/entites/aws-security-group.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

const RDP_PORT = 3389;
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
export class SgNoOpenRdpPolicy implements GovernancePolicy {
    readonly id = 'aws-sg-no-open-rdp';
    readonly name = 'Security Group Must Not Allow RDP From Any IP';
    readonly description = `Security groups should not allow RDP (port ${RDP_PORT}) access from 0.0.0.0/0 or ::/0.`;
    readonly resourceType = 'SecurityGroup';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'aws';

    evaluate(sg: AwsSecurityGroup, _context: PolicyContext): PolicyEvaluationResult[] {
        const openRdpRules = (sg.inboundRules ?? []).filter(
            (rule) => ruleAllowsPort(rule, RDP_PORT) && ruleIsOpenToInternet(rule),
        );

        if (openRdpRules.length > 0) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: sg.awsSecurityGroupId,
                    resourceType: this.resourceType,
                    description: `Security Group "${sg.name}" (${sg.awsSecurityGroupId}) allows RDP (port ${RDP_PORT}) access from any IP address (0.0.0.0/0 or ::/0).`,
                    recommendation:
                        'Restrict RDP access to specific trusted CIDR ranges (e.g., your corporate VPN IP) instead of allowing 0.0.0.0/0. Consider using AWS Systems Manager Session Manager as a VPN-free alternative.',
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
                description: `Security Group "${sg.name}" does not allow unrestricted RDP (port ${RDP_PORT}) access.`,
                recommendation: '',
            },
        ];
    }
}
