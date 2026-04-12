import { Injectable } from '@nestjs/common';

import { AwsEc2Instance } from '../../../db/entites/aws-ec2.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class Ec2PublicIpPolicy implements GovernancePolicy {
    readonly id = 'aws-ec2-public-ip';
    readonly name = 'EC2 Instance Should Not Have a Public IP Address';
    readonly description =
        'EC2 instances should not be directly reachable from the internet via a public or elastic IP address. Use NAT Gateways or Load Balancers for controlled internet access.';
    readonly resourceType = 'EC2Instance';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'aws';
    readonly category = 'network' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'PCI_DSS_3_2_1', 'NIST_800_53'] as const;

    evaluate(instance: AwsEc2Instance, _context: PolicyContext): PolicyEvaluationResult[] {
        const hasPublicIp = Boolean(instance.publicIpAddress);
        const hasElasticIp = Boolean(instance.elasticIp);

        if (hasPublicIp || hasElasticIp) {
            const ipType = hasElasticIp ? 'Elastic IP' : 'public IP';
            const ipAddress = instance.elasticIp ?? instance.publicIpAddress ?? 'unknown';

            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.awsInstanceId,
                    resourceType: this.resourceType,
                    description: `EC2 instance "${instance.awsInstanceId}" has a ${ipType} assigned (${ipAddress}), making it directly reachable from the internet.`,
                    recommendation:
                        'Remove the public IP or Elastic IP from the instance. Use a NAT Gateway for outbound internet traffic and an Application/Network Load Balancer for inbound access. Place instances in private subnets.',
                    metadata: {
                        instanceId: instance.awsInstanceId,
                        publicIpAddress: instance.publicIpAddress,
                        elasticIp: instance.elasticIp,
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
                description: `EC2 instance "${instance.awsInstanceId}" does not have a public or elastic IP address.`,
                recommendation: '',
            },
        ];
    }
}
