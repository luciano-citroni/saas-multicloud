import { Module } from '@nestjs/common';
import { AwsConnectorModule } from './aws-connector.module';
import { AwsNetworkingModule } from './networking/aws-networking.module';
import { Ec2Module } from './ec2/aws-ec2.module';
import { AwsRouteTablesModule } from './route-tables/aws-route-tables.module';
import { AwsEcsModule } from './ecs/aws-ecs.module';
import { AwsLoadBalancerModule } from './load-balancers/aws-load-balancer.module';
import { AwsSecurityGroupModule } from './security-groups/aws-security-group.module';
import { AwsIamModule } from './iam/aws-iam-role.module';
import { AwsRdsModule } from './rds/aws-rds.module';
import { AwsS3Module } from './s3/aws-s3.module';
import { AwsCloudFrontModule } from './cloudfront/aws-cloudfront.module';
import { AwsEksModule } from './eks/aws-eks.module';
import { AwsRoute53Module } from './route53/aws-route53.module';
import { AwsCloudWatchModule } from './cloudwatch/aws-cloudwatch.module';
import { AwsCloudTrailModule } from './cloudtrail/aws-cloudtrail.module';
import { AwsLambdaModule } from './lambda/aws-lambda.module';
import { AwsApiGatewayModule } from './api-gateway/aws-api-gateway.module';
import { AwsKmsModule } from './kms/aws-kms.module';
import { AwsSecretsManagerModule } from './secrets-manager/aws-secrets-manager.module';
import { AwsEcrModule } from './ecr/aws-ecr.module';
import { AwsDynamoDbModule } from './dynamodb/aws-dynamodb.module';
import { AwsElastiCacheModule } from './elasticache/aws-elasticache.module';
import { AwsSqsModule } from './sqs/aws-sqs.module';
import { AwsSnsModule } from './sns/aws-sns.module';
import { AwsWafModule } from './waf/aws-waf.module';
import { AwsGuardDutyModule } from './guardduty/aws-guardduty.module';
import { AwsAssessmentModule } from './assessment/aws-assessment.module';

@Module({
    imports: [
        AwsConnectorModule,
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
        AwsAssessmentModule,
    ],
    exports: [AwsConnectorModule],
})
export class AwsModule {}
