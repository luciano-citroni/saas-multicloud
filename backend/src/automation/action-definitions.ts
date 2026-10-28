import { z } from 'zod';
import { AUTOMATION_ACTION_TYPES } from './constants';
import { valueBindingSchema, nodeOutputReferenceSchema } from './bindings';
import type { AutomationProvider } from './provider-resource-catalog';

const awsRegionRegex = /^[a-z]{2}(?:-(?:gov|iso|isob|isof))?-[a-z0-9-]+-\d+$/i;

export const EXISTING_RESOURCE_TYPES = [
    'vpc',
    'subnet',
    'security_group',
    'ecr_repository',
    'ecs_cluster',
    'iam_role',
    'secret',
    'load_balancer',
] as const;

export const INVENTORY_FAMILIES = ['ecs', 'ecr', 'load_balancer', 'iam', 'networking', 'security_group', 'secrets'] as const;

export const EXISTING_RESOURCE_OUTPUTS: Record<string, readonly string[]> = {
    vpc: ['vpcId', 'cidr', 'name'],
    subnet: ['subnetId', 'vpcId', 'availabilityZone', 'cidr'],
    security_group: ['groupId', 'vpcId', 'name'],
    ecr_repository: ['repositoryArn', 'repositoryUri', 'repositoryName'],
    ecs_cluster: ['clusterArn', 'clusterName'],
    iam_role: ['roleArn', 'roleName'],
    secret: ['secretArn', 'secretName'],
    load_balancer: ['loadBalancerArn', 'dnsName', 'name'],
};

const bindableString = z.union([z.string().min(1), valueBindingSchema]);
const bindableRegion = z.union([z.string().regex(awsRegionRegex), valueBindingSchema]);

export const s3ActionConfigSchema = z.object({
    bucketName: z.union([z.string().min(3).max(63), valueBindingSchema]),
    region: bindableRegion,
    versioning: z.boolean().optional().default(false),
    encryption: z.boolean().optional().default(true),
    publicAccessBlock: z.boolean().optional().default(true),
    tags: z.record(z.string()).optional(),
});

export const cloudFrontActionConfigSchema = z.object({
    name: z.string().min(1).optional(),
    comment: z.string().optional(),
    origin: nodeOutputReferenceSchema,
    enabled: z.boolean().optional().default(true),
    priceClass: z.enum(['PriceClass_100', 'PriceClass_200', 'PriceClass_All']).optional().default('PriceClass_100'),
});

export const ecsClusterConfigSchema = z.object({
    clusterName: bindableString,
    region: bindableRegion,
});

export const ecsTaskDefinitionConfigSchema = z.object({
    family: bindableString,
    region: bindableRegion,
    image: bindableString,
    cpu: z.union([z.string(), z.number(), valueBindingSchema]).optional().default('256'),
    memory: z.union([z.string(), z.number(), valueBindingSchema]).optional().default('512'),
    executionRoleArn: bindableString,
    containerName: z.union([z.string().min(1), valueBindingSchema]).optional().default('app'),
    containerPort: z.union([z.number(), valueBindingSchema]).optional().default(80),
});

export const ecrRepositoryConfigSchema = z.object({
    repositoryName: bindableString,
    region: bindableRegion,
    imageScanning: z.boolean().optional().default(true),
});

const csvOrList = z.union([z.string().min(1), z.array(z.string().min(1)).min(1), valueBindingSchema]);

export const loadBalancerConfigSchema = z.object({
    name: bindableString,
    region: bindableRegion,
    subnetIds: csvOrList,
    scheme: z.enum(['internet-facing', 'internal']).optional().default('internet-facing'),
    securityGroupIds: z.union([z.string(), z.array(z.string().min(1)), valueBindingSchema]).optional(),
});

export const lambdaFunctionConfigSchema = z.object({
    functionName: bindableString,
    region: bindableRegion,
    roleArn: bindableString,
    runtime: z.union([z.string().min(1), valueBindingSchema]).optional().default('nodejs20.x'),
    handler: z.union([z.string().min(1), valueBindingSchema]).optional().default('index.handler'),
    memorySize: z.union([z.number(), valueBindingSchema]).optional().default(128),
    timeout: z.union([z.number(), valueBindingSchema]).optional().default(30),
});

export const iamRoleConfigSchema = z.object({
    roleName: bindableString,
    assumeService: z.union([z.string().min(1), valueBindingSchema]).optional().default('ec2.amazonaws.com'),
    managedPolicyArn: z.union([z.string().min(1), valueBindingSchema]).optional(),
    path: z.union([z.string().min(1), valueBindingSchema]).optional().default('/'),
});

export const securityGroupConfigSchema = z.object({
    groupName: bindableString,
    description: z.union([z.string().min(1), valueBindingSchema]).optional().default('Created by SaaS MultiCloud'),
    region: bindableRegion,
    vpcId: bindableString,
});

export const vpcConfigSchema = z.object({
    name: bindableString,
    region: bindableRegion,
    cidrBlock: z.union([z.string().min(1), valueBindingSchema]).optional().default('10.0.0.0/16'),
});

export const subnetConfigSchema = z.object({
    name: bindableString,
    region: bindableRegion,
    vpcId: bindableString,
    cidrBlock: bindableString,
    availabilityZone: bindableString,
    mapPublicIpOnLaunch: z.boolean().optional().default(false),
});

export const routeTableConfigSchema = z.object({
    name: bindableString,
    region: bindableRegion,
    vpcId: bindableString,
});

export const natGatewayConfigSchema = z.object({
    name: bindableString,
    region: bindableRegion,
    subnetId: bindableString,
    allocationId: z.union([z.string().min(1), valueBindingSchema]).optional(),
});

export const rdsInstanceConfigSchema = z.object({
    dbInstanceIdentifier: bindableString,
    region: bindableRegion,
    dbInstanceClass: z.union([z.string().min(1), valueBindingSchema]).optional().default('db.t3.micro'),
    engine: z.union([z.string().min(1), valueBindingSchema]).optional().default('postgres'),
    masterUsername: bindableString,
    masterUserPassword: bindableString,
    allocatedStorage: z.union([z.number(), valueBindingSchema]).optional().default(20),
    multiAz: z.boolean().optional().default(false),
});

export const ec2InstanceConfigSchema = z.object({
    region: bindableRegion,
    instanceType: z.union([z.string().min(1), valueBindingSchema]).optional().default('t3.micro'),
    amiId: bindableString,
    subnetId: z.union([z.string().min(1), valueBindingSchema]).optional(),
    securityGroupIds: z.union([z.string(), z.array(z.string().min(1)), valueBindingSchema]).optional(),
    keyName: z.union([z.string().min(1), valueBindingSchema]).optional(),
    name: z.union([z.string().min(1), valueBindingSchema]).optional(),
});

export const amplifyAppConfigSchema = z.object({
    name: bindableString,
    region: bindableRegion,
    repository: z.union([z.string().min(1), valueBindingSchema]).optional(),
    platform: z.union([z.string().min(1), valueBindingSchema]).optional().default('WEB'),
});

export const apiGatewayConfigSchema = z.object({
    name: bindableString,
    region: bindableRegion,
    description: z.union([z.string(), valueBindingSchema]).optional(),
    endpointType: z.enum(['REGIONAL', 'EDGE', 'PRIVATE']).optional().default('REGIONAL'),
});

export const cloudFormationStackConfigSchema = z.object({
    templateId: z.string().uuid(),
    templateVersion: z.number().int().positive(),
    region: bindableRegion,
    stackName: z.union([z.string().min(1).max(128), valueBindingSchema]),
    parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), valueBindingSchema])).optional().default({}),
    capabilitiesConfirmed: z.boolean().optional().default(false),
    declaredOutputs: z.array(z.string()).optional().default([]),
});

export const existingResourceConfigSchema = z.object({
    resourceType: z.enum(EXISTING_RESOURCE_TYPES),
    region: bindableRegion,
    resourceId: bindableString,
    inventoryId: z.string().uuid().optional(),
});

export const dataInputConfigSchema = z.object({
    values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), valueBindingSchema])).default({}),
});

export const callerIdentityConfigSchema = z.object({
    region: bindableRegion.optional(),
});

export const refreshInventoryConfigSchema = z.object({
    region: bindableRegion,
    families: z.array(z.enum(INVENTORY_FAMILIES)).min(1),
});

export const ACTION_OUTPUT_FIELDS: Record<string, readonly string[]> = {
    [AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE]: ['bucketName', 'bucketArn', 'bucketDomainName', 'alreadyExists'],
    [AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE]: ['distributionId', 'domainName', 'arn'],
    [AUTOMATION_ACTION_TYPES.AWS_ECS_CLUSTER_CREATE]: ['clusterArn', 'clusterName'],
    [AUTOMATION_ACTION_TYPES.AWS_ECS_TASK_DEFINITION_CREATE]: ['taskDefinitionArn', 'family', 'revision'],
    [AUTOMATION_ACTION_TYPES.AWS_ECR_REPOSITORY_CREATE]: ['repositoryArn', 'repositoryUri', 'repositoryName'],
    [AUTOMATION_ACTION_TYPES.AWS_LOAD_BALANCER_CREATE]: ['loadBalancerArn', 'dnsName', 'name'],
    [AUTOMATION_ACTION_TYPES.AWS_LAMBDA_FUNCTION_CREATE]: ['functionArn', 'functionName'],
    [AUTOMATION_ACTION_TYPES.AWS_IAM_ROLE_CREATE]: ['roleArn', 'roleName'],
    [AUTOMATION_ACTION_TYPES.AWS_SECURITY_GROUP_CREATE]: ['groupId', 'groupName', 'vpcId'],
    [AUTOMATION_ACTION_TYPES.AWS_VPC_CREATE]: ['vpcId', 'cidrBlock', 'name'],
    [AUTOMATION_ACTION_TYPES.AWS_SUBNET_CREATE]: ['subnetId', 'vpcId', 'cidrBlock', 'availabilityZone'],
    [AUTOMATION_ACTION_TYPES.AWS_ROUTE_TABLE_CREATE]: ['routeTableId', 'vpcId'],
    [AUTOMATION_ACTION_TYPES.AWS_NAT_GATEWAY_CREATE]: ['natGatewayId', 'subnetId', 'allocationId'],
    [AUTOMATION_ACTION_TYPES.AWS_RDS_INSTANCE_CREATE]: ['dbInstanceIdentifier', 'endpoint'],
    [AUTOMATION_ACTION_TYPES.AWS_EC2_INSTANCE_CREATE]: ['instanceId'],
    [AUTOMATION_ACTION_TYPES.AWS_AMPLIFY_APP_CREATE]: ['appId', 'appArn', 'defaultDomain'],
    [AUTOMATION_ACTION_TYPES.AWS_API_GATEWAY_CREATE]: ['restApiId', 'name', 'rootResourceId'],
    [AUTOMATION_ACTION_TYPES.AWS_CLOUDFORMATION_STACK]: ['stackId', 'stackName', 'stackStatus', 'outputs'],
    [AUTOMATION_ACTION_TYPES.AWS_CALLER_IDENTITY]: ['account', 'arn', 'userId'],
    [AUTOMATION_ACTION_TYPES.AWS_REFRESH_INVENTORY]: ['refreshed', 'errors'],
};

export type ActionFieldInput = 'text' | 'region' | 'boolean' | 'select' | 'template' | 'resource' | 'keyValue' | 'families';

export interface ActionFieldDescriptor {
    key: string;
    label: string;
    input: ActionFieldInput;
    required?: boolean;
    sensitive?: boolean;
    acceptsBinding?: boolean;
    bindingModes?: Array<'LITERAL' | 'VARIABLE' | 'NODE_OUTPUT' | 'EXISTING_RESOURCE'>;
    options?: { value: string; label: string }[];
    defaultValue?: string | number | boolean | null;
}

export interface ActionDefinition {
    type: string;
    provider: AutomationProvider;
    kind: 'native' | 'cloudformation' | 'existing_resource' | 'data';
    name: string;
    category: string;
    outputFields: readonly string[];
    requiredIamActions: readonly string[];
    dynamicOutputs?: boolean;
    fields: ActionFieldDescriptor[];
}

const REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'sa-east-1'].map((value) => ({
    value,
    label: value,
}));

const regionField = (defaultValue = 'us-east-1'): ActionFieldDescriptor => ({
    key: 'region',
    label: 'Região',
    input: 'region',
    required: true,
    options: REGIONS,
    defaultValue,
    acceptsBinding: true,
});

export const ACTION_DEFINITIONS: ActionDefinition[] = [
    {
        type: AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar S3 Bucket',
        category: 'Storage',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE],
        requiredIamActions: [
            's3:CreateBucket',
            's3:GetBucketLocation',
            's3:ListBucket',
            's3:PutBucketVersioning',
            's3:PutEncryptionConfiguration',
            's3:PutPublicAccessBlock',
            's3:PutBucketTagging',
        ],
        fields: [
            { key: 'bucketName', label: 'Nome do bucket', input: 'text', required: true, acceptsBinding: true },
            regionField(),
            { key: 'versioning', label: 'Versionamento', input: 'boolean', defaultValue: false },
            { key: 'encryption', label: 'Criptografia', input: 'boolean', defaultValue: true },
            { key: 'publicAccessBlock', label: 'Bloquear acesso público', input: 'boolean', defaultValue: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar CloudFront',
        category: 'CDN',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE],
        requiredIamActions: ['cloudfront:CreateDistribution', 'cloudfront:GetDistribution'],
        fields: [
            { key: 'comment', label: 'Comentário', input: 'text' },
            {
                key: 'origin',
                label: 'Origem',
                input: 'text',
                required: true,
                acceptsBinding: true,
                bindingModes: ['NODE_OUTPUT'],
            },
            { key: 'enabled', label: 'Habilitada', input: 'boolean', defaultValue: true },
            {
                key: 'priceClass',
                label: 'Price class',
                input: 'select',
                defaultValue: 'PriceClass_100',
                options: [
                    { value: 'PriceClass_100', label: 'PriceClass_100' },
                    { value: 'PriceClass_200', label: 'PriceClass_200' },
                    { value: 'PriceClass_All', label: 'PriceClass_All' },
                ],
            },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_ECS_CLUSTER_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar ECS Cluster',
        category: 'Compute',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_ECS_CLUSTER_CREATE],
        requiredIamActions: ['ecs:CreateCluster', 'ecs:DescribeClusters'],
        fields: [
            { key: 'clusterName', label: 'Nome do cluster', input: 'text', required: true, acceptsBinding: true },
            regionField('us-east-2'),
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_ECS_TASK_DEFINITION_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar Task Definition',
        category: 'Compute',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_ECS_TASK_DEFINITION_CREATE],
        requiredIamActions: ['ecs:RegisterTaskDefinition'],
        fields: [
            { key: 'family', label: 'Family', input: 'text', required: true, acceptsBinding: true },
            regionField('us-east-2'),
            { key: 'image', label: 'Imagem', input: 'text', required: true, acceptsBinding: true },
            { key: 'executionRoleArn', label: 'Execution role ARN', input: 'text', required: true, acceptsBinding: true },
            { key: 'cpu', label: 'CPU', input: 'text', defaultValue: '256', acceptsBinding: true },
            { key: 'memory', label: 'Memory', input: 'text', defaultValue: '512', acceptsBinding: true },
            { key: 'containerName', label: 'Container', input: 'text', defaultValue: 'app', acceptsBinding: true },
            { key: 'containerPort', label: 'Porta', input: 'text', defaultValue: 80, acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_ECR_REPOSITORY_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar ECR',
        category: 'Containers',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_ECR_REPOSITORY_CREATE],
        requiredIamActions: ['ecr:CreateRepository', 'ecr:DescribeRepositories'],
        fields: [
            { key: 'repositoryName', label: 'Nome do repositório', input: 'text', required: true, acceptsBinding: true },
            regionField('us-east-2'),
            { key: 'imageScanning', label: 'Scan de imagem', input: 'boolean', defaultValue: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_LOAD_BALANCER_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar Load Balancer',
        category: 'Networking',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_LOAD_BALANCER_CREATE],
        requiredIamActions: ['elasticloadbalancing:CreateLoadBalancer', 'elasticloadbalancing:DescribeLoadBalancers'],
        fields: [
            { key: 'name', label: 'Nome', input: 'text', required: true, acceptsBinding: true },
            regionField('us-east-2'),
            { key: 'subnetIds', label: 'Subnet IDs (vírgula)', input: 'text', required: true, acceptsBinding: true },
            {
                key: 'scheme',
                label: 'Scheme',
                input: 'select',
                defaultValue: 'internet-facing',
                options: [
                    { value: 'internet-facing', label: 'internet-facing' },
                    { value: 'internal', label: 'internal' },
                ],
            },
            { key: 'securityGroupIds', label: 'Security group IDs (vírgula)', input: 'text', acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_LAMBDA_FUNCTION_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar Lambda',
        category: 'Compute',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_LAMBDA_FUNCTION_CREATE],
        requiredIamActions: ['lambda:CreateFunction', 'lambda:GetFunction'],
        fields: [
            { key: 'functionName', label: 'Nome da função', input: 'text', required: true, acceptsBinding: true },
            regionField(),
            { key: 'roleArn', label: 'Role ARN', input: 'text', required: true, acceptsBinding: true },
            { key: 'runtime', label: 'Runtime', input: 'text', defaultValue: 'nodejs20.x', acceptsBinding: true },
            { key: 'handler', label: 'Handler', input: 'text', defaultValue: 'index.handler', acceptsBinding: true },
            { key: 'memorySize', label: 'Memory (MB)', input: 'text', defaultValue: 128, acceptsBinding: true },
            { key: 'timeout', label: 'Timeout (s)', input: 'text', defaultValue: 30, acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_IAM_ROLE_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar IAM Role',
        category: 'Security',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_IAM_ROLE_CREATE],
        requiredIamActions: ['iam:CreateRole', 'iam:AttachRolePolicy', 'iam:GetRole'],
        fields: [
            { key: 'roleName', label: 'Nome da role', input: 'text', required: true, acceptsBinding: true },
            { key: 'assumeService', label: 'Serviço (Principal)', input: 'text', defaultValue: 'ec2.amazonaws.com', acceptsBinding: true },
            { key: 'managedPolicyArn', label: 'Managed policy ARN', input: 'text', acceptsBinding: true },
            { key: 'path', label: 'Path', input: 'text', defaultValue: '/', acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_SECURITY_GROUP_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar Security Group',
        category: 'Networking',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_SECURITY_GROUP_CREATE],
        requiredIamActions: ['ec2:CreateSecurityGroup', 'ec2:DescribeSecurityGroups', 'ec2:CreateTags'],
        fields: [
            { key: 'groupName', label: 'Nome', input: 'text', required: true, acceptsBinding: true },
            { key: 'description', label: 'Descrição', input: 'text', defaultValue: 'Created by SaaS MultiCloud' },
            regionField('us-east-2'),
            { key: 'vpcId', label: 'VPC ID', input: 'text', required: true, acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_VPC_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar VPC',
        category: 'Networking',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_VPC_CREATE],
        requiredIamActions: ['ec2:CreateVpc', 'ec2:DescribeVpcs', 'ec2:CreateTags'],
        fields: [
            { key: 'name', label: 'Nome', input: 'text', required: true, acceptsBinding: true },
            regionField('us-east-2'),
            { key: 'cidrBlock', label: 'CIDR', input: 'text', defaultValue: '10.0.0.0/16', acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_SUBNET_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar Subnet',
        category: 'Networking',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_SUBNET_CREATE],
        requiredIamActions: ['ec2:CreateSubnet', 'ec2:DescribeSubnets', 'ec2:CreateTags', 'ec2:ModifySubnetAttribute'],
        fields: [
            { key: 'name', label: 'Nome', input: 'text', required: true, acceptsBinding: true },
            regionField('us-east-2'),
            { key: 'vpcId', label: 'VPC ID', input: 'text', required: true, acceptsBinding: true },
            { key: 'cidrBlock', label: 'CIDR', input: 'text', required: true, acceptsBinding: true },
            { key: 'availabilityZone', label: 'Availability Zone', input: 'text', required: true, acceptsBinding: true },
            { key: 'mapPublicIpOnLaunch', label: 'IP público automático', input: 'boolean', defaultValue: false },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_ROUTE_TABLE_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar Tabela de Rota',
        category: 'Networking',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_ROUTE_TABLE_CREATE],
        requiredIamActions: ['ec2:CreateRouteTable', 'ec2:DescribeRouteTables', 'ec2:CreateTags'],
        fields: [
            { key: 'name', label: 'Nome', input: 'text', required: true, acceptsBinding: true },
            regionField('us-east-2'),
            { key: 'vpcId', label: 'VPC ID', input: 'text', required: true, acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_NAT_GATEWAY_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar NAT Gateway',
        category: 'Networking',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_NAT_GATEWAY_CREATE],
        requiredIamActions: ['ec2:CreateNatGateway', 'ec2:AllocateAddress', 'ec2:DescribeNatGateways', 'ec2:CreateTags'],
        fields: [
            { key: 'name', label: 'Nome', input: 'text', required: true, acceptsBinding: true },
            regionField('us-east-2'),
            { key: 'subnetId', label: 'Subnet ID', input: 'text', required: true, acceptsBinding: true },
            { key: 'allocationId', label: 'EIP Allocation ID (opcional)', input: 'text', acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_RDS_INSTANCE_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar RDS',
        category: 'Database',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_RDS_INSTANCE_CREATE],
        requiredIamActions: ['rds:CreateDBInstance', 'rds:DescribeDBInstances'],
        fields: [
            { key: 'dbInstanceIdentifier', label: 'Identificador', input: 'text', required: true, acceptsBinding: true },
            regionField(),
            { key: 'engine', label: 'Engine', input: 'text', defaultValue: 'postgres', acceptsBinding: true },
            { key: 'dbInstanceClass', label: 'Instance class', input: 'text', defaultValue: 'db.t3.micro', acceptsBinding: true },
            { key: 'masterUsername', label: 'Master username', input: 'text', required: true, acceptsBinding: true },
            { key: 'masterUserPassword', label: 'Master password', input: 'text', required: true, sensitive: true, acceptsBinding: true },
            { key: 'allocatedStorage', label: 'Storage (GB)', input: 'text', defaultValue: 20, acceptsBinding: true },
            { key: 'multiAz', label: 'Multi-AZ', input: 'boolean', defaultValue: false },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_EC2_INSTANCE_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar EC2',
        category: 'Compute',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_EC2_INSTANCE_CREATE],
        requiredIamActions: ['ec2:RunInstances', 'ec2:DescribeInstances', 'ec2:CreateTags'],
        fields: [
            { key: 'name', label: 'Nome (tag)', input: 'text', acceptsBinding: true },
            regionField(),
            { key: 'amiId', label: 'AMI ID', input: 'text', required: true, acceptsBinding: true },
            { key: 'instanceType', label: 'Instance type', input: 'text', defaultValue: 't3.micro', acceptsBinding: true },
            { key: 'subnetId', label: 'Subnet ID', input: 'text', acceptsBinding: true },
            { key: 'securityGroupIds', label: 'Security group IDs (vírgula)', input: 'text', acceptsBinding: true },
            { key: 'keyName', label: 'Key pair', input: 'text', acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_AMPLIFY_APP_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar Amplify App',
        category: 'Frontend',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_AMPLIFY_APP_CREATE],
        requiredIamActions: ['amplify:CreateApp', 'amplify:GetApp'],
        fields: [
            { key: 'name', label: 'Nome', input: 'text', required: true, acceptsBinding: true },
            regionField(),
            { key: 'repository', label: 'Repositório (opcional)', input: 'text', acceptsBinding: true },
            { key: 'platform', label: 'Platform', input: 'text', defaultValue: 'WEB', acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_API_GATEWAY_CREATE,
        provider: 'AWS',
        kind: 'native',
        name: 'Criar API Gateway',
        category: 'Networking',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_API_GATEWAY_CREATE],
        requiredIamActions: ['apigateway:POST', 'apigateway:GET'],
        fields: [
            { key: 'name', label: 'Nome', input: 'text', required: true, acceptsBinding: true },
            regionField(),
            { key: 'description', label: 'Descrição', input: 'text' },
            {
                key: 'endpointType',
                label: 'Endpoint',
                input: 'select',
                defaultValue: 'REGIONAL',
                options: [
                    { value: 'REGIONAL', label: 'REGIONAL' },
                    { value: 'EDGE', label: 'EDGE' },
                    { value: 'PRIVATE', label: 'PRIVATE' },
                ],
            },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_CLOUDFORMATION_STACK,
        provider: 'AWS',
        kind: 'cloudformation',
        name: 'CloudFormation stack',
        category: 'Template',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_CLOUDFORMATION_STACK],
        dynamicOutputs: true,
        requiredIamActions: [
            'cloudformation:ValidateTemplate',
            'cloudformation:CreateChangeSet',
            'cloudformation:DescribeChangeSet',
            'cloudformation:ExecuteChangeSet',
            'cloudformation:DescribeStacks',
            'cloudformation:DescribeStackResources',
            'cloudformation:DeleteChangeSet',
        ],
        fields: [
            { key: 'templateId', label: 'Template', input: 'template', required: true },
            { key: 'stackName', label: 'Nome da stack', input: 'text', required: true, acceptsBinding: true },
            regionField('us-east-2'),
            { key: 'parameters', label: 'Parâmetros', input: 'keyValue' },
            { key: 'capabilitiesConfirmed', label: 'Confirmar capabilities IAM', input: 'boolean', defaultValue: false },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_EXISTING_RESOURCE,
        provider: 'AWS',
        kind: 'existing_resource',
        name: 'Recurso existente',
        category: 'Referência',
        outputFields: [],
        dynamicOutputs: true,
        requiredIamActions: ['ec2:Describe*', 'ecs:Describe*', 'ecr:Describe*', 'elasticloadbalancing:Describe*', 'iam:GetRole', 'secretsmanager:DescribeSecret'],
        fields: [
            {
                key: 'resourceType',
                label: 'Tipo',
                input: 'select',
                required: true,
                options: EXISTING_RESOURCE_TYPES.map((value) => ({ value, label: value })),
                defaultValue: 'vpc',
            },
            regionField('us-east-2'),
            { key: 'resourceId', label: 'Identificador', input: 'resource', required: true, acceptsBinding: true },
        ],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_DATA_INPUT,
        provider: 'AWS',
        kind: 'data',
        name: 'Entrada de dados',
        category: 'Dados',
        outputFields: [],
        dynamicOutputs: true,
        requiredIamActions: [],
        fields: [{ key: 'values', label: 'Valores', input: 'keyValue' }],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_CALLER_IDENTITY,
        provider: 'AWS',
        kind: 'native',
        name: 'Identidade da conta',
        category: 'Operação',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_CALLER_IDENTITY],
        requiredIamActions: ['sts:GetCallerIdentity'],
        fields: [{ key: 'region', label: 'Região', input: 'region', options: REGIONS, defaultValue: 'us-east-1', acceptsBinding: true }],
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_REFRESH_INVENTORY,
        provider: 'AWS',
        kind: 'native',
        name: 'Atualizar inventário',
        category: 'Operação',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_REFRESH_INVENTORY],
        requiredIamActions: [],
        fields: [
            regionField('us-east-2'),
            {
                key: 'families',
                label: 'Famílias',
                input: 'families',
                required: true,
                options: INVENTORY_FAMILIES.map((value) => ({ value, label: value })),
                defaultValue: 'ecs',
            },
        ],
    },
];

export function listActions(provider?: AutomationProvider | null): ActionDefinition[] {
    if (!provider) return ACTION_DEFINITIONS;
    return ACTION_DEFINITIONS.filter((def) => def.provider === provider);
}

export function getActionDefinition(type: string): ActionDefinition | undefined {
    return ACTION_DEFINITIONS.find((def) => def.type === type);
}

export function getConfigSchemaForAction(type: string): z.ZodType | undefined {
    switch (type) {
        case AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE:
            return s3ActionConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE:
            return cloudFrontActionConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_ECS_CLUSTER_CREATE:
            return ecsClusterConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_ECS_TASK_DEFINITION_CREATE:
            return ecsTaskDefinitionConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_ECR_REPOSITORY_CREATE:
            return ecrRepositoryConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_LOAD_BALANCER_CREATE:
            return loadBalancerConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_LAMBDA_FUNCTION_CREATE:
            return lambdaFunctionConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_IAM_ROLE_CREATE:
            return iamRoleConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_SECURITY_GROUP_CREATE:
            return securityGroupConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_VPC_CREATE:
            return vpcConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_SUBNET_CREATE:
            return subnetConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_ROUTE_TABLE_CREATE:
            return routeTableConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_NAT_GATEWAY_CREATE:
            return natGatewayConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_RDS_INSTANCE_CREATE:
            return rdsInstanceConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_EC2_INSTANCE_CREATE:
            return ec2InstanceConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_AMPLIFY_APP_CREATE:
            return amplifyAppConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_API_GATEWAY_CREATE:
            return apiGatewayConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_CLOUDFORMATION_STACK:
            return cloudFormationStackConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_EXISTING_RESOURCE:
            return existingResourceConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_DATA_INPUT:
            return dataInputConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_CALLER_IDENTITY:
            return callerIdentityConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_REFRESH_INVENTORY:
            return refreshInventoryConfigSchema;
        default:
            return undefined;
    }
}

export function getOutputFieldsForNode(node: { type: string; config: Record<string, unknown> }): readonly string[] {
    const definition = getActionDefinition(node.type);
    if (!definition) return [];

    if (node.type === AUTOMATION_ACTION_TYPES.AWS_EXISTING_RESOURCE) {
        return EXISTING_RESOURCE_OUTPUTS[String(node.config.resourceType)] ?? [];
    }

    if (node.type === AUTOMATION_ACTION_TYPES.AWS_DATA_INPUT) {
        const values = node.config.values;
        if (values && typeof values === 'object' && !Array.isArray(values)) {
            return Object.keys(values as Record<string, unknown>);
        }
        return [];
    }

    if (node.type === AUTOMATION_ACTION_TYPES.AWS_CLOUDFORMATION_STACK) {
        const declared = Array.isArray(node.config.declaredOutputs)
            ? node.config.declaredOutputs.filter((item): item is string => typeof item === 'string')
            : [];
        return [...definition.outputFields, ...declared];
    }

    return definition.outputFields;
}

export { nodeOutputReferenceSchema };
