import { Injectable } from '@nestjs/common';

import { AwsRdsInstance } from '../../../db/entites/aws-rds-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** Minimum recommended backup retention period in days. */
const MIN_RETENTION_DAYS = 7;

@Injectable()
export class RdsBackupRetentionPolicy implements GovernancePolicy {
    readonly id = 'aws-rds-backup-retention';
    readonly name = `RDS Instance Must Have Automated Backups Retained for At Least ${MIN_RETENTION_DAYS} Days`;
    readonly description = `RDS instances should have automated backups enabled with a retention period of at least ${MIN_RETENTION_DAYS} days to allow point-in-time recovery.`;
    readonly resourceType = 'RDSInstance';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'aws';
    readonly category = 'storage' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'SOC2', 'NIST_800_53'] as const;

    evaluate(instance: AwsRdsInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        const retention = instance.backupRetentionPeriod ?? 0;

        if (retention < MIN_RETENTION_DAYS) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.awsDbInstanceIdentifier,
                    resourceType: this.resourceType,
                    description:
                        retention === 0
                            ? `RDS instance "${instance.awsDbInstanceIdentifier}" has automated backups disabled (retention = 0). Data cannot be recovered after accidental loss.`
                            : `RDS instance "${instance.awsDbInstanceIdentifier}" has a backup retention period of ${retention} day(s), which is below the minimum of ${MIN_RETENTION_DAYS} days.`,
                    recommendation: `Set the automated backup retention period on the RDS instance to at least ${MIN_RETENTION_DAYS} days. A value of 0 disables backups entirely, which is not acceptable for production databases.`,
                    metadata: {
                        dbInstanceIdentifier: instance.awsDbInstanceIdentifier,
                        engine: instance.engine,
                        backupRetentionPeriod: retention,
                        minimumRequired: MIN_RETENTION_DAYS,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.awsDbInstanceIdentifier,
                resourceType: this.resourceType,
                description: `RDS instance "${instance.awsDbInstanceIdentifier}" has automated backups with ${retention}-day retention.`,
                recommendation: '',
            },
        ];
    }
}
