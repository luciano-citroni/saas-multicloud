import { Injectable, Logger } from '@nestjs/common';
import { AwsNetworkingService } from '../networking/aws-networking.service';
import { Ec2Service } from '../ec2/aws-ec2.service';
import { AwsRouteTablesService } from '../route-tables/aws-route-tables.service';
import { EcsService } from '../ecs/aws-ecs.service';
import { AwsLoadBalancerService } from '../load-balancers/aws-load-balancer.service';
import { AwsSecurityGroupService } from '../security-groups/aws-security-group.service';
import { AwsIamRoleService } from '../iam/aws-iam-role.service';
import { AwsRdsService } from '../rds/aws-rds.service';
import { S3Service } from '../s3/aws-s3.service';
import { CloudFrontService } from '../cloudfront/aws-cloudfront.service';
import { AwsEksService } from '../eks/aws-eks.service';
import { AwsRoute53Service } from '../route53/aws-route53.service';
import { AwsCloudWatchService } from '../cloudwatch/aws-cloudwatch.service';
import { AwsCloudTrailService } from '../cloudtrail/aws-cloudtrail.service';
import { AwsLambdaService } from '../lambda/aws-lambda.service';
import { AwsApiGatewayService } from '../api-gateway/aws-api-gateway.service';
import { AwsKmsService } from '../kms/aws-kms.service';
import { AwsSecretsManagerService } from '../secrets-manager/aws-secrets-manager.service';
import { AwsEcrService } from '../ecr/aws-ecr.service';
import { AwsDynamoDbService } from '../dynamodb/aws-dynamodb.service';
import { AwsElastiCacheService } from '../elasticache/aws-elasticache.service';
import { AwsSqsService } from '../sqs/aws-sqs.service';
import { AwsSnsService } from '../sns/aws-sns.service';
import { AwsWafService } from '../waf/aws-waf.service';
import { AwsGuardDutyService } from '../guardduty/aws-guardduty.service';

@Injectable()
export class AwsAssessmentSyncService {
    private readonly logger = new Logger(AwsAssessmentSyncService.name);

    constructor(
        private readonly networkingService: AwsNetworkingService,
        private readonly ec2Service: Ec2Service,
        private readonly routeTablesService: AwsRouteTablesService,
        private readonly ecsService: EcsService,
        private readonly loadBalancerService: AwsLoadBalancerService,
        private readonly securityGroupService: AwsSecurityGroupService,
        private readonly iamService: AwsIamRoleService,
        private readonly rdsService: AwsRdsService,
        private readonly s3Service: S3Service,
        private readonly cloudFrontService: CloudFrontService,
        private readonly eksService: AwsEksService,
        private readonly route53Service: AwsRoute53Service,
        private readonly cloudWatchService: AwsCloudWatchService,
        private readonly cloudTrailService: AwsCloudTrailService,
        private readonly lambdaService: AwsLambdaService,
        private readonly apiGatewayService: AwsApiGatewayService,
        private readonly kmsService: AwsKmsService,
        private readonly secretsManagerService: AwsSecretsManagerService,
        private readonly ecrService: AwsEcrService,
        private readonly dynamoDbService: AwsDynamoDbService,
        private readonly elastiCacheService: AwsElastiCacheService,
        private readonly sqsService: AwsSqsService,
        private readonly snsService: AwsSnsService,
        private readonly wafService: AwsWafService,
        private readonly guardDutyService: AwsGuardDutyService
    ) {}

    async syncAll(cloudAccountId: string, organizationId: string): Promise<void> {
        this.logger.log(`[${cloudAccountId}] Iniciando sincronização completa`);

        await this.runStep('VPCs', () => this.networkingService.syncVpcsFromAws(cloudAccountId, organizationId));
        await this.runStep('Subnets', () => this.networkingService.syncSubnetsFromAws(cloudAccountId, organizationId));
        await this.runStep('Route Tables', () => this.routeTablesService.syncRouteTablesFromAws(cloudAccountId, organizationId));
        await this.runStep('Security Groups', () => this.securityGroupService.syncSecurityGroupsFromAws(cloudAccountId, organizationId));
        await this.runStep('IAM Roles', () => this.iamService.syncRolesFromAws(cloudAccountId, organizationId, undefined, 'all'));
        await this.runStep('EC2 Instances', () => this.ec2Service.syncInstancesFromAws(cloudAccountId, organizationId));
        await this.runStep('ECS Clusters', () => this.ecsService.syncClustersFromAws(cloudAccountId, organizationId));
        await this.runStep('ECS Task Definitions', () => this.ecsService.syncTaskDefinitionsFromAws(cloudAccountId, organizationId));
        await this.runStep('ECS Services', () => this.ecsService.syncServicesFromAws(cloudAccountId, organizationId));
        await this.runStep('EKS Clusters', () => this.eksService.syncClustersFromAws(cloudAccountId, organizationId));
        await this.runStep('Load Balancers', () => this.loadBalancerService.syncLoadBalancersFromAws(cloudAccountId, organizationId));
        await this.runStep('RDS Instances', () => this.rdsService.syncInstancesFromAws(cloudAccountId, organizationId));
        await this.runStep('S3 Buckets', () => this.s3Service.syncBucketsFromAws(cloudAccountId, organizationId));
        await this.runStep('CloudFront', () => this.cloudFrontService.syncDistributionsFromAws(cloudAccountId, organizationId));
        await this.runStep('Route53', () => this.route53Service.syncHostedZonesFromAws(cloudAccountId, organizationId));
        await this.runStep('CloudWatch Alarms', () => this.cloudWatchService.syncAlarmsFromAws(cloudAccountId, organizationId));
        await this.runStep('CloudTrail', () => this.cloudTrailService.syncTrailsFromAws(cloudAccountId, organizationId));
        await this.runStep('Lambda Functions', () => this.lambdaService.syncFunctionsFromAws(cloudAccountId, organizationId));
        await this.runStep('API Gateway', () => this.apiGatewayService.syncApisFromAws(cloudAccountId, organizationId));
        await this.runStep('KMS Keys', () => this.kmsService.syncKeysFromAws(cloudAccountId, organizationId));
        await this.runStep('Secrets Manager', () => this.secretsManagerService.syncSecretsFromAws(cloudAccountId, organizationId));
        await this.runStep('ECR Repositories', () => this.ecrService.syncRepositoriesFromAws(cloudAccountId, organizationId));
        await this.runStep('DynamoDB Tables', () => this.dynamoDbService.syncTablesFromAws(cloudAccountId, organizationId));
        await this.runStep('ElastiCache Clusters', () => this.elastiCacheService.syncClustersFromAws(cloudAccountId, organizationId));
        await this.runStep('SQS Queues', () => this.sqsService.syncQueuesFromAws(cloudAccountId, organizationId));
        await this.runStep('SNS Topics', () => this.snsService.syncTopicsFromAws(cloudAccountId, organizationId));
        await this.runStep('WAF Web ACLs', () => this.wafService.syncWebAclsFromAws(cloudAccountId, organizationId));
        await this.runStep('GuardDuty Detectors', () => this.guardDutyService.syncDetectorsFromAws(cloudAccountId, organizationId));

        this.logger.log(`[${cloudAccountId}] Sincronização completa finalizada`);
    }

    private async runStep(name: string, fn: () => Promise<any>): Promise<void> {
        try {
            await fn();
            this.logger.debug(`[sync] ${name}: OK`);
        } catch (err) {
            // Log and continue — one failing sync should not abort the entire assessment
            this.logger.warn(`[sync] ${name}: FALHOU — ${(err as Error).message}`);
        }
    }
}
