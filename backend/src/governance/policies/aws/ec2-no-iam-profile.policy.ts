import { Injectable } from '@nestjs/common';

import { AwsEc2Instance } from '../../../db/entites/aws-ec2.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class Ec2NoIamProfilePolicy implements GovernancePolicy {
    readonly id = 'aws-ec2-no-iam-profile';
    readonly name = 'EC2 Instance Should Have an IAM Instance Profile';
    readonly description =
        'EC2 instances should be associated with an IAM instance profile to grant the instance the permissions it needs using temporary credentials, avoiding the need to store long-lived access keys.';
    readonly resourceType = 'EC2Instance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'identity' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'SOC2'] as const;

    evaluate(instance: AwsEc2Instance, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!instance.iamInstanceProfileArn) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.awsInstanceId,
                    resourceType: this.resourceType,
                    description: `EC2 instance "${instance.awsInstanceId}" does not have an IAM instance profile attached. Applications running on this instance must use long-lived credentials stored on-disk, which is a security risk.`,
                    recommendation:
                        'Attach an IAM instance profile to the EC2 instance with only the permissions required (least-privilege). This allows applications to use temporary, automatically-rotated credentials via the EC2 metadata service.',
                    metadata: {
                        instanceId: instance.awsInstanceId,
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
                description: `EC2 instance "${instance.awsInstanceId}" has IAM instance profile "${instance.iamInstanceProfileArn}" attached.`,
                recommendation: '',
            },
        ];
    }
}
