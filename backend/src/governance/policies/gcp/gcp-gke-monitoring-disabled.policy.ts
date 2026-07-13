import { Injectable } from '@nestjs/common';

import { GcpGkeCluster } from '../../../db/entites/gcp-gke-cluster.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class GcpGkeMonitoringDisabledPolicy implements GovernancePolicy {
    readonly id = 'gcp-gke-monitoring-disabled';
    readonly name = 'GCP GKE Cluster Must Have Monitoring Enabled';
    readonly description =
        'GKE clusters should send metrics to Cloud Monitoring to support operational visibility, threat detection, and incident response.';
    readonly resourceType = 'GcpGkeCluster';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'gcp';
    readonly category = 'monitoring' as const;
    readonly frameworks = ['CIS_GCP_2_0', 'NIST_800_53', 'SOC2'] as const;

    evaluate(cluster: GcpGkeCluster, _context: PolicyContext): PolicyEvaluationResult[] {
        const monitoringService = cluster.monitoringService ?? '';
        const hasMonitoring =
            monitoringService === 'monitoring.googleapis.com/kubernetes' || monitoringService.startsWith('monitoring.googleapis.com');

        if (!hasMonitoring) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: cluster.name,
                    resourceType: this.resourceType,
                    description: `GKE cluster "${cluster.name}" has monitoring disabled or set to "${monitoringService || 'none'}".`,
                    recommendation:
                        'Enable Cloud Monitoring on the cluster by setting monitoringService to "monitoring.googleapis.com/kubernetes".',
                    metadata: {
                        clusterName: cluster.name,
                        location: cluster.location,
                        monitoringService: monitoringService || 'none',
                        status: cluster.status,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: cluster.name,
                resourceType: this.resourceType,
                description: `GKE cluster "${cluster.name}" has Cloud Monitoring enabled.`,
                recommendation: '',
            },
        ];
    }
}
