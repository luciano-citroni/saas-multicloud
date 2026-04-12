import { Injectable } from '@nestjs/common';

import { GcpVmInstance } from '../../../db/entites/gcp-vm-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class GcpVmPublicIpPolicy implements GovernancePolicy {
    readonly id = 'gcp-vm-public-ip';
    readonly name = 'GCP VM Instance Should Not Have a Public External IP';
    readonly description =
        'Compute Engine VM instances should not be directly reachable from the internet via a public external IP address. Use Cloud NAT or a load balancer for egress/ingress.';
    readonly resourceType = 'GcpVmInstance';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'gcp';

    evaluate(instance: GcpVmInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        if (instance.externalIp) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.name,
                    resourceType: this.resourceType,
                    description: `VM instance "${instance.name}" has a public external IP address (${instance.externalIp}), making it directly reachable from the internet.`,
                    recommendation:
                        'Remove the external IP from the VM instance and use Cloud NAT for outbound internet access. For inbound traffic, use a Load Balancer or Identity-Aware Proxy instead of direct public IPs.',
                    metadata: {
                        instanceName: instance.name,
                        externalIp: instance.externalIp,
                        zone: instance.zone,
                        machineType: instance.machineType,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.name,
                resourceType: this.resourceType,
                description: `VM instance "${instance.name}" does not have a public external IP address.`,
                recommendation: '',
            },
        ];
    }
}
