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
import { S3NoPublicAccessPolicy } from './policies/aws/s3-no-public-access.policy';
import { S3EncryptionEnabledPolicy } from './policies/aws/s3-encryption-enabled.policy';
import { SgNoOpenSshPolicy } from './policies/aws/sg-no-open-ssh.policy';
import { SgNoOpenRdpPolicy } from './policies/aws/sg-no-open-rdp.policy';
import { Ec2RequiredTagsPolicy } from './policies/aws/ec2-required-tags.policy';
import { CloudTrailEnabledPolicy } from './policies/aws/cloudtrail-enabled.policy';

// Entities
import { GovernanceJob } from '../db/entites/governance-job.entity';
import { GovernanceFinding } from '../db/entites/governance-finding.entity';
import { CloudAccount } from '../db/entites/cloud-account.entity';
import { AwsVpc } from '../db/entites/aws-vpc.entity';
import { AwsEc2Instance } from '../db/entites/aws-ec2.entity';
import { AwsS3Bucket } from '../db/entites/aws-s3-bucket.entity';
import { AwsSecurityGroup } from '../db/entites/aws-security-group.entity';
import { AwsCloudTrailTrail } from '../db/entites/aws-cloudtrail-trail.entity';

// Supporting modules
import { TenantModule } from '../tenant/tenant.module';

import { GOVERNANCE_QUEUE } from './constants';

@Module({
    imports: [
        // BullMQ queue para o scan assíncrono
        BullModule.registerQueue({ name: GOVERNANCE_QUEUE }),

        // Repositórios TypeORM necessários
        TypeOrmModule.forFeature([
            GovernanceJob,
            GovernanceFinding,
            CloudAccount,
            AwsVpc,
            AwsEc2Instance,
            AwsS3Bucket,
            AwsSecurityGroup,
            AwsCloudTrailTrail,
        ]),

        // Módulo de tenant para guards e decorators
        TenantModule,
    ],
    controllers: [GovernanceController],
    providers: [
        // Serviços principais
        GovernanceService,
        GovernanceScanService,

        // Processador BullMQ
        GovernanceProcessor,

        // Motor de políticas
        PolicyRegistryService,
        S3NoPublicAccessPolicy,
        S3EncryptionEnabledPolicy,
        SgNoOpenSshPolicy,
        SgNoOpenRdpPolicy,
        Ec2RequiredTagsPolicy,
        CloudTrailEnabledPolicy,
    ],
})
export class GovernanceModule {}
