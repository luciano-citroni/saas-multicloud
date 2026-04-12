import { Injectable } from '@nestjs/common';

import { AwsEc2Instance } from '../../../db/entites/aws-ec2.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** Tags que toda instância EC2 deve possuir. */
const REQUIRED_TAGS = ['Name', 'Environment'];

@Injectable()
export class Ec2RequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'aws-ec2-required-tags';
    readonly name = 'EC2 Instance Must Have Required Tags';
    readonly description = `EC2 instances must have the following tags: ${REQUIRED_TAGS.join(', ')}. Tags help with cost allocation, compliance reporting, and resource management.`;
    readonly resourceType = 'EC2Instance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(instance: AwsEc2Instance, _context: PolicyContext): PolicyEvaluationResult[] {
        const tags = instance.tags ?? {};
        const missingTags = REQUIRED_TAGS.filter((tag) => !tags[tag]);

        if (missingTags.length > 0) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.awsInstanceId,
                    resourceType: this.resourceType,
                    description: `EC2 instance "${instance.awsInstanceId}" is missing required tags: ${missingTags.join(', ')}.`,
                    recommendation: `Add the following required tags to the EC2 instance: ${missingTags.join(', ')}. Tags should describe the resource's name, environment (e.g., production, staging), and purpose.`,
                    metadata: {
                        instanceId: instance.awsInstanceId,
                        missingTags,
                        presentTags: Object.keys(tags),
                        instanceType: instance.instanceType,
                        state: instance.state,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.awsInstanceId,
                resourceType: this.resourceType,
                description: `EC2 instance "${instance.awsInstanceId}" has all required tags (${REQUIRED_TAGS.join(', ')}).`,
                recommendation: '',
            },
        ];
    }
}
