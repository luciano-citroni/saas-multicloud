import { Injectable } from '@nestjs/common';

import { AwsEksCluster } from '../../../db/entites/aws-eks-cluster.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

const OPEN_CIDR = '0.0.0.0/0';

@Injectable()
export class EksPublicEndpointUnrestrictedPolicy implements GovernancePolicy {
    readonly id = 'aws-eks-public-endpoint-unrestricted';
    readonly name = 'EKS Cluster Public API Endpoint Must Be Restricted';
    readonly description =
        'EKS clusters with a public API server endpoint should restrict access to specific CIDR ranges. An unrestricted public endpoint (0.0.0.0/0) exposes the Kubernetes API to the entire internet.';
    readonly resourceType = 'EKSCluster';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'aws';
    readonly category = 'network' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'SOC2', 'NIST_800_53'] as const;

    evaluate(cluster: AwsEksCluster, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!cluster.endpointPublicAccess) {
            return [
                {
                    status: 'compliant',
                    resourceId: cluster.clusterArn,
                    resourceType: this.resourceType,
                    description: `EKS cluster "${cluster.clusterName}" has public API endpoint disabled — only private access is allowed.`,
                    recommendation: '',
                },
            ];
        }

        const cidrs = cluster.publicAccessCidrs ?? [];
        const isUnrestricted = cidrs.length === 0 || cidrs.includes(OPEN_CIDR);

        if (isUnrestricted) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: cluster.clusterArn,
                    resourceType: this.resourceType,
                    description: `EKS cluster "${cluster.clusterName}" has a public API endpoint with unrestricted access (${OPEN_CIDR}). The Kubernetes API server is accessible from any IP on the internet.`,
                    recommendation:
                        'Restrict the EKS public endpoint access to specific CIDR ranges (e.g., your corporate VPN CIDR). Alternatively, disable public access entirely and use private endpoint access with VPN or Direct Connect.',
                    metadata: {
                        clusterName: cluster.clusterName,
                        clusterArn: cluster.clusterArn,
                        publicAccessCidrs: cidrs,
                        endpointPrivateAccess: cluster.endpointPrivateAccess,
                        version: cluster.version,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: cluster.clusterArn,
                resourceType: this.resourceType,
                description: `EKS cluster "${cluster.clusterName}" public endpoint is restricted to: ${cidrs.join(', ')}.`,
                recommendation: '',
            },
        ];
    }
}
