import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

export interface AssessmentData {
    vpcs: AwsVpc[];
    subnets: AwsSubnet[];
    routeTables: AwsRouteTable[];
    ec2Instances: AwsEc2Instance[];
    ecsClusters: AwsEcsCluster[];
    ecsTaskDefinitions: AwsEcsTaskDefinition[];
    ecsServices: AwsEcsService[];
    eksClusters: AwsEksCluster[];
    loadBalancers: AwsLoadBalancer[];
    loadBalancerListeners: AwsLoadBalancerListener[];
    securityGroups: AwsSecurityGroup[];
    iamRoles: AwsIamRole[];
    rdsInstances: AwsRdsInstance[];
    s3Buckets: AwsS3Bucket[];
    cloudFrontDistributions: AwsCloudFrontDistribution[];
    route53HostedZones: AwsRoute53HostedZone[];
    cloudWatchAlarms: AwsCloudWatchAlarm[];
    cloudTrailTrails: AwsCloudTrailTrail[];
    lambdaFunctions: AwsLambdaFunction[];
    apiGatewayRestApis: AwsApiGatewayRestApi[];
    kmsKeys: AwsKmsKey[];
    secretsManagerSecrets: AwsSecretsManagerSecret[];
    ecrRepositories: AwsEcrRepository[];
    dynamoDbTables: AwsDynamoDbTable[];
    elastiCacheClusters: AwsElastiCacheCluster[];
    sqsQueues: AwsSqsQueue[];
    snsTopics: AwsSnsTopic[];
    wafWebAcls: AwsWafWebAcl[];
    guardDutyDetectors: AwsGuardDutyDetector[];
}

export interface AssessmentSummary {
    totalResources: number;
    byType: Record<string, number>;
}

@Injectable()
export class AwsAssessmentReportService {
    constructor(
        @InjectRepository(AwsVpc) private readonly vpcRepo: Repository<AwsVpc>,
        @InjectRepository(AwsSubnet) private readonly subnetRepo: Repository<AwsSubnet>,
        @InjectRepository(AwsRouteTable) private readonly routeTableRepo: Repository<AwsRouteTable>,
        @InjectRepository(AwsEc2Instance) private readonly ec2Repo: Repository<AwsEc2Instance>,
        @InjectRepository(AwsEcsCluster) private readonly ecsClusterRepo: Repository<AwsEcsCluster>,
        @InjectRepository(AwsEcsTaskDefinition) private readonly ecsTaskDefRepo: Repository<AwsEcsTaskDefinition>,
        @InjectRepository(AwsEcsService) private readonly ecsServiceRepo: Repository<AwsEcsService>,
        @InjectRepository(AwsEksCluster) private readonly eksRepo: Repository<AwsEksCluster>,
        @InjectRepository(AwsLoadBalancer) private readonly lbRepo: Repository<AwsLoadBalancer>,
        @InjectRepository(AwsLoadBalancerListener) private readonly lbListenerRepo: Repository<AwsLoadBalancerListener>,
        @InjectRepository(AwsSecurityGroup) private readonly sgRepo: Repository<AwsSecurityGroup>,
        @InjectRepository(AwsIamRole) private readonly iamRepo: Repository<AwsIamRole>,
        @InjectRepository(AwsRdsInstance) private readonly rdsRepo: Repository<AwsRdsInstance>,
        @InjectRepository(AwsS3Bucket) private readonly s3Repo: Repository<AwsS3Bucket>,
        @InjectRepository(AwsCloudFrontDistribution) private readonly cfRepo: Repository<AwsCloudFrontDistribution>,
        @InjectRepository(AwsRoute53HostedZone) private readonly r53Repo: Repository<AwsRoute53HostedZone>,
        @InjectRepository(AwsCloudWatchAlarm) private readonly cwRepo: Repository<AwsCloudWatchAlarm>,
        @InjectRepository(AwsCloudTrailTrail) private readonly ctRepo: Repository<AwsCloudTrailTrail>,
        @InjectRepository(AwsLambdaFunction) private readonly lambdaRepo: Repository<AwsLambdaFunction>,
        @InjectRepository(AwsApiGatewayRestApi) private readonly apigwRepo: Repository<AwsApiGatewayRestApi>,
        @InjectRepository(AwsKmsKey) private readonly kmsRepo: Repository<AwsKmsKey>,
        @InjectRepository(AwsSecretsManagerSecret) private readonly smRepo: Repository<AwsSecretsManagerSecret>,
        @InjectRepository(AwsEcrRepository) private readonly ecrRepo: Repository<AwsEcrRepository>,
        @InjectRepository(AwsDynamoDbTable) private readonly dynamoRepo: Repository<AwsDynamoDbTable>,
        @InjectRepository(AwsElastiCacheCluster) private readonly elastiRepo: Repository<AwsElastiCacheCluster>,
        @InjectRepository(AwsSqsQueue) private readonly sqsRepo: Repository<AwsSqsQueue>,
        @InjectRepository(AwsSnsTopic) private readonly snsRepo: Repository<AwsSnsTopic>,
        @InjectRepository(AwsWafWebAcl) private readonly wafRepo: Repository<AwsWafWebAcl>,
        @InjectRepository(AwsGuardDutyDetector) private readonly gdRepo: Repository<AwsGuardDutyDetector>
    ) {}

    async collectAllData(cloudAccountId: string): Promise<AssessmentData> {
        const byAccount = { cloudAccountId };

        // Resources with direct cloudAccountId
        const [
            vpcs,
            ecsClusters,
            ecsTaskDefinitions,
            ecsServices,
            eksClusters,
            loadBalancers,
            securityGroups,
            iamRoles,
            rdsInstances,
            s3Buckets,
            cloudFrontDistributions,
            route53HostedZones,
            cloudWatchAlarms,
            cloudTrailTrails,
            lambdaFunctions,
            apiGatewayRestApis,
            kmsKeys,
            secretsManagerSecrets,
            ecrRepositories,
            dynamoDbTables,
            elastiCacheClusters,
            sqsQueues,
            snsTopics,
            wafWebAcls,
            guardDutyDetectors,
        ] = await Promise.all([
            this.vpcRepo.find({ where: byAccount }),
            this.ecsClusterRepo.find({ where: byAccount }),
            this.ecsTaskDefRepo.find({ where: byAccount }),
            this.ecsServiceRepo.find({ where: byAccount }),
            this.eksRepo.find({ where: byAccount }),
            this.lbRepo.find({ where: byAccount }),
            this.sgRepo.find({ where: byAccount }),
            this.iamRepo.find({ where: byAccount }),
            this.rdsRepo.find({ where: byAccount }),
            this.s3Repo.find({ where: byAccount }),
            this.cfRepo.find({ where: byAccount }),
            this.r53Repo.find({ where: byAccount }),
            this.cwRepo.find({ where: byAccount }),
            this.ctRepo.find({ where: byAccount }),
            this.lambdaRepo.find({ where: byAccount }),
            this.apigwRepo.find({ where: byAccount }),
            this.kmsRepo.find({ where: byAccount }),
            this.smRepo.find({ where: byAccount }),
            this.ecrRepo.find({ where: byAccount }),
            this.dynamoRepo.find({ where: byAccount }),
            this.elastiRepo.find({ where: byAccount }),
            this.sqsRepo.find({ where: byAccount }),
            this.snsRepo.find({ where: byAccount }),
            this.wafRepo.find({ where: byAccount }),
            this.gdRepo.find({ where: byAccount }),
        ]);

        // Resources linked via VPC FK (no direct cloudAccountId)
        const vpcUuids = vpcs.map((v) => v.id);
        const [subnets, routeTables, ec2Instances] = await Promise.all([
            vpcUuids.length > 0 ? this.subnetRepo.find({ where: { vpcId: In(vpcUuids) } }) : Promise.resolve([]),
            vpcUuids.length > 0 ? this.routeTableRepo.find({ where: { vpcId: In(vpcUuids) } }) : Promise.resolve([]),
            vpcUuids.length > 0 ? this.ec2Repo.find({ where: { vpcId: In(vpcUuids) } }) : Promise.resolve([]),
        ]);

        // LB Listeners linked via LB FK
        const lbUuids = loadBalancers.map((lb) => lb.id);
        const loadBalancerListeners = lbUuids.length > 0 ? await this.lbListenerRepo.find({ where: { loadBalancerId: In(lbUuids) } }) : [];

        return {
            vpcs,
            subnets,
            routeTables,
            ec2Instances,
            ecsClusters,
            ecsTaskDefinitions,
            ecsServices,
            eksClusters,
            loadBalancers,
            loadBalancerListeners,
            securityGroups,
            iamRoles,
            rdsInstances,
            s3Buckets,
            cloudFrontDistributions,
            route53HostedZones,
            cloudWatchAlarms,
            cloudTrailTrails,
            lambdaFunctions,
            apiGatewayRestApis,
            kmsKeys,
            secretsManagerSecrets,
            ecrRepositories,
            dynamoDbTables,
            elastiCacheClusters,
            sqsQueues,
            snsTopics,
            wafWebAcls,
            guardDutyDetectors,
        };
    }

    buildSummary(data: AssessmentData): AssessmentSummary {
        const byType: Record<string, number> = {
            VPC: data.vpcs.length,
            Subnet: data.subnets.length,
            'Route Table': data.routeTables.length,
            'EC2 Instance': data.ec2Instances.length,
            'ECS Cluster': data.ecsClusters.length,
            'ECS Task Definition': data.ecsTaskDefinitions.length,
            'ECS Service': data.ecsServices.length,
            'EKS Cluster': data.eksClusters.length,
            'Load Balancer': data.loadBalancers.length,
            'LB Listener': data.loadBalancerListeners.length,
            'Security Group': data.securityGroups.length,
            'IAM Role': data.iamRoles.length,
            'RDS Instance': data.rdsInstances.length,
            'S3 Bucket': data.s3Buckets.length,
            'CloudFront Distribution': data.cloudFrontDistributions.length,
            'Route53 Hosted Zone': data.route53HostedZones.length,
            'CloudWatch Alarm': data.cloudWatchAlarms.length,
            'CloudTrail Trail': data.cloudTrailTrails.length,
            'Lambda Function': data.lambdaFunctions.length,
            'API Gateway REST API': data.apiGatewayRestApis.length,
            'KMS Key': data.kmsKeys.length,
            'Secrets Manager Secret': data.secretsManagerSecrets.length,
            'ECR Repository': data.ecrRepositories.length,
            'DynamoDB Table': data.dynamoDbTables.length,
            'ElastiCache Cluster': data.elastiCacheClusters.length,
            'SQS Queue': data.sqsQueues.length,
            'SNS Topic': data.snsTopics.length,
            'WAF Web ACL': data.wafWebAcls.length,
            'GuardDuty Detector': data.guardDutyDetectors.length,
        };
        const totalResources = Object.values(byType).reduce((a, b) => a + b, 0);
        return { totalResources, byType };
    }
}
