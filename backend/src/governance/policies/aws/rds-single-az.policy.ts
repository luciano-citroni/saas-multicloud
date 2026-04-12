import { Injectable } from '@nestjs/common';

import { AwsRdsInstance } from '../../../db/entites/aws-rds-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class RdsSingleAzPolicy implements GovernancePolicy {
    readonly id = 'aws-rds-single-az';
    readonly name = 'RDS Production Instance Should Have Multi-AZ Enabled';
    readonly description =
        'RDS instances in production environments should have Multi-AZ deployment enabled to provide high availability and automatic failover in the event of an infrastructure failure.';
    readonly resourceType = 'RDSInstance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2', 'ISO_27001'] as const;

    evaluate(instance: AwsRdsInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!instance.multiAz) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.awsDbInstanceIdentifier,
                    resourceType: this.resourceType,
                    description: `RDS instance "${instance.awsDbInstanceIdentifier}" (${instance.engine}) is not configured for Multi-AZ deployment. A zone failure will result in database downtime.`,
                    recommendation:
                        'Enable Multi-AZ deployment on the RDS instance to achieve automatic failover to a standby replica in a different Availability Zone. This minimizes downtime during planned maintenance or unexpected infrastructure failures.',
                    metadata: {
                        dbInstanceIdentifier: instance.awsDbInstanceIdentifier,
                        engine: instance.engine,
                        availabilityZone: instance.availabilityZone,
                        dbInstanceClass: instance.dbInstanceClass,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.awsDbInstanceIdentifier,
                resourceType: this.resourceType,
                description: `RDS instance "${instance.awsDbInstanceIdentifier}" has Multi-AZ deployment enabled.`,
                recommendation: '',
            },
        ];
    }
}
