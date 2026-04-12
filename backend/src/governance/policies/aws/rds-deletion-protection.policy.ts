import { Injectable } from '@nestjs/common';

import { AwsRdsInstance } from '../../../db/entites/aws-rds-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class RdsDeletionProtectionPolicy implements GovernancePolicy {
    readonly id = 'aws-rds-deletion-protection';
    readonly name = 'RDS Instance Must Have Deletion Protection Enabled';
    readonly description =
        'RDS instances should have deletion protection enabled to prevent accidental deletion of databases, which could result in permanent data loss.';
    readonly resourceType = 'RDSInstance';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'aws';
    readonly category = 'storage' as const;
    readonly frameworks = ['SOC2', 'NIST_800_53'] as const;

    evaluate(instance: AwsRdsInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!instance.deletionProtection) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.awsDbInstanceIdentifier,
                    resourceType: this.resourceType,
                    description: `RDS instance "${instance.awsDbInstanceIdentifier}" does not have deletion protection enabled. The database can be deleted without any additional safeguards.`,
                    recommendation:
                        'Enable deletion protection on the RDS instance. This prevents accidental deletion and requires disabling the protection before any intentional deletion can proceed.',
                    metadata: {
                        dbInstanceIdentifier: instance.awsDbInstanceIdentifier,
                        engine: instance.engine,
                        status: instance.status,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.awsDbInstanceIdentifier,
                resourceType: this.resourceType,
                description: `RDS instance "${instance.awsDbInstanceIdentifier}" has deletion protection enabled.`,
                recommendation: '',
            },
        ];
    }
}
