import { Injectable } from '@nestjs/common';

import { AwsRdsInstance } from '../../../db/entites/aws-rds-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class RdsNotPubliclyAccessiblePolicy implements GovernancePolicy {
    readonly id = 'aws-rds-not-publicly-accessible';
    readonly name = 'RDS Instance Must Not Be Publicly Accessible';
    readonly description =
        'RDS instances should not be publicly accessible. Databases must remain in private networks and only be reachable through controlled private access paths.';
    readonly resourceType = 'RDSInstance';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'aws';

    evaluate(instance: AwsRdsInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        if (instance.publiclyAccessible) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.awsDbInstanceIdentifier,
                    resourceType: this.resourceType,
                    description: `RDS instance "${instance.awsDbInstanceIdentifier}" is publicly accessible.`,
                    recommendation:
                        'Disable Publicly Accessible on the RDS instance and ensure access occurs only through private subnets, VPN, peering, or approved bastion/connectivity layers.',
                    metadata: {
                        dbInstanceIdentifier: instance.awsDbInstanceIdentifier,
                        engine: instance.engine,
                        status: instance.status,
                        endpointAddress: instance.endpointAddress,
                        endpointPort: instance.endpointPort,
                        availabilityZone: instance.availabilityZone,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.awsDbInstanceIdentifier,
                resourceType: this.resourceType,
                description: `RDS instance "${instance.awsDbInstanceIdentifier}" is not publicly accessible.`,
                recommendation: '',
            },
        ];
    }
}
