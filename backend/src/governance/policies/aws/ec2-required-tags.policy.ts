import { Injectable } from '@nestjs/common';

import { AwsEc2Instance } from '../../../db/entites/aws-ec2.entity';

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
        const requiredTags =
            context.orgRules?.requiredTags && context.orgRules.requiredTags.length > 0
                ? context.orgRules.requiredTags
                : DEFAULT_REQUIRED_TAGS;
        const tags = instance.tags ?? {};
        const presentKeys = Object.keys(tags);
        const presentLower = new Map(presentKeys.map((key) => [key.toLowerCase(), key]));
        const missingTags = requiredTags.filter((tag) => !presentLower.has(tag.toLowerCase()));

        if (missingTags.length > 0) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.awsInstanceId,
                    resourceType: this.resourceType,
                    description: `EC2 instance "${instance.awsInstanceId}" is missing required tags: ${missingTags.join(', ')}.`,
                    recommendation: `Add the following required tags to the EC2 instance: ${missingTags.join(', ')}.`,
                    metadata: {
                        instanceId: instance.awsInstanceId,
                        instanceType: instance.instanceType,
                        state: instance.state,
                        missingTags,
                        presentTags: presentKeys,
                        requiredTags,
                        source: context.orgRules?.requiredTags?.length
                            ? 'org_knowledge_rule'
                            : 'platform_default',
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.awsInstanceId,
                resourceType: this.resourceType,
                description: `EC2 instance "${instance.awsInstanceId}" has all required tags (${requiredTags.join(', ')}).`,
                recommendation: '',
            },
        ];
    }
}
