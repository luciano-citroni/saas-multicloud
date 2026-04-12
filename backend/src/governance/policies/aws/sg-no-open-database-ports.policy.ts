import { Injectable } from '@nestjs/common';

import { AwsSecurityGroup, SecurityGroupRule } from '../../../db/entites/aws-security-group.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

const OPEN_CIDR_V4 = '0.0.0.0/0';
const OPEN_CIDR_V6 = '::/0';

const DATABASE_PORTS: Array<{ port: number; service: string }> = [
    { port: 3306, service: 'MySQL/MariaDB' },
    { port: 5432, service: 'PostgreSQL' },
    { port: 1433, service: 'SQL Server' },
    { port: 1521, service: 'Oracle' },
    { port: 27017, service: 'MongoDB' },
    { port: 6379, service: 'Redis' },
];

function ruleAllowsPort(rule: SecurityGroupRule, port: number): boolean {
    if (rule.protocol === '-1') return true;
    if (rule.protocol?.toLowerCase() !== 'tcp') return false;
    if (rule.fromPort === null || rule.toPort === null) return false;
    return rule.fromPort <= port && rule.toPort >= port;
}

function ruleIsOpenToInternet(rule: SecurityGroupRule): boolean {
    return rule.ipv4Ranges.some((r) => r.cidr === OPEN_CIDR_V4) || rule.ipv6Ranges.some((r) => r.cidr === OPEN_CIDR_V6);
}

@Injectable()
export class SgNoOpenDatabasePortsPolicy implements GovernancePolicy {
    readonly id = 'aws-sg-no-open-database-ports';
    readonly name = 'Security Group Must Not Expose Database Ports Publicly';
    readonly description = 'Security groups should not allow public internet access (0.0.0.0/0 or ::/0) to common database ports.';
    readonly resourceType = 'SecurityGroup';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'aws';
    readonly category = 'network' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'PCI_DSS_3_2_1', 'NIST_800_53'] as const;

    evaluate(sg: AwsSecurityGroup, _context: PolicyContext): PolicyEvaluationResult[] {
        const matchedPorts = DATABASE_PORTS.filter(({ port }) =>
            (sg.inboundRules ?? []).some((rule) => ruleAllowsPort(rule, port) && ruleIsOpenToInternet(rule))
        );

        if (matchedPorts.length > 0) {
            const portSummary = matchedPorts.map((p) => `${p.service} (${p.port})`).join(', ');

            return [
                {
                    status: 'non_compliant',
                    resourceId: sg.awsSecurityGroupId,
                    resourceType: this.resourceType,
                    description: `Security Group "${sg.name}" (${sg.awsSecurityGroupId}) allows public access to database ports: ${portSummary}.`,
                    recommendation:
                        'Restrict inbound database ports to private CIDRs, application subnets, or trusted security groups. Never allow 0.0.0.0/0 or ::/0 for database connectivity.',
                    metadata: {
                        securityGroupId: sg.awsSecurityGroupId,
                        name: sg.name,
                        vpcId: sg.awsVpcId,
                        exposedDatabasePorts: matchedPorts,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: sg.awsSecurityGroupId,
                resourceType: this.resourceType,
                description: `Security Group "${sg.name}" does not expose common database ports publicly.`,
                recommendation: '',
            },
        ];
    }
}
