import { Injectable } from '@nestjs/common';

import { GcpFirewallRule } from '../../../db/entites/gcp-firewall-rule.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

const OPEN_CIDR_V4 = '0.0.0.0/0';
const OPEN_CIDR_V6 = '::/0';

const DATABASE_PORTS: Record<number, string> = {
    3306: 'MySQL',
    5432: 'PostgreSQL',
    1433: 'SQL Server',
    1521: 'Oracle',
    27017: 'MongoDB',
    6379: 'Redis',
    5984: 'CouchDB',
    9200: 'Elasticsearch',
};

function ruleAllowsPort(allowed: Record<string, any>, port: number): boolean {
    const protocol: string = allowed['IPProtocol'] ?? '';
    if (protocol === 'all') return true;
    if (protocol !== 'tcp' && protocol !== 'udp') return false;

    const ports: string[] = allowed['ports'] ?? [];
    if (ports.length === 0) return true;

    return ports.some((p) => {
        if (p.includes('-')) {
            const [from, to] = p.split('-').map(Number);
            return from <= port && port <= to;
        }
        return Number(p) === port;
    });
}

function isOpenToInternet(sourceRanges: string[] | null): boolean {
    if (!sourceRanges || sourceRanges.length === 0) return false;
    return sourceRanges.includes(OPEN_CIDR_V4) || sourceRanges.includes(OPEN_CIDR_V6);
}

@Injectable()
export class GcpFirewallOpenDatabasePortsPolicy implements GovernancePolicy {
    readonly id = 'gcp-firewall-open-database-ports';
    readonly name = 'GCP Firewall Rule Must Not Expose Database Ports to the Internet';
    readonly description =
        'GCP firewall rules should not allow ingress access to common database ports (MySQL, PostgreSQL, SQL Server, Oracle, MongoDB, Redis, etc.) from 0.0.0.0/0 or ::/0.';
    readonly resourceType = 'GcpFirewallRule';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'gcp';

    evaluate(rule: GcpFirewallRule, _context: PolicyContext): PolicyEvaluationResult[] {
        if (rule.disabled || rule.direction !== 'INGRESS') {
            return [
                {
                    status: 'compliant',
                    resourceId: rule.name,
                    resourceType: this.resourceType,
                    description: `Firewall rule "${rule.name}" is disabled or is an egress rule — database port check not applicable.`,
                    recommendation: '',
                },
            ];
        }

        if (!isOpenToInternet(rule.sourceRanges)) {
            return [
                {
                    status: 'compliant',
                    resourceId: rule.name,
                    resourceType: this.resourceType,
                    description: `Firewall rule "${rule.name}" does not expose database ports to the internet.`,
                    recommendation: '',
                },
            ];
        }

        const allowedRules: Record<string, any>[] = rule.allowed ?? [];
        const exposedPorts: Array<{ port: number; service: string }> = [];

        for (const [portStr, serviceName] of Object.entries(DATABASE_PORTS)) {
            const port = Number(portStr);
            if (allowedRules.some((a) => ruleAllowsPort(a, port))) {
                exposedPorts.push({ port, service: serviceName });
            }
        }

        if (exposedPorts.length > 0) {
            const portList = exposedPorts.map((p) => `${p.port} (${p.service})`).join(', ');
            return [
                {
                    status: 'non_compliant',
                    resourceId: rule.name,
                    resourceType: this.resourceType,
                    description: `Firewall rule "${rule.name}" exposes database port(s) [${portList}] to the internet (0.0.0.0/0 or ::/0).`,
                    recommendation:
                        'Restrict database port access to specific trusted CIDR ranges or use Cloud SQL Auth Proxy / VPC peering instead of exposing ports publicly. Remove or restrict this firewall rule immediately.',
                    metadata: {
                        firewallName: rule.name,
                        networkName: rule.networkName,
                        exposedPorts,
                        sourceRanges: rule.sourceRanges,
                        priority: rule.priority,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: rule.name,
                resourceType: this.resourceType,
                description: `Firewall rule "${rule.name}" does not expose database ports to the internet.`,
                recommendation: '',
            },
        ];
    }
}
