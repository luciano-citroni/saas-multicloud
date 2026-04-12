import { Injectable } from '@nestjs/common';

import { AwsKmsKey } from '../../../db/entites/aws-kms-key.entity';

import { GovernancePolicy, PolicyContext, PolicyEvaluationResult, FindingSeverity } from '../policy.interface';

/** Only check CUSTOMER-managed symmetric keys — AWS-managed keys are rotated automatically. */
const CUSTOMER_KEY_MANAGER = 'CUSTOMER';
const SYMMETRIC_SPEC = 'SYMMETRIC_DEFAULT';
const ENABLED_STATE = 'Enabled';

@Injectable()
export class KmsKeyRotationDisabledPolicy implements GovernancePolicy {
    readonly id = 'aws-kms-key-rotation-disabled';
    readonly name = 'KMS Customer-Managed Keys Must Have Automatic Rotation Enabled';
    readonly description =
        'Customer-managed AWS KMS symmetric keys should have automatic key rotation enabled. Rotating keys annually reduces the risk of key compromise and meets compliance requirements.';
    readonly resourceType = 'KMSKey';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'encryption' as const;
    readonly frameworks = ['CIS_AWS_1_4', 'PCI_DSS_3_2_1', 'NIST_800_53'] as const;

    evaluate(key: AwsKmsKey, _context: PolicyContext): PolicyEvaluationResult[] {
        // Only evaluate customer-managed, enabled, symmetric keys
        const isCustomerManaged = key.keyManager === CUSTOMER_KEY_MANAGER;
        const isEnabled = key.keyState === ENABLED_STATE;
        const isSymmetric = key.keySpec === SYMMETRIC_SPEC || key.keySpec == null;

        if (!isCustomerManaged || !isEnabled || !isSymmetric) {
            return [
                {
                    status: 'compliant',
                    resourceId: key.awsKeyId,
                    resourceType: this.resourceType,
                    description: `KMS key "${key.awsKeyId}" is not a customer-managed enabled symmetric key — rotation check not applicable.`,
                    recommendation: '',
                },
            ];
        }

        if (!key.keyRotationEnabled) {
            return [
                {
                    status: 'non_compliant',
                    resourceId: key.awsKeyId,
                    resourceType: this.resourceType,
                    description: `KMS customer-managed key "${key.awsKeyId}" does not have automatic key rotation enabled. The key material is never rotated, increasing risk if the key is compromised.`,
                    recommendation:
                        'Enable automatic key rotation on the KMS customer-managed key. AWS KMS rotates the key material annually while keeping the same key ID and ARN. This meets CIS AWS Foundations Benchmark requirement 3.7.',
                    metadata: {
                        keyId: key.awsKeyId,
                        keyArn: key.keyArn,
                        keyState: key.keyState,
                        keyUsage: key.keyUsage,
                        description: key.description,
                    },
                },
            ];
        }

        return [
            {
                status: 'compliant',
                resourceId: key.awsKeyId,
                resourceType: this.resourceType,
                description: `KMS key "${key.awsKeyId}" has automatic key rotation enabled.`,
                recommendation: '',
            },
        ];
    }
}
