import { Injectable } from '@nestjs/common';

import { GcpSqlInstance } from '../../../db/entites/gcp-sql-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** IP address type returned by the Cloud SQL API for public-facing addresses. */
const PUBLIC_IP_TYPE = 'PRIMARY';

@Injectable()
export class GcpSqlPublicIpPolicy implements GovernancePolicy {
    readonly id = 'gcp-sql-public-ip';
    readonly name = 'GCP Cloud SQL Instance Must Not Have a Public IP Address';
    readonly description =
        'Cloud SQL instances should not be assigned a public IP address. Use Private IP with VPC peering or Cloud SQL Auth Proxy for secure connectivity.';
    readonly resourceType = 'GcpSqlInstance';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'gcp';

    evaluate(instance: GcpSqlInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        const ipAddresses: Record<string, any>[] = instance.ipAddresses ?? [];
        const publicIps = ipAddresses.filter((addr) => addr['type'] === PUBLIC_IP_TYPE);

        if (publicIps.length > 0) {
            const ipList = publicIps.map((a) => a['ipAddress']).filter(Boolean).join(', ');
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.name,
                    resourceType: this.resourceType,
                    description: `Cloud SQL instance "${instance.name}" (${instance.databaseVersion}) has a public IP address (${ipList}), exposing the database to the internet.`,
                    recommendation:
                        'Disable the public IP on the Cloud SQL instance and configure a private IP within your VPC. Use Cloud SQL Auth Proxy or VPC peering for application connectivity. Ensure authorized networks are also locked down.',
                    metadata: {
                        instanceName: instance.name,
                        databaseVersion: instance.databaseVersion,
                        region: instance.region,
                        publicIps: ipList,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.name,
                resourceType: this.resourceType,
                description: `Cloud SQL instance "${instance.name}" does not have a public IP address.`,
                recommendation: '',
            },
        ];
    }
}
