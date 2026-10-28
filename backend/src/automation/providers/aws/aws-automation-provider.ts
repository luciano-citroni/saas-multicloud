import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { CreateAppCommand, DeleteAppCommand, type AmplifyClient } from '@aws-sdk/client-amplify';
import { CreateRestApiCommand, DeleteRestApiCommand, type APIGatewayClient } from '@aws-sdk/client-api-gateway';
import {
    CreateDistributionCommand,
    DeleteDistributionCommand,
    GetDistributionConfigCommand,
    UpdateDistributionCommand,
    type CloudFrontClient,
} from '@aws-sdk/client-cloudfront';
import {
    AllocateAddressCommand,
    CreateNatGatewayCommand,
    CreateRouteTableCommand,
    CreateSecurityGroupCommand,
    CreateSubnetCommand,
    CreateVpcCommand,
    DeleteNatGatewayCommand,
    DeleteRouteTableCommand,
    DeleteSecurityGroupCommand,
    DeleteSubnetCommand,
    DeleteVpcCommand,
    ModifySubnetAttributeCommand,
    ReleaseAddressCommand,
    RunInstancesCommand,
    TerminateInstancesCommand,
    type EC2Client,
} from '@aws-sdk/client-ec2';
import { CreateRepositoryCommand, DeleteRepositoryCommand, type ECRClient } from '@aws-sdk/client-ecr';
import { CreateClusterCommand, DeleteClusterCommand, RegisterTaskDefinitionCommand, type ECSClient } from '@aws-sdk/client-ecs';
import {
    CreateLoadBalancerCommand,
    DeleteLoadBalancerCommand,
    type ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { AttachRolePolicyCommand, CreateRoleCommand, DeleteRoleCommand, DetachRolePolicyCommand, ListAttachedRolePoliciesCommand, type IAMClient } from '@aws-sdk/client-iam';
import { CreateFunctionCommand, DeleteFunctionCommand, PackageType, type LambdaClient } from '@aws-sdk/client-lambda';
import { CreateDBInstanceCommand, DeleteDBInstanceCommand, type RDSClient } from '@aws-sdk/client-rds';
import {
    CreateBucketCommand,
    DeleteBucketCommand,
    DeleteObjectsCommand,
    HeadBucketCommand,
    ListObjectVersionsCommand,
    PutBucketEncryptionCommand,
    PutBucketVersioningCommand,
    PutPublicAccessBlockCommand,
    type S3Client,
} from '@aws-sdk/client-s3';
import { AwsConnectorService } from '../../../aws/aws-connector.service';
import { ErrorMessages } from '../../../common/messages/error-messages';
import { AUTOMATION_ACTION_TYPES } from '../../constants';

export interface AwsAutomationContext {
    cloudAccountId: string;
    tenantId: string;
}

export interface ActionExecutionResult {
    output: Record<string, unknown>;
    resourceId: string | null;
}

function str(value: unknown, fallback = ''): string {
    if (value == null) return fallback;
    return String(value);
}

function num(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function csvList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

@Injectable()
export class AwsAutomationProvider {
    private readonly logger = new Logger(AwsAutomationProvider.name);

    constructor(private readonly connector: AwsConnectorService) {}

    async executeAction(
        actionType: string,
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        switch (actionType) {
            case AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE:
                return this.createS3Bucket(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE:
                return this.createCloudFrontDistribution(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_ECS_CLUSTER_CREATE:
                return this.createEcsCluster(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_ECS_TASK_DEFINITION_CREATE:
                return this.createEcsTaskDefinition(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_ECR_REPOSITORY_CREATE:
                return this.createEcrRepository(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_LOAD_BALANCER_CREATE:
                return this.createLoadBalancer(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_LAMBDA_FUNCTION_CREATE:
                return this.createLambdaFunction(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_IAM_ROLE_CREATE:
                return this.createIamRole(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_SECURITY_GROUP_CREATE:
                return this.createSecurityGroup(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_VPC_CREATE:
                return this.createVpc(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_SUBNET_CREATE:
                return this.createSubnet(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_ROUTE_TABLE_CREATE:
                return this.createRouteTable(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_NAT_GATEWAY_CREATE:
                return this.createNatGateway(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_RDS_INSTANCE_CREATE:
                return this.createRdsInstance(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_EC2_INSTANCE_CREATE:
                return this.createEc2Instance(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_AMPLIFY_APP_CREATE:
                return this.createAmplifyApp(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_API_GATEWAY_CREATE:
                return this.createApiGateway(config, context);
            default:
                throw new InternalServerErrorException(ErrorMessages.AUTOMATION.UNSUPPORTED_RESOURCE_TYPE);
        }
    }

    private fail(operation: string, err: unknown): never {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        this.logger.error(`${operation} falhou: ${message}`);
        throw new InternalServerErrorException(`Falha ao executar ${operation}: ${message}`);
    }

    private async createS3Bucket(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const client: S3Client = await this.connector.getS3Client(context.cloudAccountId, context.tenantId);
        const bucketName = str(config.bucketName);
        const region = str(config.region, 'us-east-1');

        let alreadyExists = false;

        try {
            await client.send(new HeadBucketCommand({ Bucket: bucketName }));
            alreadyExists = true;
            this.logger.log(`S3 bucket já existe: ${bucketName}`);
        } catch {
            try {
                await client.send(
                    new CreateBucketCommand({
                        Bucket: bucketName,
                        ...(region !== 'us-east-1'
                            ? { CreateBucketConfiguration: { LocationConstraint: region as never } }
                            : {}),
                    }),
                );
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Erro desconhecido';
                if (message.includes('BucketAlreadyOwnedByYou') || message.includes('BucketAlreadyExists')) {
                    alreadyExists = true;
                } else {
                    this.fail('S3 CreateBucket', err);
                }
            }
        }

        if (!alreadyExists) {
            if (config.versioning) {
                await client
                    .send(
                        new PutBucketVersioningCommand({
                            Bucket: bucketName,
                            VersioningConfiguration: { Status: 'Enabled' },
                        }),
                    )
                    .catch((err: Error) => this.logger.warn(`S3 versioning falhou: ${err.message}`));
            }

            if (config.encryption !== false) {
                await client
                    .send(
                        new PutBucketEncryptionCommand({
                            Bucket: bucketName,
                            ServerSideEncryptionConfiguration: {
                                Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
                            },
                        }),
                    )
                    .catch((err: Error) => this.logger.warn(`S3 encryption falhou: ${err.message}`));
            }

            if (config.publicAccessBlock !== false) {
                await client
                    .send(
                        new PutPublicAccessBlockCommand({
                            Bucket: bucketName,
                            PublicAccessBlockConfiguration: {
                                BlockPublicAcls: true,
                                IgnorePublicAcls: true,
                                BlockPublicPolicy: true,
                                RestrictPublicBuckets: true,
                            },
                        }),
                    )
                    .catch((err: Error) => this.logger.warn(`S3 public access block falhou: ${err.message}`));
            }
        }

        const bucketArn = `arn:aws:s3:::${bucketName}`;
        const bucketDomainName =
            region === 'us-east-1' ? `${bucketName}.s3.amazonaws.com` : `${bucketName}.s3.${region}.amazonaws.com`;

        return {
            output: { bucketName, bucketArn, bucketDomainName, alreadyExists },
            resourceId: bucketName,
        };
    }

    private async createCloudFrontDistribution(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const client: CloudFrontClient = await this.connector.getCloudFrontClient(
            context.cloudAccountId,
            context.tenantId,
        );

        const originDomainName = str(config.originDomainName ?? config.origin);
        const comment = config.comment ? str(config.comment) : 'Created by SaaS MultiCloud Automation';
        const enabled = config.enabled !== false;
        const priceClass = str(config.priceClass, 'PriceClass_100');

        const result = await client
            .send(
                new CreateDistributionCommand({
                    DistributionConfig: {
                        CallerReference: `${Date.now()}-${originDomainName}`,
                        Comment: comment,
                        Enabled: enabled,
                        PriceClass: priceClass as never,
                        Origins: {
                            Quantity: 1,
                            Items: [
                                {
                                    Id: 's3-origin',
                                    DomainName: originDomainName,
                                    S3OriginConfig: { OriginAccessIdentity: '' },
                                },
                            ],
                        },
                        DefaultCacheBehavior: {
                            TargetOriginId: 's3-origin',
                            ViewerProtocolPolicy: 'redirect-to-https',
                            AllowedMethods: {
                                Quantity: 2,
                                Items: ['GET', 'HEAD'],
                                CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] },
                            },
                            ForwardedValues: {
                                QueryString: false,
                                Cookies: { Forward: 'none' },
                            },
                            MinTTL: 0,
                            DefaultTTL: 86400,
                            MaxTTL: 31536000,
                        },
                        DefaultRootObject: 'index.html',
                    },
                }),
            )
            .catch((err) => this.fail('CloudFront CreateDistribution', err));

        const distribution = result.Distribution;
        const distributionId = distribution?.Id;
        const domainName = distribution?.DomainName;
        const arn = distribution?.ARN;

        if (!distributionId || !domainName) {
            throw new InternalServerErrorException('CloudFront CreateDistribution não retornou identificadores');
        }

        return {
            output: { distributionId, domainName, arn: arn ?? null },
            resourceId: distributionId,
        };
    }

    private async createEcsCluster(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-2');
        const clusterName = str(config.clusterName);
        const client: ECSClient = await this.connector.getEcsClient(context.cloudAccountId, context.tenantId, region);
        const result = await client
            .send(
                new CreateClusterCommand({
                    clusterName,
                    tags: [
                        { key: 'ManagedBy', value: 'saas-multicloud' },
                        { key: 'Name', value: clusterName },
                    ],
                }),
            )
            .catch((err) => this.fail('ECS CreateCluster', err));

        const clusterArn = result.cluster?.clusterArn ?? null;
        return {
            output: { clusterArn, clusterName: result.cluster?.clusterName ?? clusterName },
            resourceId: clusterArn,
        };
    }

    private async createEcsTaskDefinition(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-2');
        const family = str(config.family);
        const image = str(config.image);
        const executionRoleArn = str(config.executionRoleArn);
        const cpu = str(config.cpu, '256');
        const memory = str(config.memory, '512');
        const containerName = str(config.containerName, 'app');
        const containerPort = num(config.containerPort, 80);
        const client: ECSClient = await this.connector.getEcsClient(context.cloudAccountId, context.tenantId, region);

        const result = await client
            .send(
                new RegisterTaskDefinitionCommand({
                    family,
                    networkMode: 'awsvpc',
                    requiresCompatibilities: ['FARGATE'],
                    cpu,
                    memory,
                    executionRoleArn,
                    containerDefinitions: [
                        {
                            name: containerName,
                            image,
                            essential: true,
                            portMappings: [{ containerPort, protocol: 'tcp' }],
                        },
                    ],
                    tags: [{ key: 'ManagedBy', value: 'saas-multicloud' }],
                }),
            )
            .catch((err) => this.fail('ECS RegisterTaskDefinition', err));

        const taskDefinitionArn = result.taskDefinition?.taskDefinitionArn ?? null;
        return {
            output: {
                taskDefinitionArn,
                family: result.taskDefinition?.family ?? family,
                revision: result.taskDefinition?.revision ?? null,
            },
            resourceId: taskDefinitionArn,
        };
    }

    private async createEcrRepository(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-2');
        const repositoryName = str(config.repositoryName);
        const client: ECRClient = await this.connector.getEcrClient(context.cloudAccountId, context.tenantId, region);
        const result = await client
            .send(
                new CreateRepositoryCommand({
                    repositoryName,
                    imageScanningConfiguration: { scanOnPush: config.imageScanning !== false },
                    tags: [{ Key: 'ManagedBy', Value: 'saas-multicloud' }],
                }),
            )
            .catch((err) => this.fail('ECR CreateRepository', err));

        const repo = result.repository;
        return {
            output: {
                repositoryArn: repo?.repositoryArn ?? null,
                repositoryUri: repo?.repositoryUri ?? null,
                repositoryName: repo?.repositoryName ?? repositoryName,
            },
            resourceId: repo?.repositoryArn ?? repositoryName,
        };
    }

    private async createLoadBalancer(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-2');
        const name = str(config.name);
        const subnetIds = csvList(config.subnetIds);
        const securityGroupIds = csvList(config.securityGroupIds);
        const scheme = str(config.scheme, 'internet-facing') as 'internet-facing' | 'internal';
        const client: ElasticLoadBalancingV2Client = await this.connector.getElbV2Client(
            context.cloudAccountId,
            context.tenantId,
            region,
        );

        const result = await client
            .send(
                new CreateLoadBalancerCommand({
                    Name: name,
                    Type: 'application',
                    Scheme: scheme,
                    Subnets: subnetIds,
                    SecurityGroups: securityGroupIds.length ? securityGroupIds : undefined,
                    Tags: [{ Key: 'ManagedBy', Value: 'saas-multicloud' }],
                }),
            )
            .catch((err) => this.fail('ELBv2 CreateLoadBalancer', err));

        const lb = result.LoadBalancers?.[0];
        const loadBalancerArn = lb?.LoadBalancerArn ?? null;
        return {
            output: {
                loadBalancerArn,
                dnsName: lb?.DNSName ?? null,
                name: lb?.LoadBalancerName ?? name,
            },
            resourceId: loadBalancerArn,
        };
    }

    private minimalLambdaZip(): Buffer {
        return Buffer.from(
            'UEsDBAoAAAAAAKJaJ1cAAAAAAAAAAAAAAAAIABAAaW5kZXguanNVWAwAqfY+ZSj2PmUAAGV4cG9ydHMuaGFuZGxlciA9IGFzeW5jICgpID0+ICh7IHN0YXR1c0NvZGU6IDIwMCB9KTsKUEsBAj8ACgAAAAAAolonVwAAAAAAAAAAAAAAAAgAEAAAAAAAAAAAAKSBAAAAAGluZGV4LmpzVVgMAKn2PmUo9j5lAABQSwUGAAAAAAEAAQBCAAAAPgAAAAAA',
            'base64',
        );
    }

    private async createLambdaFunction(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-1');
        const functionName = str(config.functionName);
        const client: LambdaClient = await this.connector.getLambdaClient(
            context.cloudAccountId,
            context.tenantId,
            region,
        );

        const result = await client
            .send(
                new CreateFunctionCommand({
                    FunctionName: functionName,
                    Runtime: str(config.runtime, 'nodejs20.x') as never,
                    Handler: str(config.handler, 'index.handler'),
                    Role: str(config.roleArn),
                    MemorySize: num(config.memorySize, 128),
                    Timeout: num(config.timeout, 30),
                    Description: 'Created by SaaS MultiCloud',
                    PackageType: PackageType.Zip,
                    Code: { ZipFile: this.minimalLambdaZip() },
                    Tags: { ManagedBy: 'saas-multicloud' },
                }),
            )
            .catch((err) => this.fail('Lambda CreateFunction', err));

        const functionArn = result.FunctionArn ?? null;
        return {
            output: { functionArn, functionName: result.FunctionName ?? functionName },
            resourceId: functionArn,
        };
    }

    private async createIamRole(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const roleName = str(config.roleName);
        const assumeService = str(config.assumeService, 'ec2.amazonaws.com');
        const path = str(config.path, '/');
        const managedPolicyArn = config.managedPolicyArn ? str(config.managedPolicyArn) : '';
        const client: IAMClient = await this.connector.getIamClient(context.cloudAccountId, context.tenantId);

        const assumeRolePolicyDocument = JSON.stringify({
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { Service: assumeService },
                    Action: 'sts:AssumeRole',
                },
            ],
        });

        const result = await client
            .send(
                new CreateRoleCommand({
                    RoleName: roleName,
                    AssumeRolePolicyDocument: assumeRolePolicyDocument,
                    Path: path,
                    Tags: [{ Key: 'ManagedBy', Value: 'saas-multicloud' }],
                }),
            )
            .catch((err) => this.fail('IAM CreateRole', err));

        if (managedPolicyArn) {
            await client
                .send(new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: managedPolicyArn }))
                .catch((err: Error) => this.logger.warn(`AttachRolePolicy falhou: ${err.message}`));
        }

        const roleArn = result.Role?.Arn ?? null;
        return {
            output: { roleArn, roleName: result.Role?.RoleName ?? roleName },
            resourceId: roleArn,
        };
    }

    private async createSecurityGroup(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-2');
        const groupName = str(config.groupName);
        const vpcId = str(config.vpcId);
        const description = str(config.description, 'Created by SaaS MultiCloud');
        const client: EC2Client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);

        const result = await client
            .send(
                new CreateSecurityGroupCommand({
                    GroupName: groupName,
                    Description: description,
                    VpcId: vpcId,
                    TagSpecifications: [
                        {
                            ResourceType: 'security-group',
                            Tags: [
                                { Key: 'Name', Value: groupName },
                                { Key: 'ManagedBy', Value: 'saas-multicloud' },
                            ],
                        },
                    ],
                }),
            )
            .catch((err) => this.fail('EC2 CreateSecurityGroup', err));

        const groupId = result.GroupId ?? null;
        return {
            output: { groupId, groupName, vpcId },
            resourceId: groupId,
        };
    }

    private async createVpc(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-2');
        const name = str(config.name);
        const cidrBlock = str(config.cidrBlock, '10.0.0.0/16');
        const client: EC2Client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);

        const result = await client
            .send(
                new CreateVpcCommand({
                    CidrBlock: cidrBlock,
                    TagSpecifications: [
                        {
                            ResourceType: 'vpc',
                            Tags: [
                                { Key: 'Name', Value: name },
                                { Key: 'ManagedBy', Value: 'saas-multicloud' },
                            ],
                        },
                    ],
                }),
            )
            .catch((err) => this.fail('EC2 CreateVpc', err));

        const vpcId = result.Vpc?.VpcId ?? null;
        return {
            output: { vpcId, cidrBlock: result.Vpc?.CidrBlock ?? cidrBlock, name },
            resourceId: vpcId,
        };
    }

    private async createSubnet(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-2');
        const name = str(config.name);
        const vpcId = str(config.vpcId);
        const cidrBlock = str(config.cidrBlock);
        const availabilityZone = str(config.availabilityZone);
        const client: EC2Client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);

        const result = await client
            .send(
                new CreateSubnetCommand({
                    VpcId: vpcId,
                    CidrBlock: cidrBlock,
                    AvailabilityZone: availabilityZone,
                    TagSpecifications: [
                        {
                            ResourceType: 'subnet',
                            Tags: [
                                { Key: 'Name', Value: name },
                                { Key: 'ManagedBy', Value: 'saas-multicloud' },
                            ],
                        },
                    ],
                }),
            )
            .catch((err) => this.fail('EC2 CreateSubnet', err));

        const subnetId = result.Subnet?.SubnetId ?? null;
        if (subnetId && config.mapPublicIpOnLaunch) {
            await client
                .send(new ModifySubnetAttributeCommand({ SubnetId: subnetId, MapPublicIpOnLaunch: { Value: true } }))
                .catch((err: Error) => this.logger.warn(`ModifySubnetAttribute falhou: ${err.message}`));
        }

        return {
            output: {
                subnetId,
                vpcId,
                cidrBlock: result.Subnet?.CidrBlock ?? cidrBlock,
                availabilityZone: result.Subnet?.AvailabilityZone ?? availabilityZone,
            },
            resourceId: subnetId,
        };
    }

    private async createRouteTable(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-2');
        const name = str(config.name);
        const vpcId = str(config.vpcId);
        const client: EC2Client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);

        const result = await client
            .send(
                new CreateRouteTableCommand({
                    VpcId: vpcId,
                    TagSpecifications: [
                        {
                            ResourceType: 'route-table',
                            Tags: [
                                { Key: 'Name', Value: name },
                                { Key: 'ManagedBy', Value: 'saas-multicloud' },
                            ],
                        },
                    ],
                }),
            )
            .catch((err) => this.fail('EC2 CreateRouteTable', err));

        const routeTableId = result.RouteTable?.RouteTableId ?? null;
        return {
            output: { routeTableId, vpcId },
            resourceId: routeTableId,
        };
    }

    private async createNatGateway(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-2');
        const name = str(config.name);
        const subnetId = str(config.subnetId);
        const client: EC2Client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);

        let allocationId = config.allocationId ? str(config.allocationId) : '';
        if (!allocationId) {
            const eip = await client
                .send(new AllocateAddressCommand({ Domain: 'vpc' }))
                .catch((err) => this.fail('EC2 AllocateAddress', err));
            allocationId = eip.AllocationId ?? '';
            if (!allocationId) throw new InternalServerErrorException('AllocateAddress não retornou AllocationId');
        }

        const result = await client
            .send(
                new CreateNatGatewayCommand({
                    SubnetId: subnetId,
                    AllocationId: allocationId,
                    TagSpecifications: [
                        {
                            ResourceType: 'natgateway',
                            Tags: [
                                { Key: 'Name', Value: name },
                                { Key: 'ManagedBy', Value: 'saas-multicloud' },
                            ],
                        },
                    ],
                }),
            )
            .catch((err) => this.fail('EC2 CreateNatGateway', err));

        const natGatewayId = result.NatGateway?.NatGatewayId ?? null;
        return {
            output: { natGatewayId, subnetId, allocationId },
            resourceId: natGatewayId,
        };
    }

    private async createRdsInstance(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-1');
        const dbInstanceIdentifier = str(config.dbInstanceIdentifier);
        const client: RDSClient = await this.connector.getRdsClient(context.cloudAccountId, context.tenantId, region);

        const result = await client
            .send(
                new CreateDBInstanceCommand({
                    DBInstanceIdentifier: dbInstanceIdentifier,
                    DBInstanceClass: str(config.dbInstanceClass, 'db.t3.micro'),
                    Engine: str(config.engine, 'postgres'),
                    MasterUsername: str(config.masterUsername),
                    MasterUserPassword: str(config.masterUserPassword),
                    AllocatedStorage: num(config.allocatedStorage, 20),
                    MultiAZ: config.multiAz === true,
                    PubliclyAccessible: false,
                    StorageEncrypted: true,
                    Tags: [{ Key: 'ManagedBy', Value: 'saas-multicloud' }],
                }),
            )
            .catch((err) => this.fail('RDS CreateDBInstance', err));

        const endpoint = result.DBInstance?.Endpoint?.Address ?? null;
        return {
            output: {
                dbInstanceIdentifier: result.DBInstance?.DBInstanceIdentifier ?? dbInstanceIdentifier,
                endpoint,
            },
            resourceId: result.DBInstance?.DBInstanceIdentifier ?? dbInstanceIdentifier,
        };
    }

    private async createEc2Instance(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-1');
        const client: EC2Client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);
        const name = config.name ? str(config.name) : '';
        const securityGroupIds = csvList(config.securityGroupIds);

        const result = await client
            .send(
                new RunInstancesCommand({
                    ImageId: str(config.amiId),
                    InstanceType: str(config.instanceType, 't3.micro') as never,
                    MinCount: 1,
                    MaxCount: 1,
                    KeyName: config.keyName ? str(config.keyName) : undefined,
                    SubnetId: config.subnetId ? str(config.subnetId) : undefined,
                    SecurityGroupIds: securityGroupIds.length ? securityGroupIds : undefined,
                    TagSpecifications: [
                        {
                            ResourceType: 'instance',
                            Tags: [
                                { Key: 'ManagedBy', Value: 'saas-multicloud' },
                                ...(name ? [{ Key: 'Name', Value: name }] : []),
                            ],
                        },
                    ],
                }),
            )
            .catch((err) => this.fail('EC2 RunInstances', err));

        const instanceId = result.Instances?.[0]?.InstanceId ?? null;
        if (!instanceId) throw new InternalServerErrorException('EC2 RunInstances não retornou instanceId');
        return { output: { instanceId }, resourceId: instanceId };
    }

    private async createAmplifyApp(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-1');
        const name = str(config.name);
        const client: AmplifyClient = await this.connector.getAmplifyClient(
            context.cloudAccountId,
            context.tenantId,
            region,
        );

        const result = await client
            .send(
                new CreateAppCommand({
                    name,
                    repository: config.repository ? str(config.repository) : undefined,
                    platform: str(config.platform, 'WEB') as never,
                    tags: { ManagedBy: 'saas-multicloud' },
                }),
            )
            .catch((err) => this.fail('Amplify CreateApp', err));

        const app = result.app;
        return {
            output: {
                appId: app?.appId ?? null,
                appArn: app?.appArn ?? null,
                defaultDomain: app?.defaultDomain ?? null,
            },
            resourceId: app?.appId ?? null,
        };
    }

    private async createApiGateway(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const region = str(config.region, 'us-east-1');
        const name = str(config.name);
        const client: APIGatewayClient = await this.connector.getApiGatewayClient(
            context.cloudAccountId,
            context.tenantId,
            region,
        );

        const result = await client
            .send(
                new CreateRestApiCommand({
                    name,
                    description: config.description ? str(config.description) : 'Created by SaaS MultiCloud',
                    endpointConfiguration: {
                        types: [str(config.endpointType, 'REGIONAL') as never],
                    },
                    tags: { ManagedBy: 'saas-multicloud' },
                }),
            )
            .catch((err) => this.fail('API Gateway CreateRestApi', err));

        return {
            output: {
                restApiId: result.id ?? null,
                name: result.name ?? name,
                rootResourceId: result.rootResourceId ?? null,
            },
            resourceId: result.id ?? null,
        };
    }

    async destroyResource(
        resourceType: string,
        resourceId: string,
        region: string,
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<void> {
        const actionType = str(config.actionType, resourceType);
        switch (actionType) {
            case AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE:
                return this.destroyS3Bucket(resourceId, context);
            case AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE:
                return this.destroyCloudFront(resourceId, context);
            case AUTOMATION_ACTION_TYPES.AWS_ECS_CLUSTER_CREATE:
                return this.destroyEcsCluster(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_ECR_REPOSITORY_CREATE:
                return this.destroyEcr(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_LOAD_BALANCER_CREATE:
                return this.destroyLoadBalancer(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_LAMBDA_FUNCTION_CREATE:
                return this.destroyLambda(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_IAM_ROLE_CREATE:
                return this.destroyIamRole(resourceId, context);
            case AUTOMATION_ACTION_TYPES.AWS_SECURITY_GROUP_CREATE:
                return this.destroySecurityGroup(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_VPC_CREATE:
                return this.destroyVpc(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_SUBNET_CREATE:
                return this.destroySubnet(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_ROUTE_TABLE_CREATE:
                return this.destroyRouteTable(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_NAT_GATEWAY_CREATE:
                return this.destroyNatGateway(resourceId, region, config, context);
            case AUTOMATION_ACTION_TYPES.AWS_RDS_INSTANCE_CREATE:
                return this.destroyRds(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_EC2_INSTANCE_CREATE:
                return this.destroyEc2(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_AMPLIFY_APP_CREATE:
                return this.destroyAmplify(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_API_GATEWAY_CREATE:
                return this.destroyApiGateway(resourceId, region, context);
            case AUTOMATION_ACTION_TYPES.AWS_ECS_TASK_DEFINITION_CREATE:
                this.logger.warn(`Task definition ${resourceId} não é removida automaticamente no rollback`);
                return;
            default:
                if (resourceType.startsWith('AWS::')) {
                    this.logger.warn(`Recurso CFN ${resourceType} ${resourceId} será removido via stack`);
                    return;
                }
                throw new InternalServerErrorException(ErrorMessages.AUTOMATION.UNSUPPORTED_RESOURCE_TYPE);
        }
    }

    private async destroyS3Bucket(bucketName: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getS3Client(context.cloudAccountId, context.tenantId);
        try {
            const versions = await client.send(new ListObjectVersionsCommand({ Bucket: bucketName }));
            const objects = [
                ...(versions.Versions ?? []).map((item) => ({ Key: item.Key!, VersionId: item.VersionId })),
                ...(versions.DeleteMarkers ?? []).map((item) => ({ Key: item.Key!, VersionId: item.VersionId })),
            ].filter((item) => item.Key);
            if (objects.length) {
                await client.send(new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: objects } }));
            }
        } catch (err) {
            this.logger.warn(`S3 empty bucket falhou: ${err instanceof Error ? err.message : 'erro'}`);
        }
        await client.send(new DeleteBucketCommand({ Bucket: bucketName })).catch((err) => this.fail('S3 DeleteBucket', err));
    }

    private async destroyCloudFront(distributionId: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getCloudFrontClient(context.cloudAccountId, context.tenantId);
        const current = await client
            .send(new GetDistributionConfigCommand({ Id: distributionId }))
            .catch((err) => this.fail('CloudFront GetDistributionConfig', err));
        const config = current.DistributionConfig;
        let etag = current.ETag;
        if (!config || !etag) return;
        if (config.Enabled) {
            config.Enabled = false;
            const updated = await client
                .send(new UpdateDistributionCommand({ Id: distributionId, IfMatch: etag, DistributionConfig: config }))
                .catch((err: Error) => {
                    this.logger.warn(`CloudFront disable: ${err.message}`);
                    return null;
                });
            etag = updated?.ETag ?? etag;
            this.logger.warn(
                `CloudFront ${distributionId} desabilitada; exclusão completa exige status Deployed — tente o rollback novamente depois.`,
            );
            return;
        }
        await client
            .send(new DeleteDistributionCommand({ Id: distributionId, IfMatch: etag }))
            .catch((err: Error) => this.logger.warn(`CloudFront DeleteDistribution: ${err.message}`));
    }

    private async destroyEcsCluster(cluster: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getEcsClient(context.cloudAccountId, context.tenantId, region);
        await client.send(new DeleteClusterCommand({ cluster })).catch((err) => this.fail('ECS DeleteCluster', err));
    }

    private async destroyEcr(repositoryName: string, region: string, context: AwsAutomationContext): Promise<void> {
        const name = repositoryName.includes('/') ? repositoryName.split('/').pop()! : repositoryName;
        const client = await this.connector.getEcrClient(context.cloudAccountId, context.tenantId, region);
        await client
            .send(new DeleteRepositoryCommand({ repositoryName: name, force: true }))
            .catch((err) => this.fail('ECR DeleteRepository', err));
    }

    private async destroyLoadBalancer(arn: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getElbV2Client(context.cloudAccountId, context.tenantId, region);
        await client.send(new DeleteLoadBalancerCommand({ LoadBalancerArn: arn })).catch((err) => this.fail('ELBv2 DeleteLoadBalancer', err));
    }

    private async destroyLambda(functionName: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getLambdaClient(context.cloudAccountId, context.tenantId, region);
        const name = functionName.includes(':') ? functionName.split(':').pop()! : functionName;
        await client.send(new DeleteFunctionCommand({ FunctionName: name })).catch((err) => this.fail('Lambda DeleteFunction', err));
    }

    private async destroyIamRole(roleArnOrName: string, context: AwsAutomationContext): Promise<void> {
        const roleName = roleArnOrName.includes('/') ? roleArnOrName.split('/').pop()! : roleArnOrName;
        const client = await this.connector.getIamClient(context.cloudAccountId, context.tenantId);
        const attached = await client.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName })).catch(() => null);
        for (const policy of attached?.AttachedPolicies ?? []) {
            if (!policy.PolicyArn) continue;
            await client.send(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policy.PolicyArn })).catch(() => undefined);
        }
        await client.send(new DeleteRoleCommand({ RoleName: roleName })).catch((err) => this.fail('IAM DeleteRole', err));
    }

    private async destroySecurityGroup(groupId: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);
        await client.send(new DeleteSecurityGroupCommand({ GroupId: groupId })).catch((err) => this.fail('EC2 DeleteSecurityGroup', err));
    }

    private async destroyVpc(vpcId: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);
        await client.send(new DeleteVpcCommand({ VpcId: vpcId })).catch((err) => this.fail('EC2 DeleteVpc', err));
    }

    private async destroySubnet(subnetId: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);
        await client.send(new DeleteSubnetCommand({ SubnetId: subnetId })).catch((err) => this.fail('EC2 DeleteSubnet', err));
    }

    private async destroyRouteTable(routeTableId: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);
        await client.send(new DeleteRouteTableCommand({ RouteTableId: routeTableId })).catch((err) => this.fail('EC2 DeleteRouteTable', err));
    }

    private async destroyNatGateway(
        natGatewayId: string,
        region: string,
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<void> {
        const client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);
        await client.send(new DeleteNatGatewayCommand({ NatGatewayId: natGatewayId })).catch((err) => this.fail('EC2 DeleteNatGateway', err));
        const allocationId = config.allocationId ? str(config.allocationId) : '';
        if (allocationId) {
            await client.send(new ReleaseAddressCommand({ AllocationId: allocationId })).catch(() => undefined);
        }
    }

    private async destroyRds(dbInstanceIdentifier: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getRdsClient(context.cloudAccountId, context.tenantId, region);
        await client
            .send(
                new DeleteDBInstanceCommand({
                    DBInstanceIdentifier: dbInstanceIdentifier,
                    SkipFinalSnapshot: true,
                    DeleteAutomatedBackups: true,
                }),
            )
            .catch((err) => this.fail('RDS DeleteDBInstance', err));
    }

    private async destroyEc2(instanceId: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getEc2Client(context.cloudAccountId, context.tenantId, region);
        await client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] })).catch((err) => this.fail('EC2 TerminateInstances', err));
    }

    private async destroyAmplify(appId: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getAmplifyClient(context.cloudAccountId, context.tenantId, region);
        await client.send(new DeleteAppCommand({ appId })).catch((err) => this.fail('Amplify DeleteApp', err));
    }

    private async destroyApiGateway(restApiId: string, region: string, context: AwsAutomationContext): Promise<void> {
        const client = await this.connector.getApiGatewayClient(context.cloudAccountId, context.tenantId, region);
        await client.send(new DeleteRestApiCommand({ restApiId })).catch((err) => this.fail('API Gateway DeleteRestApi', err));
    }
}
