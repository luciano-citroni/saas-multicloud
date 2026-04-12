import { Injectable } from '@nestjs/common';

import { GcpFirewallRule } from '../../../db/entites/gcp-firewall-rule.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

const RDP_PORT = 3389;
const OPEN_CIDR_V4 = '0.0.0.0/0';
const OPEN_CIDR_V6 = '::/0';

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
export class GcpFirewallOpenRdpPolicy implements GovernancePolicy {
    readonly id = 'gcp-firewall-open-rdp';
    readonly name = 'GCP Firewall Rule Must Not Allow RDP From Any IP';
    readonly description = `GCP firewall rules should not allow RDP (port ${RDP_PORT}) ingress access from 0.0.0.0/0 or ::/0.`;
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
                    description: `Firewall rule "${rule.name}" is disabled or is an egress rule — RDP check not applicable.`,
                    recommendation: '',
                },
            ];
        }

        const allowedRules: Record<string, any>[] = rule.allowed ?? [];
        const opensRdp = allowedRules.some((a) => ruleAllowsPort(a, RDP_PORT)) && isOpenToInternet(rule.sourceRanges);

        if (opensRdp) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: rule.name,
                    resourceType: this.resourceType,
                    description: `Firewall rule "${rule.name}" allows RDP (port ${RDP_PORT}) ingress from any IP address (0.0.0.0/0 or ::/0).`,
                    recommendation:
                        'Restrict RDP access to specific trusted CIDR ranges or use Identity-Aware Proxy (IAP) for TCP forwarding instead of exposing RDP publicly.',
                    metadata: {
                        firewallName: rule.name,
                        networkName: rule.networkName,
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
                description: `Firewall rule "${rule.name}" does not allow unrestricted RDP (port ${RDP_PORT}) ingress.`,
                recommendation: '',
            },
        ];
    }
}
