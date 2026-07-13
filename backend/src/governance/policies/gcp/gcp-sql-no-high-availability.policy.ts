import { Injectable } from '@nestjs/common';

import { GcpSqlInstance } from '../../../db/entites/gcp-sql-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

const HIGH_AVAILABILITY = 'HIGH_AVAILABILITY';

@Injectable()
export class GcpSqlNoHighAvailabilityPolicy implements GovernancePolicy {
    readonly id = 'gcp-sql-no-high-availability';
    readonly name = 'GCP Cloud SQL Instance Should Use High Availability';
    readonly description =
        'Production-grade Cloud SQL instances should use HIGH_AVAILABILITY to improve resilience and reduce downtime during failures or maintenance.';
    readonly resourceType = 'GcpSqlInstance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'gcp';
    readonly category = 'compute' as const;
    readonly frameworks = ['CIS_GCP_2_0', 'ISO_27001', 'SOC2'] as const;

    evaluate(instance: GcpSqlInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        const availabilityType = instance.availabilityType ?? 'ZONAL';
        const hasHa = availabilityType === HIGH_AVAILABILITY;

        if (!hasHa) {
            return [
                {
                    status: 'warning',
                    resourceId: instance.name,
                    resourceType: this.resourceType,
                    description: `Cloud SQL instance "${instance.name}" is configured as "${availabilityType}" and does not use HIGH_AVAILABILITY.`,
                    recommendation:
                        'For critical workloads, migrate the instance to HIGH_AVAILABILITY and validate failover procedures to minimize downtime risk.',
                    metadata: {
                        instanceName: instance.name,
                        databaseVersion: instance.databaseVersion,
                        region: instance.region,
                        availabilityType,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.name,
                resourceType: this.resourceType,
                description: `Cloud SQL instance "${instance.name}" uses HIGH_AVAILABILITY.`,
                recommendation: '',
            },
        ];
    }
}
