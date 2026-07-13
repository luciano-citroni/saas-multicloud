import { Injectable } from '@nestjs/common';

import { GcpVmInstance } from '../../../db/entites/gcp-vm-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class GcpVmDeletionProtectionDisabledPolicy implements GovernancePolicy {
    readonly id = 'gcp-vm-deletion-protection-disabled';
    readonly name = 'GCP VM Instance Should Have Deletion Protection Enabled';
    readonly description =
        'Compute Engine VM instances should enable deletion protection to reduce the risk of accidental or unauthorized instance deletion.';
    readonly resourceType = 'GcpVmInstance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'gcp';
    readonly category = 'compute' as const;
    readonly frameworks = ['CIS_GCP_2_0', 'ISO_27001', 'SOC2'] as const;

    evaluate(instance: GcpVmInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!instance.deletionProtection) {
            return [
                {
                    status: 'warning',
                    resourceId: instance.name,
                    resourceType: this.resourceType,
                    description: `VM instance "${instance.name}" does not have deletion protection enabled and can be removed accidentally.`,
                    recommendation:
                        'Enable deletion protection for critical VM instances to prevent accidental removal during manual operations or automation errors.',
                    metadata: {
                        instanceName: instance.name,
                        zone: instance.zone,
                        machineType: instance.machineType,
                        status: instance.status,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.name,
                resourceType: this.resourceType,
                description: `VM instance "${instance.name}" has deletion protection enabled.`,
                recommendation: '',
            },
        ];
    }
}
