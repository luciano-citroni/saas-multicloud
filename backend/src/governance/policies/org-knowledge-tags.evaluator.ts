import {
    evaluateRequiredTagsFinding,
    resolveApplicableRequiredTags,
} from './org-knowledge-policy.helpers';
import type {
    FindingSeverity,
    PolicyContext,
    PolicyEvaluationResult,
} from './policy.interface';

export type OrgTagFinding = PolicyEvaluationResult & {
    policyId: string;
    policyName: string;
    severity: FindingSeverity;
    category: string | null;
};

/** Loose bags so the evaluator does not depend on GovernanceScanService types. */
type AwsTagScanResources = {
    s3Buckets?: Array<{ bucketName: string; tags?: Record<string, string> | null }>;
    securityGroups?: Array<{
        awsSecurityGroupId: string;
        name: string;
        tags?: Record<string, string> | null;
    }>;
    ec2Instances?: Array<{ awsInstanceId: string; tags?: Record<string, string> | null }>;
    rdsInstances?: Array<{
        awsDbInstanceIdentifier: string;
        tags?: Record<string, string> | null;
    }>;
    lambdaFunctions?: Array<{ functionName: string; tags?: Record<string, string> | null }>;
    kmsKeys?: Array<{ awsKeyId: string; tags?: Record<string, string> | null }>;
    eksClusters?: Array<{ clusterName: string; tags?: Record<string, string> | null }>;
    iamRoles?: Array<{ roleName: string; tags?: Record<string, string> | null }>;
    guardDutyDetectors?: Array<{ detectorId: string; tags?: Record<string, string> | null }>;
    vpcs?: Array<{ id: string; awsVpcId?: string; tags?: Record<string, string> | null }>;
    dynamoTables?: Array<{ tableName: string; tags?: Record<string, string> | null }>;
    sqsQueues?: Array<{ queueName: string; tags?: Record<string, string> | null }>;
    snsTopics?: Array<{ topicName: string; tags?: Record<string, string> | null }>;
    loadBalancers?: Array<{ name: string; tags?: Record<string, string> | null }>;
    ecsClusters?: Array<{ clusterName: string; tags?: Record<string, string> | null }>;
    ecrRepositories?: Array<{ repositoryName: string; tags?: Record<string, string> | null }>;
    secrets?: Array<{ name: string; tags?: Record<string, string> | null }>;
    elasticacheClusters?: Array<{ cacheClusterId: string; tags?: Record<string, string> | null }>;
    apiGateways?: Array<{ name: string; tags?: Record<string, string> | null }>;
    cloudFrontDistributions?: Array<{
        distributionId: string;
        tags?: Record<string, string> | null;
    }>;
    wafWebAcls?: Array<{ name: string; tags?: Record<string, string> | null }>;
    route53Zones?: Array<{
        awsHostedZoneId: string;
        name: string;
        tags?: Record<string, string> | null;
    }>;
    subnets?: Array<{ awsSubnetId: string; tags?: Record<string, string> | null }>;
    routeTables?: Array<{ awsRouteTableId: string; tags?: Record<string, string> | null }>;
    ecsServices?: Array<{ serviceName: string; tags?: Record<string, string> | null }>;
    ecsTaskDefinitions?: Array<{
        family: string;
        revision: number;
        tags?: Record<string, string> | null;
    }>;
};

type GcpTagScanResources = {
    storageBuckets?: Array<{ name: string; labels?: Record<string, string> | null }>;
    vmInstances?: Array<{ name: string; labels?: Record<string, string> | null }>;
    sqlInstances?: Array<{ name: string; userLabels?: Record<string, string> | null }>;
    gkeClusters?: Array<{ name: string; resourceLabels?: Record<string, string> | null }>;
    cloudRunServices?: Array<{ name: string; labels?: Record<string, string> | null }>;
    cloudRunJobs?: Array<{ name: string; labels?: Record<string, string> | null }>;
};

type AzureTagScanResources = {
    virtualMachines?: Array<{
        azureId: string;
        name: string;
        tags?: Record<string, string> | null;
    }>;
    storageAccounts?: Array<{
        azureId: string;
        name: string;
        tags?: Record<string, string> | null;
    }>;
    sqlDatabases?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    webApps?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    nsgs?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    keyVaults?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    aksClusters?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    disks?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    virtualNetworks?: Array<{
        azureId: string;
        name: string;
        tags?: Record<string, string> | null;
    }>;
    loadBalancers?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    cosmosAccounts?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    postgresServers?: Array<{
        azureId: string;
        name: string;
        tags?: Record<string, string> | null;
    }>;
    sqlServers?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    appServicePlans?: Array<{
        azureId: string;
        name: string;
        tags?: Record<string, string> | null;
    }>;
    resourceGroups?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    applicationGateways?: Array<{
        azureId: string;
        name: string;
        tags?: Record<string, string> | null;
    }>;
    publicIps?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    networkInterfaces?: Array<{
        azureId: string;
        name: string;
        tags?: Record<string, string> | null;
    }>;
    vmss?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
    recoveryVaults?: Array<{ azureId: string; name: string; tags?: Record<string, string> | null }>;
};

type TagTarget = {
    policyId: string;
    policyName: string;
    resourceType: string;
    category: string;
    resourceId: string;
    resourceLabel: string;
    tags: Record<string, string> | null | undefined;
};

function asTags(value: unknown): Record<string, string> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, string>;
}

function collectAwsTargets(resources: AwsTagScanResources): TagTarget[] {
    const targets: TagTarget[] = [];

    for (const item of resources.ec2Instances ?? []) {
        targets.push({
            policyId: 'aws-ec2-required-tags',
            policyName: 'EC2 Instance Must Have Required Tags',
            resourceType: 'EC2Instance',
            category: 'compute',
            resourceId: item.awsInstanceId,
            resourceLabel: `EC2 instance "${item.awsInstanceId}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.s3Buckets ?? []) {
        targets.push({
            policyId: 'aws-s3-required-tags',
            policyName: 'S3 Bucket Must Have Required Tags',
            resourceType: 'S3Bucket',
            category: 'storage',
            resourceId: item.bucketName,
            resourceLabel: `S3 bucket "${item.bucketName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.securityGroups ?? []) {
        targets.push({
            policyId: 'aws-sg-required-tags',
            policyName: 'Security Group Must Have Required Tags',
            resourceType: 'SecurityGroup',
            category: 'network',
            resourceId: item.awsSecurityGroupId,
            resourceLabel: `Security group "${item.name}" (${item.awsSecurityGroupId})`,
            tags: item.tags,
        });
    }
    for (const item of resources.rdsInstances ?? []) {
        targets.push({
            policyId: 'aws-rds-required-tags',
            policyName: 'RDS Instance Must Have Required Tags',
            resourceType: 'RDSInstance',
            category: 'storage',
            resourceId: item.awsDbInstanceIdentifier,
            resourceLabel: `RDS instance "${item.awsDbInstanceIdentifier}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.lambdaFunctions ?? []) {
        targets.push({
            policyId: 'aws-lambda-required-tags',
            policyName: 'Lambda Function Must Have Required Tags',
            resourceType: 'LambdaFunction',
            category: 'compute',
            resourceId: item.functionName,
            resourceLabel: `Lambda function "${item.functionName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.kmsKeys ?? []) {
        targets.push({
            policyId: 'aws-kms-required-tags',
            policyName: 'KMS Key Must Have Required Tags',
            resourceType: 'KMSKey',
            category: 'encryption',
            resourceId: item.awsKeyId,
            resourceLabel: `KMS key "${item.awsKeyId}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.eksClusters ?? []) {
        targets.push({
            policyId: 'aws-eks-required-tags',
            policyName: 'EKS Cluster Must Have Required Tags',
            resourceType: 'EKSCluster',
            category: 'compute',
            resourceId: item.clusterName,
            resourceLabel: `EKS cluster "${item.clusterName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.iamRoles ?? []) {
        targets.push({
            policyId: 'aws-iam-role-required-tags',
            policyName: 'IAM Role Must Have Required Tags',
            resourceType: 'IAMRole',
            category: 'identity',
            resourceId: item.roleName,
            resourceLabel: `IAM role "${item.roleName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.guardDutyDetectors ?? []) {
        targets.push({
            policyId: 'aws-guardduty-required-tags',
            policyName: 'GuardDuty Detector Must Have Required Tags',
            resourceType: 'GuardDutyDetector',
            category: 'monitoring',
            resourceId: item.detectorId,
            resourceLabel: `GuardDuty detector "${item.detectorId}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.vpcs ?? []) {
        targets.push({
            policyId: 'aws-vpc-required-tags',
            policyName: 'VPC Must Have Required Tags',
            resourceType: 'Vpc',
            category: 'network',
            resourceId: item.awsVpcId ?? item.id,
            resourceLabel: `VPC "${item.awsVpcId ?? item.id}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.dynamoTables ?? []) {
        targets.push({
            policyId: 'aws-dynamodb-required-tags',
            policyName: 'DynamoDB Table Must Have Required Tags',
            resourceType: 'DynamoDbTable',
            category: 'storage',
            resourceId: item.tableName,
            resourceLabel: `DynamoDB table "${item.tableName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.sqsQueues ?? []) {
        targets.push({
            policyId: 'aws-sqs-required-tags',
            policyName: 'SQS Queue Must Have Required Tags',
            resourceType: 'SqsQueue',
            category: 'storage',
            resourceId: item.queueName,
            resourceLabel: `SQS queue "${item.queueName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.snsTopics ?? []) {
        targets.push({
            policyId: 'aws-sns-required-tags',
            policyName: 'SNS Topic Must Have Required Tags',
            resourceType: 'SnsTopic',
            category: 'storage',
            resourceId: item.topicName,
            resourceLabel: `SNS topic "${item.topicName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.loadBalancers ?? []) {
        targets.push({
            policyId: 'aws-elb-required-tags',
            policyName: 'Load Balancer Must Have Required Tags',
            resourceType: 'LoadBalancer',
            category: 'network',
            resourceId: item.name,
            resourceLabel: `Load balancer "${item.name}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.ecsClusters ?? []) {
        targets.push({
            policyId: 'aws-ecs-required-tags',
            policyName: 'ECS Cluster Must Have Required Tags',
            resourceType: 'EcsCluster',
            category: 'compute',
            resourceId: item.clusterName,
            resourceLabel: `ECS cluster "${item.clusterName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.ecrRepositories ?? []) {
        targets.push({
            policyId: 'aws-ecr-required-tags',
            policyName: 'ECR Repository Must Have Required Tags',
            resourceType: 'EcrRepository',
            category: 'storage',
            resourceId: item.repositoryName,
            resourceLabel: `ECR repository "${item.repositoryName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.secrets ?? []) {
        targets.push({
            policyId: 'aws-secrets-required-tags',
            policyName: 'Secrets Manager Secret Must Have Required Tags',
            resourceType: 'SecretsManagerSecret',
            category: 'identity',
            resourceId: item.name,
            resourceLabel: `Secret "${item.name}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.elasticacheClusters ?? []) {
        targets.push({
            policyId: 'aws-elasticache-required-tags',
            policyName: 'ElastiCache Cluster Must Have Required Tags',
            resourceType: 'ElastiCacheCluster',
            category: 'storage',
            resourceId: item.cacheClusterId,
            resourceLabel: `ElastiCache cluster "${item.cacheClusterId}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.apiGateways ?? []) {
        targets.push({
            policyId: 'aws-apigateway-required-tags',
            policyName: 'API Gateway Must Have Required Tags',
            resourceType: 'ApiGatewayRestApi',
            category: 'network',
            resourceId: item.name,
            resourceLabel: `API Gateway "${item.name}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.cloudFrontDistributions ?? []) {
        targets.push({
            policyId: 'aws-cloudfront-required-tags',
            policyName: 'CloudFront Distribution Must Have Required Tags',
            resourceType: 'CloudFrontDistribution',
            category: 'network',
            resourceId: item.distributionId,
            resourceLabel: `CloudFront distribution "${item.distributionId}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.wafWebAcls ?? []) {
        targets.push({
            policyId: 'aws-waf-required-tags',
            policyName: 'WAF Web ACL Must Have Required Tags',
            resourceType: 'WafWebAcl',
            category: 'network',
            resourceId: item.name,
            resourceLabel: `WAF Web ACL "${item.name}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.route53Zones ?? []) {
        targets.push({
            policyId: 'aws-route53-required-tags',
            policyName: 'Route53 Hosted Zone Must Have Required Tags',
            resourceType: 'Route53HostedZone',
            category: 'network',
            resourceId: item.awsHostedZoneId,
            resourceLabel: `Route53 zone "${item.name}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.subnets ?? []) {
        targets.push({
            policyId: 'aws-subnet-required-tags',
            policyName: 'Subnet Must Have Required Tags',
            resourceType: 'Subnet',
            category: 'network',
            resourceId: item.awsSubnetId,
            resourceLabel: `Subnet "${item.awsSubnetId}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.routeTables ?? []) {
        targets.push({
            policyId: 'aws-route-table-required-tags',
            policyName: 'Route Table Must Have Required Tags',
            resourceType: 'RouteTable',
            category: 'network',
            resourceId: item.awsRouteTableId,
            resourceLabel: `Route table "${item.awsRouteTableId}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.ecsServices ?? []) {
        targets.push({
            policyId: 'aws-ecs-service-required-tags',
            policyName: 'ECS Service Must Have Required Tags',
            resourceType: 'EcsService',
            category: 'compute',
            resourceId: item.serviceName,
            resourceLabel: `ECS service "${item.serviceName}"`,
            tags: item.tags,
        });
    }
    for (const item of resources.ecsTaskDefinitions ?? []) {
        const id = `${item.family}:${item.revision}`;
        targets.push({
            policyId: 'aws-ecs-taskdef-required-tags',
            policyName: 'ECS Task Definition Must Have Required Tags',
            resourceType: 'EcsTaskDefinition',
            category: 'compute',
            resourceId: id,
            resourceLabel: `ECS task definition "${id}"`,
            tags: item.tags,
        });
    }

    return targets;
}

function collectGcpTargets(resources: GcpTagScanResources): TagTarget[] {
    const targets: TagTarget[] = [];

    for (const item of resources.vmInstances ?? []) {
        targets.push({
            policyId: 'gcp-vm-required-labels',
            policyName: 'GCP VM Instance Must Have Required Labels',
            resourceType: 'GcpVmInstance',
            category: 'compute',
            resourceId: item.name,
            resourceLabel: `VM instance "${item.name}"`,
            tags: item.labels,
        });
    }
    for (const item of resources.storageBuckets ?? []) {
        targets.push({
            policyId: 'gcp-storage-required-labels',
            policyName: 'GCP Storage Bucket Must Have Required Labels',
            resourceType: 'GcpStorageBucket',
            category: 'storage',
            resourceId: item.name,
            resourceLabel: `Storage bucket "${item.name}"`,
            tags: item.labels,
        });
    }
    for (const item of resources.sqlInstances ?? []) {
        targets.push({
            policyId: 'gcp-sql-required-labels',
            policyName: 'GCP SQL Instance Must Have Required Labels',
            resourceType: 'GcpSqlInstance',
            category: 'storage',
            resourceId: item.name,
            resourceLabel: `Cloud SQL instance "${item.name}"`,
            tags: item.userLabels,
        });
    }
    for (const item of resources.gkeClusters ?? []) {
        targets.push({
            policyId: 'gcp-gke-required-labels',
            policyName: 'GCP GKE Cluster Must Have Required Labels',
            resourceType: 'GcpGkeCluster',
            category: 'compute',
            resourceId: item.name,
            resourceLabel: `GKE cluster "${item.name}"`,
            tags: item.resourceLabels,
        });
    }
    for (const item of resources.cloudRunServices ?? []) {
        targets.push({
            policyId: 'gcp-cloudrun-service-required-labels',
            policyName: 'GCP Cloud Run Service Must Have Required Labels',
            resourceType: 'GcpCloudRunService',
            category: 'compute',
            resourceId: item.name,
            resourceLabel: `Cloud Run service "${item.name}"`,
            tags: item.labels,
        });
    }
    for (const item of resources.cloudRunJobs ?? []) {
        targets.push({
            policyId: 'gcp-cloudrun-job-required-labels',
            policyName: 'GCP Cloud Run Job Must Have Required Labels',
            resourceType: 'GcpCloudRunJob',
            category: 'compute',
            resourceId: item.name,
            resourceLabel: `Cloud Run job "${item.name}"`,
            tags: item.labels,
        });
    }

    return targets;
}

function collectAzureTargets(resources: AzureTagScanResources): TagTarget[] {
    const targets: TagTarget[] = [];
    const push = (
        policyId: string,
        policyName: string,
        resourceType: string,
        category: string,
        resourceId: string,
        resourceLabel: string,
        tags: Record<string, string> | null | undefined,
    ) => {
        targets.push({ policyId, policyName, resourceType, category, resourceId, resourceLabel, tags });
    };

    for (const item of resources.virtualMachines ?? []) {
        push(
            'azure-vm-required-tags',
            'Azure VM Must Have Required Tags',
            'AzureVirtualMachine',
            'compute',
            item.azureId || item.name,
            `Azure VM "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.storageAccounts ?? []) {
        push(
            'azure-storage-required-tags',
            'Azure Storage Account Must Have Required Tags',
            'AzureStorageAccount',
            'storage',
            item.azureId || item.name,
            `Azure storage account "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.sqlDatabases ?? []) {
        push(
            'azure-sql-required-tags',
            'Azure SQL Database Must Have Required Tags',
            'AzureSqlDatabase',
            'storage',
            item.azureId || item.name,
            `Azure SQL database "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.webApps ?? []) {
        push(
            'azure-webapp-required-tags',
            'Azure Web App Must Have Required Tags',
            'AzureWebApp',
            'compute',
            item.azureId || item.name,
            `Azure Web App "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.nsgs ?? []) {
        push(
            'azure-nsg-required-tags',
            'Azure NSG Must Have Required Tags',
            'AzureNsg',
            'network',
            item.azureId || item.name,
            `Azure NSG "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.keyVaults ?? []) {
        push(
            'azure-keyvault-required-tags',
            'Azure Key Vault Must Have Required Tags',
            'AzureKeyVault',
            'encryption',
            item.azureId || item.name,
            `Azure Key Vault "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.aksClusters ?? []) {
        push(
            'azure-aks-required-tags',
            'Azure AKS Cluster Must Have Required Tags',
            'AzureAksCluster',
            'compute',
            item.azureId || item.name,
            `Azure AKS "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.disks ?? []) {
        push(
            'azure-disk-required-tags',
            'Azure Disk Must Have Required Tags',
            'AzureDisk',
            'storage',
            item.azureId || item.name,
            `Azure disk "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.virtualNetworks ?? []) {
        push(
            'azure-vnet-required-tags',
            'Azure Virtual Network Must Have Required Tags',
            'AzureVirtualNetwork',
            'network',
            item.azureId || item.name,
            `Azure VNet "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.loadBalancers ?? []) {
        push(
            'azure-lb-required-tags',
            'Azure Load Balancer Must Have Required Tags',
            'AzureLoadBalancer',
            'network',
            item.azureId || item.name,
            `Azure load balancer "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.cosmosAccounts ?? []) {
        push(
            'azure-cosmos-required-tags',
            'Azure Cosmos DB Must Have Required Tags',
            'AzureCosmosDb',
            'storage',
            item.azureId || item.name,
            `Azure Cosmos DB "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.postgresServers ?? []) {
        push(
            'azure-postgres-required-tags',
            'Azure PostgreSQL Must Have Required Tags',
            'AzurePostgresServer',
            'storage',
            item.azureId || item.name,
            `Azure PostgreSQL "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.sqlServers ?? []) {
        push(
            'azure-sql-server-required-tags',
            'Azure SQL Server Must Have Required Tags',
            'AzureSqlServer',
            'storage',
            item.azureId || item.name,
            `Azure SQL Server "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.appServicePlans ?? []) {
        push(
            'azure-asp-required-tags',
            'Azure App Service Plan Must Have Required Tags',
            'AzureAppServicePlan',
            'compute',
            item.azureId || item.name,
            `Azure App Service Plan "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.resourceGroups ?? []) {
        push(
            'azure-rg-required-tags',
            'Azure Resource Group Must Have Required Tags',
            'AzureResourceGroup',
            'identity',
            item.azureId || item.name,
            `Azure resource group "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.applicationGateways ?? []) {
        push(
            'azure-appgw-required-tags',
            'Azure Application Gateway Must Have Required Tags',
            'AzureApplicationGateway',
            'network',
            item.azureId || item.name,
            `Azure Application Gateway "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.publicIps ?? []) {
        push(
            'azure-pip-required-tags',
            'Azure Public IP Must Have Required Tags',
            'AzurePublicIp',
            'network',
            item.azureId || item.name,
            `Azure Public IP "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.networkInterfaces ?? []) {
        push(
            'azure-nic-required-tags',
            'Azure Network Interface Must Have Required Tags',
            'AzureNetworkInterface',
            'network',
            item.azureId || item.name,
            `Azure NIC "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.vmss ?? []) {
        push(
            'azure-vmss-required-tags',
            'Azure VMSS Must Have Required Tags',
            'AzureVmss',
            'compute',
            item.azureId || item.name,
            `Azure VMSS "${item.name}"`,
            item.tags,
        );
    }
    for (const item of resources.recoveryVaults ?? []) {
        push(
            'azure-recovery-vault-required-tags',
            'Azure Recovery Vault Must Have Required Tags',
            'AzureRecoveryVault',
            'storage',
            item.azureId || item.name,
            `Azure Recovery Vault "${item.name}"`,
            item.tags,
        );
    }

    return targets;
}

/**
 * Evaluates organization knowledge-base required tags/labels against every
 * taggable resource loaded for the current governance scan.
 */
export function evaluateOrgKnowledgeTags(input: {
    provider: string;
    context: PolicyContext;
    resources: AwsTagScanResources | GcpTagScanResources | AzureTagScanResources;
}): OrgTagFinding[] {
    if (!(input.context.orgRules?.requiredTags?.length)) {
        return [];
    }

    const provider = input.provider.trim().toLowerCase();
    const targets =
        provider === 'aws'
            ? collectAwsTargets(input.resources as AwsTagScanResources)
            : provider === 'gcp'
              ? collectGcpTargets(input.resources as GcpTagScanResources)
              : provider === 'azure'
                ? collectAzureTargets(input.resources as AzureTagScanResources)
                : [];

    if (targets.length === 0) return [];

    const findings: OrgTagFinding[] = [];
    for (const target of targets) {
        const requiredTags = resolveApplicableRequiredTags(
            input.context,
            provider as 'aws' | 'gcp' | 'azure',
            target.resourceType,
        );
        if (!requiredTags?.length) continue;

        const result = evaluateRequiredTagsFinding({
            resourceId: target.resourceId,
            resourceType: target.resourceType,
            resourceLabel: target.resourceLabel,
            tags: asTags(target.tags),
            requiredTags,
        });

        findings.push({
            ...result,
            policyId: target.policyId,
            policyName: target.policyName,
            severity: 'medium',
            category: target.category,
        });
    }

    return findings;
}
