import { Injectable } from '@nestjs/common';
import { GcpStorageBucket } from '../../../db/entites/gcp-storage-bucket.entity';
import { GcpVmInstance } from '../../../db/entites/gcp-vm-instance.entity';
import {
    evaluateNamingFinding,
    resolveApplicableNamingPatterns,
} from '../org-knowledge-policy.helpers';
import {
    FindingSeverity,
    GovernancePolicy,
    PolicyContext,
    PolicyEvaluationResult,
} from '../policy.interface';

function asResults(result: PolicyEvaluationResult | null): PolicyEvaluationResult[] {
    return result ? [result] : [];
}

@Injectable()
export class GcpVmNamingPolicy implements GovernancePolicy {
    readonly id = 'gcp-vm-naming';
    readonly name = 'GCP VM Instance Must Match Naming Pattern';
    readonly description =
        'Compute Engine VM names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'GcpVmInstance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'gcp';
    readonly category = 'compute' as const;
    readonly frameworks = ['CIS_GCP_2_0', 'SOC2'] as const;

    evaluate(instance: GcpVmInstance, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'gcp', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: instance.name,
                resourceType: this.resourceType,
                resourceLabel: `VM instance "${instance.name}"`,
                nameValue: instance.name,
                patterns,
            }),
        );
    }
}

@Injectable()
export class GcpStorageNamingPolicy implements GovernancePolicy {
    readonly id = 'gcp-storage-naming';
    readonly name = 'GCP Storage Bucket Must Match Naming Pattern';
    readonly description =
        'Cloud Storage bucket names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'GcpStorageBucket';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'gcp';
    readonly category = 'storage' as const;
    readonly frameworks = ['CIS_GCP_2_0', 'SOC2'] as const;

    evaluate(bucket: GcpStorageBucket, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'gcp', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: bucket.name,
                resourceType: this.resourceType,
                resourceLabel: `Storage bucket "${bucket.name}"`,
                nameValue: bucket.name,
                patterns,
            }),
        );
    }
}
