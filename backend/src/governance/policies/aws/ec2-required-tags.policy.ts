import { Injectable } from '@nestjs/common';

import { AwsEc2Instance } from '../../../db/entites/aws-ec2.entity';

import {
    evaluateRequiredTagsFinding,
    resolveApplicableRequiredTags,
} from '../org-knowledge-policy.helpers';
import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** Fallback tags when the org has no knowledge-base required_tags rule. */
const DEFAULT_REQUIRED_TAGS = ['Name', 'Environment'];

@Injectable()
export class Ec2RequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'aws-ec2-required-tags';
    readonly name = 'EC2 Instance Must Have Required Tags';
    readonly description =
        'EC2 instances must have organization-required tags (from knowledge-base rules) or platform defaults (Name, Environment).';
    readonly resourceType = 'EC2Instance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(instance: AwsEc2Instance, context: PolicyContext): PolicyEvaluationResult[] {
        // Org KB tags are evaluated for every taggable resource by evaluateOrgKnowledgeTags.
        if (resolveApplicableRequiredTags(context, 'aws', this.resourceType)) {
            return [];
        }

        const finding = evaluateRequiredTagsFinding({
            resourceId: instance.awsInstanceId,
            resourceType: this.resourceType,
            resourceLabel: `EC2 instance "${instance.awsInstanceId}"`,
            tags: instance.tags,
            requiredTags: DEFAULT_REQUIRED_TAGS,
            extraMetadata: {
                instanceId: instance.awsInstanceId,
                instanceType: instance.instanceType,
                state: instance.state,
                source: 'platform_default',
            },
        });
        return [finding];
    }
}
