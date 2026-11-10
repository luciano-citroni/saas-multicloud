import { Injectable } from '@nestjs/common';

import { GcpVmInstance } from '../../../db/entites/gcp-vm-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** Fallback labels when the org has no knowledge-base required_tags rule. */
const DEFAULT_REQUIRED_LABELS = ['env', 'environment'];

@Injectable()
export class GcpVmRequiredLabelsPolicy implements GovernancePolicy {
    readonly id = 'gcp-vm-required-labels';
    readonly name = 'GCP VM Instance Must Have Required Labels';
    readonly description =
        'Compute Engine VMs must have organization-required labels (from knowledge-base rules) or at least one environment label.';
    readonly resourceType = 'GcpVmInstance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'gcp';
    readonly category = 'compute' as const;
    readonly frameworks = ['CIS_GCP_2_0', 'ISO_27001', 'SOC2'] as const;

    evaluate(instance: GcpVmInstance, context: PolicyContext): PolicyEvaluationResult[] {
        const labels = instance.labels ?? {};
        const labelKeys = Object.keys(labels);
        const labelKeysLower = labelKeys.map((k) => k.toLowerCase());

        const orgTags = context.orgRules?.requiredTags ?? [];
        if (orgTags.length > 0) {
            const missing = orgTags.filter((tag) => !labelKeysLower.includes(tag.toLowerCase()));
            if (missing.length > 0) {
                return [
                    {
                        status: 'non_compliant',
                        resourceId: instance.name,
                        resourceType: this.resourceType,
                        description: `VM instance "${instance.name}" is missing required labels: ${missing.join(', ')}.`,
                        recommendation: `Add the following required labels to the VM instance: ${missing.join(', ')}.`,
                        metadata: {
                            instanceName: instance.name,
                            zone: instance.zone,
                            presentLabels: labelKeys,
                            requiredLabels: orgTags,
                            source: 'org_knowledge_rule',
                        },
                    },
                ];
            }

            return [
                {
                    status: 'compliant',
                    resourceId: instance.name,
                    resourceType: this.resourceType,
                    description: `VM instance "${instance.name}" has all required organization labels.`,
                    recommendation: '',
                },
            ];
        }

        const hasEnvironmentLabel = DEFAULT_REQUIRED_LABELS.some((req) => labelKeysLower.includes(req));

        if (!hasEnvironmentLabel) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.name,
                    resourceType: this.resourceType,
                    description: `VM instance "${instance.name}" is missing an environment label. Expected at least one of: ${DEFAULT_REQUIRED_LABELS.join(', ')}.`,
                    recommendation:
                        'Add an "env" or "environment" label to the VM instance (e.g., env=production, env=staging). Labels enable cost allocation and resource lifecycle management.',
                    metadata: {
                        instanceName: instance.name,
                        zone: instance.zone,
                        presentLabels: labelKeys,
                        requiredLabels: DEFAULT_REQUIRED_LABELS,
                        source: 'platform_default',
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
