import { Injectable } from '@nestjs/common';

import { GcpSqlInstance } from '../../../db/entites/gcp-sql-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class GcpSqlBackupDisabledPolicy implements GovernancePolicy {
    readonly id = 'gcp-sql-backup-disabled';
    readonly name = 'GCP Cloud SQL Instance Must Have Automated Backups Enabled';
    readonly description =
        'Cloud SQL instances should have automated backups enabled to ensure data recovery in the event of accidental data loss or corruption.';
    readonly resourceType = 'GcpSqlInstance';
    readonly severity: FindingSeverity = 'high';
    readonly provider = 'gcp';

    evaluate(instance: GcpSqlInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!instance.backupEnabled) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.name,
                    resourceType: this.resourceType,
                    description: `Cloud SQL instance "${instance.name}" (${instance.databaseVersion}) does not have automated backups enabled. Data loss cannot be recovered if the instance fails or data is accidentally deleted.`,
                    recommendation:
                        'Enable automated backups on the Cloud SQL instance. Configure a backup window and set a retention period appropriate for your recovery objectives.',
                    metadata: {
                        instanceName: instance.name,
                        databaseVersion: instance.databaseVersion,
                        region: instance.region,
                        tier: instance.tier,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.name,
                resourceType: this.resourceType,
                description: `Cloud SQL instance "${instance.name}" has automated backups enabled.`,
                recommendation: '',
            },
        ];
    }
}
