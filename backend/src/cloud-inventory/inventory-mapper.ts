export type InventoryProvider = 'aws' | 'azure' | 'gcp';

export type InventoryResource = {
    id: string;
    name: string;
    resourceType: string;
    region: string | null;
    status: string | null;
    /** Provider birth date when known; never the DB sync `created_at`. */
    createdAt: string | null;
    provider: InventoryProvider;
    /** Type-specific fields for browse detail tables (instance type, SKU, IPs, etc.). */
    attributes: Record<string, string | null>;
    /** AWS/Azure tags or GCP labels. */
    tags: Record<string, string>;
};

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
    return value && typeof value === 'object' ? (value as RawRecord) : {};
}

function toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickString(record: RawRecord, keys: string[]): string | null {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
}

function pickName(record: RawRecord, fallbackKeys: string[] = []): string {
    const tags = record.tags;
    const tagName =
        tags && typeof tags === 'object' && tags !== null
            ? pickString(tags as RawRecord, ['Name', 'name'])
            : null;

    return (
        pickString(record, [
            'name',
            'bucketName',
            'functionName',
            'roleName',
            'clusterName',
            'serviceName',
            'queueName',
            'topicName',
            'tableName',
            'distributionId',
            'awsVpcId',
            'awsInstanceId',
            'awsSubnetId',
            'awsSecurityGroupId',
            'groupName',
            'alarmName',
            'keyId',
            'secretName',
            'repositoryName',
            'apiName',
            'zoneName',
            'trailName',
            'email',
            'displayName',
            'loadBalancerName',
            'listenerArn',
            'webAclName',
            'detectorId',
            ...fallbackKeys,
        ]) ||
        tagName ||
        (typeof record.id === 'string' ? record.id : 'unknown')
    );
}

function pickRegion(record: RawRecord): string | null {
    return pickString(record, [
        'region',
        'location',
        'zone',
        'availabilityZone',
        'homeRegion',
        'primaryRegion',
    ]);
}

function pickStatus(record: RawRecord): string | null {
    return pickString(record, ['state', 'status', 'provisioningState', 'runtime']);
}

function pickBirthDate(record: RawRecord, nativeKeys: string[]): Date | null {
    for (const key of nativeKeys) {
        const native = toDate(record[key]);
        if (native) return native;
    }
    // Never fall back to DB `createdAt` — that is first-seen/sync time, not resource birth.
    return null;
}

function pickAttributes(record: RawRecord, keys: string[]): Record<string, string | null> {
    const attributes: Record<string, string | null> = {};
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            attributes[key] = String(value);
        } else if (value == null) {
            attributes[key] = null;
        }
    }
    return attributes;
}

function pickTags(record: RawRecord): Record<string, string> {
    const source = record.tags ?? record.labels;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    const tags: Record<string, string> = {};
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if (typeof value === 'string' && key.trim()) {
            tags[key] = value;
        } else if ((typeof value === 'number' || typeof value === 'boolean') && key.trim()) {
            tags[key] = String(value);
        }
    }
    return tags;
}

function mapItem(
    raw: unknown,
    resourceType: string,
    provider: InventoryProvider,
    nativeDateKeys: string[] = [],
    nameFallbackKeys: string[] = [],
    attributeKeys: string[] = [],
): InventoryResource {
    const record = asRecord(raw);
    const createdAt = pickBirthDate(record, nativeDateKeys);

    return {
        id: typeof record.id === 'string' ? record.id : `${resourceType}-${pickName(record, nameFallbackKeys)}`,
        name: pickName(record, nameFallbackKeys),
        resourceType,
        region: pickRegion(record),
        status: pickStatus(record),
        createdAt: createdAt ? createdAt.toISOString() : null,
        provider,
        attributes: pickAttributes(record, attributeKeys),
        tags: pickTags(record),
    };
}

function mapCollection(
    items: unknown[] | undefined,
    resourceType: string,
    provider: InventoryProvider,
    nativeDateKeys: string[] = [],
    nameFallbackKeys: string[] = [],
    attributeKeys: string[] = [],
): InventoryResource[] {
    if (!Array.isArray(items) || items.length === 0) return [];
    return items.map((item) =>
        mapItem(item, resourceType, provider, nativeDateKeys, nameFallbackKeys, attributeKeys),
    );
}

export function flattenAwsInventory(data: Record<string, unknown[]>): InventoryResource[] {
    return [
        ...mapCollection(data.vpcs, 'VPC', 'aws', [], [], ['cidrBlock', 'isDefault', 'awsVpcId']),
        ...mapCollection(data.subnets, 'Subnet', 'aws', [], [], ['cidrBlock', 'availabilityZone', 'awsSubnetId']),
        ...mapCollection(data.routeTables, 'Route Table', 'aws', [], [], ['awsRouteTableId']),
        ...mapCollection(
            data.ec2Instances,
            'EC2 Instance',
            'aws',
            ['launchTime'],
            ['awsInstanceId'],
            ['instanceType', 'awsInstanceId', 'privateIpAddress', 'publicIpAddress', 'availabilityZone', 'keyName'],
        ),
        ...mapCollection(data.ecsClusters, 'ECS Cluster', 'aws', [], [], ['status', 'clusterArn']),
        ...mapCollection(
            data.ecsTaskDefinitions,
            'ECS Task Definition',
            'aws',
            ['registeredAt'],
            ['family'],
            ['family', 'revision'],
        ),
        ...mapCollection(
            data.ecsServices,
            'ECS Service',
            'aws',
            ['createdAtAws'],
            [],
            ['desiredCount', 'runningCount', 'launchType'],
        ),
        ...mapCollection(data.eksClusters, 'EKS Cluster', 'aws', ['createdAtAws'], [], ['version', 'status']),
        ...mapCollection(data.loadBalancers, 'Load Balancer', 'aws', ['createdTime'], [], ['type', 'scheme', 'dnsName']),
        ...mapCollection(data.loadBalancerListeners, 'LB Listener', 'aws', [], ['listenerArn'], ['protocol', 'port']),
        ...mapCollection(
            data.securityGroups,
            'Security Group',
            'aws',
            [],
            ['groupName', 'awsSecurityGroupId'],
            ['groupName', 'awsSecurityGroupId', 'description'],
        ),
        ...mapCollection(data.iamRoles, 'IAM Role', 'aws', ['createdDateAws'], ['roleName'], ['roleName', 'arn']),
        ...mapCollection(
            data.rdsInstances,
            'RDS Instance',
            'aws',
            ['instanceCreateTime', 'createdAtAws'],
            ['dbInstanceIdentifier'],
            ['engine', 'engineVersion', 'dbInstanceClass', 'endpoint'],
        ),
        ...mapCollection(
            data.s3Buckets,
            'S3 Bucket',
            'aws',
            ['creationDate'],
            ['bucketName'],
            ['bucketName', 'region', 'versioningStatus'],
        ),
        ...mapCollection(
            data.cloudFrontDistributions,
            'CloudFront Distribution',
            'aws',
            [],
            ['distributionId'],
            ['domainName', 'status'],
        ),
        ...mapCollection(data.route53HostedZones, 'Route53 Hosted Zone', 'aws', [], ['name', 'zoneName'], ['privateZone']),
        ...mapCollection(data.cloudWatchAlarms, 'CloudWatch Alarm', 'aws', [], ['alarmName'], ['metricName', 'namespace']),
        ...mapCollection(data.cloudTrailTrails, 'CloudTrail Trail', 'aws', [], ['name', 'trailName'], ['homeRegion', 'isMultiRegionTrail']),
        ...mapCollection(
            data.lambdaFunctions,
            'Lambda Function',
            'aws',
            ['lastModifiedAtAws'],
            ['functionName'],
            ['runtime', 'memorySize', 'timeout', 'handler'],
        ),
        ...mapCollection(
            data.apiGatewayRestApis,
            'API Gateway REST API',
            'aws',
            ['createdAtAws'],
            ['name', 'apiName'],
            ['apiId'],
        ),
        ...mapCollection(data.kmsKeys, 'KMS Key', 'aws', ['createdAtAws'], ['keyId', 'alias'], ['keyId', 'keyState', 'keyUsage']),
        ...mapCollection(
            data.secretsManagerSecrets,
            'Secrets Manager Secret',
            'aws',
            ['createdAtAws'],
            ['name', 'secretName'],
            ['arn'],
        ),
        ...mapCollection(
            data.ecrRepositories,
            'ECR Repository',
            'aws',
            ['createdAtAws'],
            ['repositoryName', 'name'],
            ['repositoryUri'],
        ),
        ...mapCollection(
            data.dynamoDbTables,
            'DynamoDB Table',
            'aws',
            ['createdAtAws'],
            ['tableName', 'name'],
            ['tableStatus', 'billingMode'],
        ),
        ...mapCollection(
            data.elastiCacheClusters,
            'ElastiCache Cluster',
            'aws',
            ['createdAtAws'],
            ['cacheClusterId', 'name'],
            ['engine', 'cacheNodeType'],
        ),
        ...mapCollection(data.sqsQueues, 'SQS Queue', 'aws', ['createdAtAws'], ['queueName', 'name'], ['queueUrl']),
        ...mapCollection(data.snsTopics, 'SNS Topic', 'aws', [], ['topicName', 'name'], ['topicArn']),
        ...mapCollection(data.wafWebAcls, 'WAF Web ACL', 'aws', [], ['name', 'webAclName'], ['scope']),
        ...mapCollection(data.guardDutyDetectors, 'GuardDuty Detector', 'aws', ['createdAtAws'], ['detectorId'], ['status']),
    ];
}

export function flattenAzureInventory(data: Record<string, unknown[]>): InventoryResource[] {
    return [
        ...mapCollection(data.subscriptions, 'Subscription', 'azure', [], [], ['subscriptionId', 'displayName']),
        ...mapCollection(data.resourceGroups, 'Resource Group', 'azure', [], [], ['location']),
        ...mapCollection(
            data.virtualMachines,
            'Virtual Machine',
            'azure',
            [],
            [],
            ['vmSize', 'osType', 'resourceGroup', 'provisioningState'],
        ),
        ...mapCollection(data.vmss, 'VM Scale Set', 'azure', [], [], ['skuName', 'capacity', 'resourceGroup']),
        ...mapCollection(data.aksClusters, 'AKS Cluster', 'azure', [], [], ['kubernetesVersion', 'resourceGroup']),
        ...mapCollection(data.disks, 'Disk', 'azure', [], [], ['diskSizeGb', 'skuName', 'resourceGroup']),
        ...mapCollection(data.webApps, 'Web App', 'azure', [], [], ['kind', 'state', 'resourceGroup']),
        ...mapCollection(data.appServicePlans, 'App Service Plan', 'azure', [], [], ['skuName', 'resourceGroup']),
        ...mapCollection(data.virtualNetworks, 'Virtual Network', 'azure', [], [], ['resourceGroup']),
        ...mapCollection(data.networkInterfaces, 'Network Interface', 'azure', [], [], ['resourceGroup']),
        ...mapCollection(data.publicIps, 'Public IP', 'azure', [], [], ['ipAddress', 'resourceGroup']),
        ...mapCollection(data.nsgs, 'Network Security Group', 'azure', [], [], ['resourceGroup']),
        ...mapCollection(data.loadBalancers, 'Load Balancer', 'azure', [], [], ['skuName', 'resourceGroup']),
        ...mapCollection(data.applicationGateways, 'Application Gateway', 'azure', [], [], ['resourceGroup']),
        ...mapCollection(data.storageAccounts, 'Storage Account', 'azure', [], [], ['kind', 'skuName', 'resourceGroup']),
        ...mapCollection(data.sqlServers, 'SQL Server', 'azure', [], [], ['version', 'resourceGroup']),
        ...mapCollection(data.sqlDatabases, 'SQL Database', 'azure', [], [], ['status', 'resourceGroup']),
        ...mapCollection(data.postgresServers, 'PostgreSQL Server', 'azure', [], [], ['version', 'resourceGroup']),
        ...mapCollection(data.cosmosDbAccounts, 'Cosmos DB', 'azure', [], [], ['kind', 'resourceGroup']),
        ...mapCollection(data.keyVaults, 'Key Vault', 'azure', [], [], ['resourceGroup']),
        ...mapCollection(data.recoveryVaults, 'Recovery Vault', 'azure', [], [], ['resourceGroup']),
    ];
}

export function flattenGcpInventory(data: Record<string, unknown[]>): InventoryResource[] {
    return [
        ...mapCollection(
            data.vmInstances,
            'VM Instance',
            'gcp',
            ['creationTimestamp'],
            [],
            ['machineType', 'zone', 'networkIp', 'externalIp', 'status'],
        ),
        ...mapCollection(data.vpcNetworks, 'VPC Network', 'gcp', ['creationTimestamp'], [], ['autoCreateSubnetworks']),
        ...mapCollection(data.subnetworks, 'Subnetwork', 'gcp', ['creationTimestamp'], [], ['ipCidrRange', 'region', 'network']),
        ...mapCollection(data.firewallRules, 'Firewall Rule', 'gcp', ['creationTimestamp'], [], ['direction', 'priority', 'disabled']),
        ...mapCollection(data.storageBuckets, 'Storage Bucket', 'gcp', ['timeCreated'], [], ['location', 'storageClass']),
        ...mapCollection(
            data.sqlInstances,
            'Cloud SQL Instance',
            'gcp',
            ['createTime'],
            [],
            ['databaseVersion', 'tier', 'region', 'state'],
        ),
        ...mapCollection(
            data.serviceAccounts,
            'Service Account',
            'gcp',
            [],
            ['email', 'displayName'],
            ['email', 'displayName', 'disabled'],
        ),
        ...mapCollection(
            data.gkeClusters,
            'GKE Cluster',
            'gcp',
            ['createTime'],
            [],
            ['location', 'status', 'currentMasterVersion'],
        ),
        ...mapCollection(data.cdnBackendServices, 'CDN Backend Service', 'gcp', [], [], ['protocol', 'loadBalancingScheme']),
        ...mapCollection(data.cloudRunServices, 'Cloud Run Service', 'gcp', ['createTime'], [], ['location', 'uri']),
        ...mapCollection(data.cloudRunJobs, 'Cloud Run Job', 'gcp', ['createTime'], [], ['location']),
    ];
}

export type InventoryPeriod = 'thismonth' | 'last6months' | 'last12months' | 'ytd' | 'all';

export function resolvePeriodStart(period: InventoryPeriod, now = new Date()): Date | null {
    if (period === 'all') return null;

    if (period === 'thismonth') {
        return startOfCurrentMonth(now);
    }

    if (period === 'ytd') {
        return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    }

    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const months = period === 'last6months' ? 6 : 12;
    start.setUTCMonth(start.getUTCMonth() - (months - 1));
    return start;
}

export function monthKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

export function buildMonthlySeries(
    resources: InventoryResource[],
    period: InventoryPeriod,
    now = new Date(),
): Array<{ month: string; count: number }> {
    const start = resolvePeriodStart(period === 'all' ? 'last12months' : period, now) ?? resolvePeriodStart('last12months', now)!;
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const buckets = new Map<string, number>();
    for (let cursor = new Date(start); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
        buckets.set(monthKey(cursor), 0);
    }

    for (const resource of resources) {
        if (!resource.createdAt) continue;
        const created = toDate(resource.createdAt);
        if (!created) continue;
        const key = monthKey(created);
        if (!buckets.has(key)) continue;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
}

export function startOfCurrentMonth(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
