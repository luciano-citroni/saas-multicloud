import { Injectable } from '@nestjs/common';

import { AwsRdsInstance } from '../../../db/entites/aws-rds-instance.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

@Injectable()
export class RdsEncryptionDisabledPolicy implements GovernancePolicy {
    readonly id = 'aws-rds-encryption-disabled';
    readonly name = 'RDS Instance Must Have Storage Encryption Enabled';
    readonly description =
        'RDS instances should have storage encryption enabled (at-rest) to protect sensitive data stored in the database. Encryption cannot be enabled on an existing unencrypted instance — a snapshot restore is required.';
    readonly resourceType = 'RDSInstance';
    readonly severity: FindingSeverity = 'critical';
    readonly provider = 'aws';
    readonly category = 'encryption' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'PCI_DSS_3_2_1', 'SOC2', 'NIST_800_53', 'ISO_27001'] as const;

    evaluate(instance: AwsRdsInstance, _context: PolicyContext): PolicyEvaluationResult[] {
        if (!instance.storageEncrypted) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: instance.awsDbInstanceIdentifier,
                    resourceType: this.resourceType,
                    description: `RDS instance "${instance.awsDbInstanceIdentifier}" (${instance.engine}) does not have storage encryption enabled. Data at rest is not protected.`,
                    recommendation:
                        'Enable storage encryption on the RDS instance. Since encryption cannot be enabled on a running instance, create an encrypted snapshot of the instance and restore a new encrypted instance from it. Use AWS KMS CMKs for stronger key management.',
                    metadata: {
                        dbInstanceIdentifier: instance.awsDbInstanceIdentifier,
                        engine: instance.engine,
                        engineVersion: instance.engineVersion,
                        dbInstanceClass: instance.dbInstanceClass,
                        kmsKeyId: instance.kmsKeyId,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: instance.awsDbInstanceIdentifier,
                resourceType: this.resourceType,
                description: `RDS instance "${instance.awsDbInstanceIdentifier}" has storage encryption enabled.`,
                recommendation: '',
            },
        ];
    }
}
