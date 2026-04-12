import { Injectable } from '@nestjs/common';

import { GovernancePolicy } from './policy.interface';

// ── AWS policies — Original ───────────────────────────────────────────────────
import { S3NoPublicAccessPolicy } from './aws/s3-no-public-access.policy';
import { S3EncryptionEnabledPolicy } from './aws/s3-encryption-enabled.policy';
import { SgNoOpenSshPolicy } from './aws/sg-no-open-ssh.policy';
import { SgNoOpenRdpPolicy } from './aws/sg-no-open-rdp.policy';
import { Ec2RequiredTagsPolicy } from './aws/ec2-required-tags.policy';
import { CloudTrailEnabledPolicy } from './aws/cloudtrail-enabled.policy';
import { RdsNotPubliclyAccessiblePolicy } from './aws/rds-not-publicly-accessible.policy';
import { SgNoOpenDatabasePortsPolicy } from './aws/sg-no-open-database-ports.policy';

// ── AWS policies — S3 (enterprise) ───────────────────────────────────────────
import { S3LoggingDisabledPolicy } from './aws/s3-logging-disabled.policy';
import { S3VersioningDisabledPolicy } from './aws/s3-versioning-disabled.policy';

// ── AWS policies — EC2 (enterprise) ──────────────────────────────────────────
import { Ec2PublicIpPolicy } from './aws/ec2-public-ip.policy';
import { Ec2NoIamProfilePolicy } from './aws/ec2-no-iam-profile.policy';

// ── AWS policies — RDS (enterprise) ──────────────────────────────────────────
import { RdsEncryptionDisabledPolicy } from './aws/rds-encryption-disabled.policy';
import { RdsBackupRetentionPolicy } from './aws/rds-backup-retention.policy';
import { RdsSingleAzPolicy } from './aws/rds-single-az.policy';
import { RdsDeletionProtectionPolicy } from './aws/rds-deletion-protection.policy';

// ── AWS policies — CloudTrail (enterprise) ────────────────────────────────────
import { CloudTrailNotMultiRegionPolicy } from './aws/cloudtrail-not-multi-region.policy';
import { CloudTrailLogValidationDisabledPolicy } from './aws/cloudtrail-log-validation-disabled.policy';

// ── AWS policies — Security / IAM / Monitoring (enterprise) ──────────────────
import { KmsKeyRotationDisabledPolicy } from './aws/kms-key-rotation-disabled.policy';
import { GuardDutyDisabledPolicy } from './aws/guardduty-disabled.policy';
import { EksPublicEndpointUnrestrictedPolicy } from './aws/eks-public-endpoint-unrestricted.policy';
import { IamRoleAdminAccessPolicy } from './aws/iam-role-admin-access.policy';
import { IamRoleLongSessionPolicy } from './aws/iam-role-long-session.policy';
import { LambdaNoVpcPolicy } from './aws/lambda-no-vpc.policy';

// ── GCP policies ──────────────────────────────────────────────────────────────
import { GcpStoragePublicAccessPolicy } from './gcp/gcp-storage-public-access.policy';
import { GcpStorageUniformAccessPolicy } from './gcp/gcp-storage-uniform-access.policy';
import { GcpStorageVersioningDisabledPolicy } from './gcp/gcp-storage-versioning-disabled.policy';
import { GcpFirewallOpenSshPolicy } from './gcp/gcp-firewall-open-ssh.policy';
import { GcpFirewallOpenRdpPolicy } from './gcp/gcp-firewall-open-rdp.policy';
import { GcpFirewallOpenDatabasePortsPolicy } from './gcp/gcp-firewall-open-database-ports.policy';
import { GcpVmPublicIpPolicy } from './gcp/gcp-vm-public-ip.policy';
import { GcpVmRequiredLabelsPolicy } from './gcp/gcp-vm-required-labels.policy';
import { GcpSqlBackupDisabledPolicy } from './gcp/gcp-sql-backup-disabled.policy';
import { GcpSqlPublicIpPolicy } from './gcp/gcp-sql-public-ip.policy';
import { GcpGkeLoggingDisabledPolicy } from './gcp/gcp-gke-logging-disabled.policy';

/**
 * Registro central de todas as políticas de governança disponíveis.
 *
 * Para adicionar uma nova política:
 *  1. Crie a classe em policies/aws/ (ou policies/azure/, policies/gcp/)
 *  2. Injete aqui via construtor
 *  3. Ela será incluída automaticamente no scan
 */
@Injectable()
export class PolicyRegistryService {
    private readonly policies: GovernancePolicy[];

    constructor(
        // ── AWS — Original ────────────────────────────────────────────────────
        private readonly s3NoPublicAccess: S3NoPublicAccessPolicy,
        private readonly s3EncryptionEnabled: S3EncryptionEnabledPolicy,
        private readonly sgNoOpenSsh: SgNoOpenSshPolicy,
        private readonly sgNoOpenRdp: SgNoOpenRdpPolicy,
        private readonly sgNoOpenDatabasePorts: SgNoOpenDatabasePortsPolicy,
        private readonly ec2RequiredTags: Ec2RequiredTagsPolicy,
        private readonly cloudTrailEnabled: CloudTrailEnabledPolicy,
        private readonly rdsNotPubliclyAccessible: RdsNotPubliclyAccessiblePolicy,

        // ── AWS — S3 (enterprise) ─────────────────────────────────────────────
        private readonly s3LoggingDisabled: S3LoggingDisabledPolicy,
        private readonly s3VersioningDisabled: S3VersioningDisabledPolicy,

        // ── AWS — EC2 (enterprise) ────────────────────────────────────────────
        private readonly ec2PublicIp: Ec2PublicIpPolicy,
        private readonly ec2NoIamProfile: Ec2NoIamProfilePolicy,

        // ── AWS — RDS (enterprise) ────────────────────────────────────────────
        private readonly rdsEncryptionDisabled: RdsEncryptionDisabledPolicy,
        private readonly rdsBackupRetention: RdsBackupRetentionPolicy,
        private readonly rdsSingleAz: RdsSingleAzPolicy,
        private readonly rdsDeletionProtection: RdsDeletionProtectionPolicy,

        // ── AWS — CloudTrail (enterprise) ─────────────────────────────────────
        private readonly cloudTrailNotMultiRegion: CloudTrailNotMultiRegionPolicy,
        private readonly cloudTrailLogValidationDisabled: CloudTrailLogValidationDisabledPolicy,

        // ── AWS — Security / IAM / Monitoring (enterprise) ────────────────────
        private readonly kmsKeyRotationDisabled: KmsKeyRotationDisabledPolicy,
        private readonly guardDutyDisabled: GuardDutyDisabledPolicy,
        private readonly eksPublicEndpointUnrestricted: EksPublicEndpointUnrestrictedPolicy,
        private readonly iamRoleAdminAccess: IamRoleAdminAccessPolicy,
        private readonly iamRoleLongSession: IamRoleLongSessionPolicy,
        private readonly lambdaNoVpc: LambdaNoVpcPolicy,

        // ── GCP ───────────────────────────────────────────────────────────────
        private readonly gcpStoragePublicAccess: GcpStoragePublicAccessPolicy,
        private readonly gcpStorageUniformAccess: GcpStorageUniformAccessPolicy,
        private readonly gcpStorageVersioningDisabled: GcpStorageVersioningDisabledPolicy,
        private readonly gcpFirewallOpenSsh: GcpFirewallOpenSshPolicy,
        private readonly gcpFirewallOpenRdp: GcpFirewallOpenRdpPolicy,
        private readonly gcpFirewallOpenDatabasePorts: GcpFirewallOpenDatabasePortsPolicy,
        private readonly gcpVmPublicIp: GcpVmPublicIpPolicy,
        private readonly gcpVmRequiredLabels: GcpVmRequiredLabelsPolicy,
        private readonly gcpSqlBackupDisabled: GcpSqlBackupDisabledPolicy,
        private readonly gcpSqlPublicIp: GcpSqlPublicIpPolicy,
        private readonly gcpGkeLoggingDisabled: GcpGkeLoggingDisabledPolicy
    ) {
        this.policies = [
            // ── AWS — Original ────────────────────────────────────────────────
            this.s3NoPublicAccess,
            this.s3EncryptionEnabled,
            this.sgNoOpenSsh,
            this.sgNoOpenRdp,
            this.sgNoOpenDatabasePorts,
            this.ec2RequiredTags,
            this.cloudTrailEnabled,
            this.rdsNotPubliclyAccessible,

            // ── AWS — S3 (enterprise) ─────────────────────────────────────────
            this.s3LoggingDisabled,
            this.s3VersioningDisabled,

            // ── AWS — EC2 (enterprise) ────────────────────────────────────────
            this.ec2PublicIp,
            this.ec2NoIamProfile,

            // ── AWS — RDS (enterprise) ────────────────────────────────────────
            this.rdsEncryptionDisabled,
            this.rdsBackupRetention,
            this.rdsSingleAz,
            this.rdsDeletionProtection,

            // ── AWS — CloudTrail (enterprise) ─────────────────────────────────
            this.cloudTrailNotMultiRegion,
            this.cloudTrailLogValidationDisabled,

            // ── AWS — Security / IAM / Monitoring (enterprise) ────────────────
            this.kmsKeyRotationDisabled,
            this.guardDutyDisabled,
            this.eksPublicEndpointUnrestricted,
            this.iamRoleAdminAccess,
            this.iamRoleLongSession,
            this.lambdaNoVpc,

            // ── GCP ───────────────────────────────────────────────────────────
            this.gcpStoragePublicAccess,
            this.gcpStorageUniformAccess,
            this.gcpStorageVersioningDisabled,
            this.gcpFirewallOpenSsh,
            this.gcpFirewallOpenRdp,
            this.gcpFirewallOpenDatabasePorts,
            this.gcpVmPublicIp,
            this.gcpVmRequiredLabels,
            this.gcpSqlBackupDisabled,
            this.gcpSqlPublicIp,
            this.gcpGkeLoggingDisabled,
        ];
    }

    /** Retorna todas as políticas registradas. */
    getAll(): GovernancePolicy[] {
        return this.policies;
    }

    /** Retorna políticas filtradas por provider ('aws', 'gcp', 'azure', etc). */
    getByProvider(provider: string): GovernancePolicy[] {
        return this.policies.filter((p) => p.provider === provider || p.provider === '*');
    }

    /** Retorna políticas filtradas por tipo de recurso. */
    getByResourceType(resourceType: string): GovernancePolicy[] {
        return this.policies.filter((p) => p.resourceType === resourceType);
    }

    /** Retorna uma política específica pelo seu ID. */
    getById(id: string): GovernancePolicy | undefined {
        return this.policies.find((p) => p.id === id);
    }
}
