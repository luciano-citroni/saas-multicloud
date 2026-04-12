import { Injectable } from '@nestjs/common';

import { AwsLambdaFunction } from '../../../db/entites/aws-lambda-function.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class LambdaNoVpcPolicy implements GovernancePolicy {
    readonly id = 'aws-lambda-no-vpc';
    readonly name = 'Lambda Function That Accesses Private Resources Should Be in a VPC';
    readonly description =
        'Lambda functions that need to access private resources (RDS, ElastiCache, internal APIs) should be deployed inside a VPC to ensure they communicate over the private network and not the public internet.';
    readonly resourceType = 'LambdaFunction';
    readonly severity: FindingSeverity = 'low';
    readonly provider = 'aws';
    readonly category = 'network' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'NIST_800_53'] as const;

    evaluate(fn: AwsLambdaFunction, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!fn.vpcId && !fn.awsVpcId) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: fn.functionArn,
                    resourceType: this.resourceType,
                    description: `Lambda function "${fn.functionName}" is not associated with a VPC. If it accesses private resources, it cannot do so securely over the internal network.`,
                    recommendation:
                        'If this Lambda function accesses private resources (databases, internal services), configure it to run inside a VPC with private subnets. Ensure the security groups allow only necessary outbound traffic.',
                    metadata: {
                        functionName: fn.functionName,
                        functionArn: fn.functionArn,
                        runtime: fn.runtime,
                        state: fn.state,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: fn.functionArn,
                resourceType: this.resourceType,
                description: `Lambda function "${fn.functionName}" is deployed inside a VPC.`,
                recommendation: '',
            },
        ];
    }
}
