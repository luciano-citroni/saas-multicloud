import { Injectable } from '@nestjs/common';

import { GcpVmInstance } from '../../../db/entites/gcp-vm-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** Labels required on every GCP VM instance for cost allocation and governance. */
const REQUIRED_LABELS = ['env', 'environment'];

@Injectable()
export class GcpVmRequiredLabelsPolicy implements GovernancePolicy {
    readonly id = 'gcp-vm-required-labels';
    readonly name = 'GCP VM Instance Must Have Required Labels';
    readonly description =
        'Compute Engine VM instances must have at least one environment label ("env" or "environment") to enable cost allocation, resource tracking, and governance reporting.';
    readonly resourceType = 'GcpVmInstance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'gcp';

    evaluate(instance: GcpVmInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        const labels = instance.labels ?? {};
        const labelKeys = Object.keys(labels).map((k) => k.toLowerCase());
        const hasEnvironmentLabel = REQUIRED_LABELS.some((req) => labelKeys.includes(req));

        if (!hasEnvironmentLabel) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.name,
                    resourceType: this.resourceType,
                    description: `VM instance "${instance.name}" is missing an environment label. Expected at least one of: ${REQUIRED_LABELS.join(', ')}.`,
                    recommendation:
                        'Add an "env" or "environment" label to the VM instance (e.g., env=production, env=staging). Labels enable cost allocation and resource lifecycle management.',
                    metadata: {
                        instanceName: instance.name,
                        zone: instance.zone,
                        presentLabels: Object.keys(labels),
                        requiredLabels: REQUIRED_LABELS,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.name,
                resourceType: this.resourceType,
                description: `VM instance "${instance.name}" has the required environment label.`,
                recommendation: '',
            },
        ];
    }
}
