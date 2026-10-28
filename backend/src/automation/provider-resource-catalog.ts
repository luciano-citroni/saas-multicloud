export type AutomationProvider = 'AWS' | 'GCP' | 'AZURE';

export interface CreatableResourceDefinition {
    id: string;
    provider: AutomationProvider;
    actionType: string;
    label: string;
    category: string;
    description?: string;
}

export function normalizeAutomationProvider(raw: string | null | undefined): AutomationProvider | null {
    if (!raw) return null;
    const value = raw.trim().toUpperCase();
    if (value === 'AWS' || value === 'GCP' || value === 'AZURE') return value;
    return null;
}

const AWS_CREATABLE: CreatableResourceDefinition[] = [
    { id: 'ecs', provider: 'AWS', actionType: 'AWS_ECS_CLUSTER_CREATE', label: 'ECS Cluster', category: 'Compute', description: 'Cluster ECS' },
    { id: 'task_definition', provider: 'AWS', actionType: 'AWS_ECS_TASK_DEFINITION_CREATE', label: 'Task Definition', category: 'Compute', description: 'Task definition ECS' },
    { id: 'ecr', provider: 'AWS', actionType: 'AWS_ECR_REPOSITORY_CREATE', label: 'ECR', category: 'Containers', description: 'Repositório ECR' },
    { id: 'load_balancer', provider: 'AWS', actionType: 'AWS_LOAD_BALANCER_CREATE', label: 'Load Balancer', category: 'Networking', description: 'Application Load Balancer' },
    { id: 's3', provider: 'AWS', actionType: 'AWS_S3_BUCKET_CREATE', label: 'S3', category: 'Storage', description: 'Bucket S3' },
    { id: 'lambda', provider: 'AWS', actionType: 'AWS_LAMBDA_FUNCTION_CREATE', label: 'Lambda', category: 'Compute', description: 'Função Lambda' },
    { id: 'iam_role', provider: 'AWS', actionType: 'AWS_IAM_ROLE_CREATE', label: 'IAM Role', category: 'Security', description: 'Role IAM' },
    { id: 'security_group', provider: 'AWS', actionType: 'AWS_SECURITY_GROUP_CREATE', label: 'Security Group', category: 'Networking', description: 'Security group EC2' },
    { id: 'vpc', provider: 'AWS', actionType: 'AWS_VPC_CREATE', label: 'VPC', category: 'Networking', description: 'Virtual Private Cloud' },
    { id: 'subnet', provider: 'AWS', actionType: 'AWS_SUBNET_CREATE', label: 'Subnet', category: 'Networking', description: 'Subnet' },
    { id: 'route_table', provider: 'AWS', actionType: 'AWS_ROUTE_TABLE_CREATE', label: 'Tabela de Rota', category: 'Networking', description: 'Route table' },
    { id: 'nat', provider: 'AWS', actionType: 'AWS_NAT_GATEWAY_CREATE', label: 'NAT Gateway', category: 'Networking', description: 'NAT Gateway' },
    { id: 'rds', provider: 'AWS', actionType: 'AWS_RDS_INSTANCE_CREATE', label: 'RDS', category: 'Database', description: 'Instância RDS' },
    { id: 'ec2', provider: 'AWS', actionType: 'AWS_EC2_INSTANCE_CREATE', label: 'EC2', category: 'Compute', description: 'Instância EC2' },
    { id: 'amplify', provider: 'AWS', actionType: 'AWS_AMPLIFY_APP_CREATE', label: 'Amplify', category: 'Frontend', description: 'App Amplify' },
    { id: 'api_gateway', provider: 'AWS', actionType: 'AWS_API_GATEWAY_CREATE', label: 'API Gateway', category: 'Networking', description: 'REST API' },
    { id: 'cloudfront', provider: 'AWS', actionType: 'AWS_CLOUDFRONT_DISTRIBUTION_CREATE', label: 'CloudFront', category: 'CDN', description: 'Distribuição CloudFront' },
];

const CATALOG_BY_PROVIDER: Record<AutomationProvider, CreatableResourceDefinition[]> = {
    AWS: AWS_CREATABLE,
    GCP: [],
    AZURE: [],
};

export function getCreatableResources(provider?: AutomationProvider | null): CreatableResourceDefinition[] {
    if (!provider) return Object.values(CATALOG_BY_PROVIDER).flat();
    return CATALOG_BY_PROVIDER[provider] ?? [];
}

export function listAutomationProviders(): AutomationProvider[] {
    return ['AWS', 'GCP', 'AZURE'];
}
