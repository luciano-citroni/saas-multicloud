import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// Controllers
import { GovernanceController } from './controllers/governance.controller';

// Services
import { GovernanceService } from './services/governance.service';
import { GovernanceScanService } from './services/governance-scan.service';

// Processor
import { GovernanceProcessor } from './processors/governance.processor';

// Policy engine
import { PolicyRegistryService } from './policies/policy-registry.service';

// ── AWS policies (original 8) ─────────────────────────────────────────────────
import { S3NoPublicAccessPolicy } from './policies/aws/s3-no-public-access.policy';
import { S3EncryptionEnabledPolicy } from './policies/aws/s3-encryption-enabled.policy';
import { SgNoOpenSshPolicy } from './policies/aws/sg-no-open-ssh.policy';
import { SgNoOpenRdpPolicy } from './policies/aws/sg-no-open-rdp.policy';
import { Ec2RequiredTagsPolicy } from './policies/aws/ec2-required-tags.policy';
import { CloudTrailEnabledPolicy } from './policies/aws/cloudtrail-enabled.policy';
import { RdsNotPubliclyAccessiblePolicy } from './policies/aws/rds-not-publicly-accessible.policy';
import { SgNoOpenDatabasePortsPolicy } from './policies/aws/sg-no-open-database-ports.policy';

// ── AWS policies (new enterprise — S3) ───────────────────────────────────────
import { S3LoggingDisabledPolicy } from './policies/aws/s3-logging-disabled.policy';
import { S3VersioningDisabledPolicy } from './policies/aws/s3-versioning-disabled.policy';

// ── AWS policies (new enterprise — EC2) ──────────────────────────────────────
import { Ec2PublicIpPolicy } from './policies/aws/ec2-public-ip.policy';
import { Ec2NoIamProfilePolicy } from './policies/aws/ec2-no-iam-profile.policy';

// ── AWS policies (new enterprise — RDS) ──────────────────────────────────────
import { RdsEncryptionDisabledPolicy } from './policies/aws/rds-encryption-disabled.policy';
import { RdsBackupRetentionPolicy } from './policies/aws/rds-backup-retention.policy';
import { RdsSingleAzPolicy } from './policies/aws/rds-single-az.policy';
import { RdsDeletionProtectionPolicy } from './policies/aws/rds-deletion-protection.policy';

// ── AWS policies (new enterprise — CloudTrail) ────────────────────────────────
import { CloudTrailNotMultiRegionPolicy } from './policies/aws/cloudtrail-not-multi-region.policy';
import { CloudTrailLogValidationDisabledPolicy } from './policies/aws/cloudtrail-log-validation-disabled.policy';

// ── AWS policies (new enterprise — KMS / GuardDuty / EKS / IAM / Lambda) ─────
import { KmsKeyRotationDisabledPolicy } from './policies/aws/kms-key-rotation-disabled.policy';
import { GuardDutyDisabledPolicy } from './policies/aws/guardduty-disabled.policy';
import { EksPublicEndpointUnrestrictedPolicy } from './policies/aws/eks-public-endpoint-unrestricted.policy';
import { IamRoleAdminAccessPolicy } from './policies/aws/iam-role-admin-access.policy';
import { IamRoleLongSessionPolicy } from './policies/aws/iam-role-long-session.policy';
import { LambdaNoVpcPolicy } from './policies/aws/lambda-no-vpc.policy';

// ── GCP policies ──────────────────────────────────────────────────────────────
import { GcpStoragePublicAccessPolicy } from './policies/gcp/gcp-storage-public-access.policy';
import { GcpStorageUniformAccessPolicy } from './policies/gcp/gcp-storage-uniform-access.policy';
import { GcpStorageVersioningDisabledPolicy } from './policies/gcp/gcp-storage-versioning-disabled.policy';
import { GcpFirewallOpenSshPolicy } from './policies/gcp/gcp-firewall-open-ssh.policy';
import { GcpFirewallOpenRdpPolicy } from './policies/gcp/gcp-firewall-open-rdp.policy';
import { GcpFirewallOpenDatabasePortsPolicy } from './policies/gcp/gcp-firewall-open-database-ports.policy';
import { GcpVmPublicIpPolicy } from './policies/gcp/gcp-vm-public-ip.policy';
import { GcpVmRequiredLabelsPolicy } from './policies/gcp/gcp-vm-required-labels.policy';
import { GcpSqlBackupDisabledPolicy } from './policies/gcp/gcp-sql-backup-disabled.policy';
import { GcpSqlPublicIpPolicy } from './policies/gcp/gcp-sql-public-ip.policy';
import { GcpGkeLoggingDisabledPolicy } from './policies/gcp/gcp-gke-logging-disabled.policy';

// ── Entities — Shared ─────────────────────────────────────────────────────────
import { GovernanceJob } from '../db/entites/governance-job.entity';
import { GovernanceFinding } from '../db/entites/governance-finding.entity';
import { GovernanceSuppression } from '../db/entites/governance-suppression.entity';
import { CloudAccount } from '../db/entites/cloud-account.entity';

// ── Entities — AWS ────────────────────────────────────────────────────────────
import { AwsVpc } from '../db/entites/aws-vpc.entity';
import { AwsEc2Instance } from '../db/entites/aws-ec2.entity';
import { AwsS3Bucket } from '../db/entites/aws-s3-bucket.entity';
import { AwsSecurityGroup } from '../db/entites/aws-security-group.entity';
import { AwsCloudTrailTrail } from '../db/entites/aws-cloudtrail-trail.entity';
import { AwsRdsInstance } from '../db/entites/aws-rds-instance.entity';
import { AwsKmsKey } from '../db/entites/aws-kms-key.entity';
import { AwsGuardDutyDetector } from '../db/entites/aws-guardduty-detector.entity';
import { AwsEksCluster } from '../db/entites/aws-eks-cluster.entity';
import { AwsIamRole } from '../db/entites/aws-iam-role.entity';
import { AwsLambdaFunction } from '../db/entites/aws-lambda-function.entity';

// ── Entities — GCP ────────────────────────────────────────────────────────────
import { GcpStorageBucket } from '../db/entites/gcp-storage-bucket.entity';
import { GcpFirewallRule } from '../db/entites/gcp-firewall-rule.entity';
import { GcpVmInstance } from '../db/entites/gcp-vm-instance.entity';
import { GcpSqlInstance } from '../db/entites/gcp-sql-instance.entity';
import { GcpGkeCluster } from '../db/entites/gcp-gke-cluster.entity';

// Supporting modules
import { TenantModule } from '../tenant/tenant.module';

import { GOVERNANCE_QUEUE } from './constants';

@Module({
    imports: [
        BullModule.registerQueue({ name: GOVERNANCE_QUEUE }),

        TypeOrmModule.forFeature([
            // Shared
            GovernanceJob,
            GovernanceFinding,
            GovernanceSuppression,
            CloudAccount,
            // AWS
            AwsVpc,
            AwsEc2Instance,
            AwsS3Bucket,
            AwsSecurityGroup,
            AwsCloudTrailTrail,
            AwsRdsInstance,
            AwsKmsKey,
            AwsGuardDutyDetector,
            AwsEksCluster,
            AwsIamRole,
            AwsLambdaFunction,
            // GCP
            GcpStorageBucket,
            GcpFirewallRule,
            GcpVmInstance,
            GcpSqlInstance,
            GcpGkeCluster,
        ]),

        TenantModule,
    ],
    controllers: [GovernanceController],
    providers: [
        // Core services
        GovernanceService,
        GovernanceScanService,
        GovernanceProcessor,
        PolicyRegistryService,

        // ── AWS Policies — Original ───────────────────────────────────────
        S3NoPublicAccessPolicy,
        S3EncryptionEnabledPolicy,
        SgNoOpenSshPolicy,
        SgNoOpenRdpPolicy,
        SgNoOpenDatabasePortsPolicy,
        Ec2RequiredTagsPolicy,
        CloudTrailEnabledPolicy,
        RdsNotPubliclyAccessiblePolicy,

        // ── AWS Policies — S3 (new) ───────────────────────────────────────
        S3LoggingDisabledPolicy,
        S3VersioningDisabledPolicy,

        // ── AWS Policies — EC2 (new) ──────────────────────────────────────
        Ec2PublicIpPolicy,
        Ec2NoIamProfilePolicy,

        // ── AWS Policies — RDS (new) ──────────────────────────────────────
        RdsEncryptionDisabledPolicy,
        RdsBackupRetentionPolicy,
        RdsSingleAzPolicy,
        RdsDeletionProtectionPolicy,

        // ── AWS Policies — CloudTrail (new) ───────────────────────────────
        CloudTrailNotMultiRegionPolicy,
        CloudTrailLogValidationDisabledPolicy,

        // ── AWS Policies — Security / IAM / Monitoring (new) ─────────────
        KmsKeyRotationDisabledPolicy,
        GuardDutyDisabledPolicy,
        EksPublicEndpointUnrestrictedPolicy,
        IamRoleAdminAccessPolicy,
        IamRoleLongSessionPolicy,
        LambdaNoVpcPolicy,

        // ── GCP Policies ──────────────────────────────────────────────────
        GcpStoragePublicAccessPolicy,
        GcpStorageUniformAccessPolicy,
        GcpStorageVersioningDisabledPolicy,
        GcpFirewallOpenSshPolicy,
        GcpFirewallOpenRdpPolicy,
        GcpFirewallOpenDatabasePortsPolicy,
        GcpVmPublicIpPolicy,
        GcpVmRequiredLabelsPolicy,
        GcpSqlBackupDisabledPolicy,
        GcpSqlPublicIpPolicy,
        GcpGkeLoggingDisabledPolicy,
    ],
})
export class GovernanceModule {}
