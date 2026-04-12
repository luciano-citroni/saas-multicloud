import { Injectable } from '@nestjs/common';

import { GcpGkeCluster } from '../../../db/entites/gcp-gke-cluster.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** GCP managed logging service URL for GKE. */
const MANAGED_LOGGING_SERVICE = 'logging.googleapis.com/kubernetes';

@Injectable()
export class GcpGkeLoggingDisabledPolicy implements GovernancePolicy {
    readonly id = 'gcp-gke-logging-disabled';
    readonly name = 'GCP GKE Cluster Must Have Logging Enabled';
    readonly description =
        'GKE clusters should have Cloud Logging enabled to capture system and workload logs for security monitoring, auditing, and incident response.';
    readonly resourceType = 'GcpGkeCluster';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'gcp';

    evaluate(cluster: GcpGkeCluster, _context: PolicyContext): PolicyEvaluationResult[] {
        const loggingService = cluster.loggingService ?? '';
        const hasLogging = loggingService === MANAGED_LOGGING_SERVICE || loggingService.startsWith('logging.googleapis.com');

        if (!hasLogging) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: cluster.name,
                    resourceType: this.resourceType,
                    description: `GKE cluster "${cluster.name}" has logging disabled or set to "${loggingService || 'none'}". Security events and system logs will not be captured.`,
                    recommendation:
                        'Enable Cloud Logging on the GKE cluster by setting loggingService to "logging.googleapis.com/kubernetes". This enables collection of system and workload logs for security and operational monitoring.',
                    metadata: {
                        clusterName: cluster.name,
                        location: cluster.location,
                        loggingService: loggingService || 'none',
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
                description: `GKE cluster "${cluster.name}" has Cloud Logging enabled.`,
                recommendation: '',
            },
        ];
    }
}
