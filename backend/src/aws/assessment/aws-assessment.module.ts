import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// Core
import { AwsAssessmentController } from './aws-assessment.controller';
import { AwsAssessmentService } from './aws-assessment.service';
import { AwsAssessmentProcessor } from './aws-assessment.processor';
import { AwsGeneralSyncProcessor } from './aws-general-sync.processor';
import { AwsAssessmentSyncService } from './aws-assessment-sync.service';
import { AwsAssessmentReportService } from './aws-assessment-report.service';
import { AwsAssessmentArchitectureService } from './aws-assessment-architecture.service';
import { AwsAssessmentExcelService } from './aws-assessment-excel.service';
import { ASSESSMENT_QUEUE, GENERAL_SYNC_QUEUE } from './constants';

// Entities
import { AwsAssessmentJob } from '../../db/entites/aws-assessment-job.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { CloudSyncJob } from '../../db/entites/cloud-sync-job.entity';
import {
    AwsVpc,
    AwsSubnet,
    AwsRouteTable,
    AwsEc2Instance,
    AwsEcsCluster,
    AwsEcsTaskDefinition,
    AwsEcsService,
    AwsEksCluster,
    AwsLoadBalancer,
    AwsLoadBalancerListener,
    AwsSecurityGroup,
    AwsIamRole,
    AwsRdsInstance,
    AwsS3Bucket,
    AwsCloudFrontDistribution,
    AwsRoute53HostedZone,
    AwsCloudWatchAlarm,
    AwsCloudTrailTrail,
    AwsLambdaFunction,
    AwsApiGatewayRestApi,
    AwsKmsKey,
    AwsSecretsManagerSecret,
    AwsEcrRepository,
    AwsDynamoDbTable,
    AwsElastiCacheCluster,
    AwsSqsQueue,
    AwsSnsTopic,
    AwsWafWebAcl,
    AwsGuardDutyDetector,
} from '../../db/entites';

// AWS sub-modules (to access their exported services)
import { AwsNetworkingModule } from '../networking/aws-networking.module';
import { Ec2Module } from '../ec2/aws-ec2.module';
import { AwsRouteTablesModule } from '../route-tables/aws-route-tables.module';
import { AwsEcsModule } from '../ecs/aws-ecs.module';
import { AwsLoadBalancerModule } from '../load-balancers/aws-load-balancer.module';
import { AwsSecurityGroupModule } from '../security-groups/aws-security-group.module';
import { AwsIamModule } from '../iam/aws-iam-role.module';
import { AwsRdsModule } from '../rds/aws-rds.module';
import { AwsS3Module } from '../s3/aws-s3.module';
import { AwsCloudFrontModule } from '../cloudfront/aws-cloudfront.module';
import { AwsEksModule } from '../eks/aws-eks.module';
import { AwsRoute53Module } from '../route53/aws-route53.module';
import { AwsCloudWatchModule } from '../cloudwatch/aws-cloudwatch.module';
import { AwsCloudTrailModule } from '../cloudtrail/aws-cloudtrail.module';
import { AwsLambdaModule } from '../lambda/aws-lambda.module';
import { AwsApiGatewayModule } from '../api-gateway/aws-api-gateway.module';
import { AwsKmsModule } from '../kms/aws-kms.module';
import { AwsSecretsManagerModule } from '../secrets-manager/aws-secrets-manager.module';
import { AwsEcrModule } from '../ecr/aws-ecr.module';
import { AwsDynamoDbModule } from '../dynamodb/aws-dynamodb.module';
import { AwsElastiCacheModule } from '../elasticache/aws-elasticache.module';
import { AwsSqsModule } from '../sqs/aws-sqs.module';
import { AwsSnsModule } from '../sns/aws-sns.module';
import { AwsWafModule } from '../waf/aws-waf.module';
import { AwsGuardDutyModule } from '../guardduty/aws-guardduty.module';
import { TenantModule } from '../../tenant/tenant.module';
import { BillingModule } from '../../billing/billing.module';

@Module({
    imports: [
        // BullMQ queue
        BullModule.registerQueue({ name: ASSESSMENT_QUEUE }),
        BullModule.registerQueue({ name: GENERAL_SYNC_QUEUE }),

        // TypeORM repositories for report service and job tracking
        TypeOrmModule.forFeature([
            AwsAssessmentJob,
            CloudAccount,
            CloudSyncJob,
            AwsVpc,
            AwsSubnet,
            AwsRouteTable,
            AwsEc2Instance,
            AwsEcsCluster,
            AwsEcsTaskDefinition,
            AwsEcsService,
            AwsEksCluster,
            AwsLoadBalancer,
            AwsLoadBalancerListener,
            AwsSecurityGroup,
            AwsIamRole,
            AwsRdsInstance,
            AwsS3Bucket,
            AwsCloudFrontDistribution,
            AwsRoute53HostedZone,
            AwsCloudWatchAlarm,
            AwsCloudTrailTrail,
            AwsLambdaFunction,
            AwsApiGatewayRestApi,
            AwsKmsKey,
            AwsSecretsManagerSecret,
            AwsEcrRepository,
            AwsDynamoDbTable,
            AwsElastiCacheCluster,
            AwsSqsQueue,
            AwsSnsTopic,
            AwsWafWebAcl,
            AwsGuardDutyDetector,
        ]),

        // AWS service modules (provide sync services)
        AwsNetworkingModule,
        Ec2Module,
        AwsRouteTablesModule,
        AwsEcsModule,
        AwsLoadBalancerModule,
        AwsSecurityGroupModule,
        AwsIamModule,
        AwsRdsModule,
        AwsS3Module,
        AwsCloudFrontModule,
        AwsEksModule,
        AwsRoute53Module,
        AwsCloudWatchModule,
        AwsCloudTrailModule,
        AwsLambdaModule,
        AwsApiGatewayModule,
        AwsKmsModule,
        AwsSecretsManagerModule,
        AwsEcrModule,
        AwsDynamoDbModule,
        AwsElastiCacheModule,
        AwsSqsModule,
        AwsSnsModule,
        AwsWafModule,
        AwsGuardDutyModule,
        TenantModule,
        BillingModule,
    ],
    controllers: [AwsAssessmentController],
    providers: [
        AwsAssessmentService,
        AwsAssessmentProcessor,
        AwsGeneralSyncProcessor,
        AwsAssessmentSyncService,
        AwsAssessmentReportService,
        AwsAssessmentArchitectureService,
        AwsAssessmentExcelService,
    ],
})
export class AwsAssessmentModule {}
