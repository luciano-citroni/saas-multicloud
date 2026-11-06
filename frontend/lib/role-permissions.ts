const DEFAULT_PLATFORM_USER_ARN = 'arn:aws:iam::069637868680:user/saas-multicloud';

/**
 * ARN do usuário IAM da plataforma que assume roles nos clientes.
 * Configure via NEXT_PUBLIC_AWS_USER_ARN no frontend (deve ser o mesmo de AWS_USER_ARN no backend).
 */
export function getPlatformUserArn(): string {
    return process.env.NEXT_PUBLIC_AWS_USER_ARN?.trim() || DEFAULT_PLATFORM_USER_ARN;
}

export function buildTrustPolicy(externalId: string) {
    return {
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Principal: {
                    AWS: getPlatformUserArn(),
                },
                Action: 'sts:AssumeRole',
                Condition: {
                    StringEquals: {
                        'sts:ExternalId': externalId,
                    },
                },
            },
        ],
    };
}

export const PERMISSIONS_POLICY = {
    Version: '2012-10-17',
    Statement: [
        {
            Sid: 'EC2ReadAccess',
            Effect: 'Allow',
            Action: ['ec2:DescribeInstances', 'ec2:DescribeVpcs', 'ec2:DescribeSubnets', 'ec2:DescribeSecurityGroups', 'ec2:DescribeRouteTables'],
            Resource: '*',
        },
        {
            Sid: 'S3ReadAccess',
            Effect: 'Allow',
            Action: [
                's3:ListAllMyBuckets',
                's3:GetBucketLocation',
                's3:GetBucketVersioning',
                's3:GetEncryptionConfiguration',
                's3:GetBucketPublicAccessBlock',
                's3:GetBucketPolicy',
                's3:GetReplicationConfiguration',
                's3:GetBucketLogging',
                's3:GetBucketWebsite',
                's3:GetLifecycleConfiguration',
                's3:GetBucketTagging',
            ],
            Resource: '*',
        },
        {
            Sid: 'RDSReadAccess',
            Effect: 'Allow',
            Action: ['rds:DescribeDBInstances', 'rds:ListTagsForResource'],
            Resource: '*',
        },
        {
            Sid: 'ECSReadAccess',
            Effect: 'Allow',
            Action: [
                'ecs:ListClusters',
                'ecs:DescribeClusters',
                'ecs:ListTaskDefinitions',
                'ecs:DescribeTaskDefinition',
                'ecs:ListServices',
                'ecs:DescribeServices',
            ],
            Resource: '*',
        },
        {
            Sid: 'EKSReadAccess',
            Effect: 'Allow',
            Action: ['eks:ListClusters', 'eks:DescribeCluster'],
            Resource: '*',
        },
        {
            Sid: 'LambdaReadAccess',
            Effect: 'Allow',
            Action: ['lambda:ListFunctions', 'lambda:ListTags'],
            Resource: '*',
        },
        {
            Sid: 'IAMReadAccess',
            Effect: 'Allow',
            Action: ['iam:ListRoles', 'iam:GetRole', 'iam:ListAttachedRolePolicies', 'iam:ListRolePolicies'],
            Resource: '*',
        },
        {
            Sid: 'CloudFrontReadAccess',
            Effect: 'Allow',
            Action: ['cloudfront:ListDistributions', 'cloudfront:GetDistribution'],
            Resource: '*',
        },
        {
            Sid: 'Route53ReadAccess',
            Effect: 'Allow',
            Action: ['route53:ListHostedZones', 'route53:ListTagsForResource', 'route53:GetHostedZone'],
            Resource: '*',
        },
        {
            Sid: 'CloudWatchReadAccess',
            Effect: 'Allow',
            Action: ['cloudwatch:DescribeAlarms'],
            Resource: '*',
        },
        {
            Sid: 'CloudTrailReadAccess',
            Effect: 'Allow',
            Action: ['cloudtrail:DescribeTrails', 'cloudtrail:GetTrailStatus', 'cloudtrail:ListTags'],
            Resource: '*',
        },
        {
            Sid: 'KMSReadAccess',
            Effect: 'Allow',
            Action: ['kms:ListKeys', 'kms:DescribeKey', 'kms:GetKeyRotationStatus', 'kms:ListResourceTags'],
            Resource: '*',
        },
        {
            Sid: 'SecretsManagerReadAccess',
            Effect: 'Allow',
            Action: ['secretsmanager:ListSecrets'],
            Resource: '*',
        },
        {
            Sid: 'ECRReadAccess',
            Effect: 'Allow',
            Action: ['ecr:DescribeRepositories', 'ecr:ListTagsForResource'],
            Resource: '*',
        },
        {
            Sid: 'DynamoDBReadAccess',
            Effect: 'Allow',
            Action: ['dynamodb:ListTables', 'dynamodb:DescribeTable', 'dynamodb:DescribeContinuousBackups', 'dynamodb:ListTagsOfResource'],
            Resource: '*',
        },
        {
            Sid: 'ElastiCacheReadAccess',
            Effect: 'Allow',
            Action: ['elasticache:DescribeCacheClusters', 'elasticache:ListTagsForResource'],
            Resource: '*',
        },
        {
            Sid: 'SQSReadAccess',
            Effect: 'Allow',
            Action: ['sqs:ListQueues', 'sqs:GetQueueAttributes', 'sqs:ListQueueTags'],
            Resource: '*',
        },
        {
            Sid: 'SNSReadAccess',
            Effect: 'Allow',
            Action: ['sns:ListTopics', 'sns:GetTopicAttributes', 'sns:ListTagsForResource'],
            Resource: '*',
        },
        {
            Sid: 'WAFReadAccess',
            Effect: 'Allow',
            Action: ['wafv2:ListWebACLs', 'wafv2:GetWebACL', 'wafv2:ListTagsForResource'],
            Resource: '*',
        },
        {
            Sid: 'GuardDutyReadAccess',
            Effect: 'Allow',
            Action: ['guardduty:ListDetectors', 'guardduty:GetDetector', 'guardduty:GetFindingsStatistics', 'guardduty:ListTagsForResource'],
            Resource: '*',
        },
        {
            Sid: 'ELBReadAccess',
            Effect: 'Allow',
            Action: ['elasticloadbalancing:DescribeLoadBalancers', 'elasticloadbalancing:DescribeListeners'],
            Resource: '*',
        },
        {
            Sid: 'APIGatewayReadAccess',
            Effect: 'Allow',
            Action: ['apigateway:GET'],
            Resource: '*',
        },
        {
            Sid: 'CostExplorerReadAccess',
            Effect: 'Allow',
            Action: [
                'ce:GetCostAndUsage',
                'ce:GetCostAndUsageWithResources',
                'ce:GetCostForecast',
                'ce:GetReservationUtilization',
                'ce:GetRightsizingRecommendation',
                'ce:GetSavingsPlansUtilization',
                'ce:GetSavingsPlansCoverage',
                'ce:GetSavingsPlansPurchaseRecommendation',
            ],
            Resource: '*',
        },
        {
            Sid: 'BillingCreditsReadAccess',
            Effect: 'Allow',
            Action: ['billing:GetCredits', 'billing:GetCreditAllocationHistory', 'aws-portal:ViewBilling'],
            Resource: '*',
        },
    ],
};

/**
 * Permissões adicionais para o módulo de Automação.
 * Alinhada com `backend/src/automation/action-definitions.ts`
 * (`requiredIamActions` + `ROLLBACK_IAM_ACTIONS` das actions implementadas).
 */
export const AUTOMATION_PERMISSIONS_POLICY = {
    Version: '2012-10-17',
    Statement: [
        {
            Sid: 'S3AutomationAccess',
            Effect: 'Allow',
            Action: [
                's3:CreateBucket',
                's3:ListBucket',
                's3:ListBucketVersions',
                's3:PutBucketVersioning',
                's3:PutEncryptionConfiguration',
                's3:PutBucketPublicAccessBlock',
                's3:DeleteObject',
                's3:DeleteObjectVersion',
                's3:DeleteBucket',
            ],
            Resource: '*',
        },
        {
            Sid: 'CloudFrontAutomationAccess',
            Effect: 'Allow',
            Action: [
                'cloudfront:CreateDistribution',
                'cloudfront:GetDistribution',
                'cloudfront:GetDistributionConfig',
                'cloudfront:UpdateDistribution',
                'cloudfront:DeleteDistribution',
            ],
            Resource: '*',
        },
        {
            Sid: 'EcsAutomationAccess',
            Effect: 'Allow',
            Action: [
                'ecs:CreateCluster',
                'ecs:DescribeClusters',
                'ecs:DeleteCluster',
                'ecs:RegisterTaskDefinition',
                'ecs:TagResource',
                'ecs:DescribeServices',
                'ecs:DescribeTaskDefinition',
                'ecs:DescribeTasks',
            ],
            Resource: '*',
        },
        {
            Sid: 'EcrAutomationAccess',
            Effect: 'Allow',
            Action: [
                'ecr:CreateRepository',
                'ecr:DescribeRepositories',
                'ecr:TagResource',
                'ecr:DeleteRepository',
            ],
            Resource: '*',
        },
        {
            Sid: 'ElbAutomationAccess',
            Effect: 'Allow',
            Action: [
                'elasticloadbalancing:CreateLoadBalancer',
                'elasticloadbalancing:DescribeLoadBalancers',
                'elasticloadbalancing:AddTags',
                'elasticloadbalancing:DeleteLoadBalancer',
                'elasticloadbalancing:DescribeTargetGroups',
            ],
            Resource: '*',
        },
        {
            Sid: 'LambdaAutomationAccess',
            Effect: 'Allow',
            Action: [
                'lambda:CreateFunction',
                'lambda:GetFunction',
                'lambda:TagResource',
                'lambda:DeleteFunction',
            ],
            Resource: '*',
        },
        {
            Sid: 'IamAutomationAccess',
            Effect: 'Allow',
            Action: [
                'iam:CreateRole',
                'iam:AttachRolePolicy',
                'iam:GetRole',
                'iam:TagRole',
                'iam:ListAttachedRolePolicies',
                'iam:ListRolePolicies',
                'iam:GetRolePolicy',
                'iam:PutRolePolicy',
                'iam:DetachRolePolicy',
                'iam:DeleteRole',
                'iam:SimulatePrincipalPolicy',
            ],
            Resource: '*',
        },
        {
            Sid: 'Ec2AutomationAccess',
            Effect: 'Allow',
            Action: [
                'ec2:CreateSecurityGroup',
                'ec2:DescribeSecurityGroups',
                'ec2:DeleteSecurityGroup',
                'ec2:CreateVpc',
                'ec2:DescribeVpcs',
                'ec2:DeleteVpc',
                'ec2:CreateSubnet',
                'ec2:DescribeSubnets',
                'ec2:DeleteSubnet',
                'ec2:ModifySubnetAttribute',
                'ec2:CreateRouteTable',
                'ec2:DescribeRouteTables',
                'ec2:DeleteRouteTable',
                'ec2:CreateNatGateway',
                'ec2:DescribeNatGateways',
                'ec2:DeleteNatGateway',
                'ec2:AllocateAddress',
                'ec2:ReleaseAddress',
                'ec2:RunInstances',
                'ec2:DescribeInstances',
                'ec2:TerminateInstances',
                'ec2:CreateTags',
            ],
            Resource: '*',
        },
        {
            Sid: 'RdsAutomationAccess',
            Effect: 'Allow',
            Action: [
                'rds:CreateDBInstance',
                'rds:DescribeDBInstances',
                'rds:AddTagsToResource',
                'rds:DeleteDBInstance',
            ],
            Resource: '*',
        },
        {
            Sid: 'AmplifyAutomationAccess',
            Effect: 'Allow',
            Action: ['amplify:CreateApp', 'amplify:GetApp', 'amplify:TagResource', 'amplify:DeleteApp'],
            Resource: '*',
        },
        {
            Sid: 'ApiGatewayAutomationAccess',
            Effect: 'Allow',
            Action: ['apigateway:POST', 'apigateway:GET', 'apigateway:DELETE'],
            Resource: '*',
        },
        {
            Sid: 'CloudFormationAutomationAccess',
            Effect: 'Allow',
            Action: [
                'cloudformation:ValidateTemplate',
                'cloudformation:CreateChangeSet',
                'cloudformation:DescribeChangeSet',
                'cloudformation:ExecuteChangeSet',
                'cloudformation:DescribeStacks',
                'cloudformation:DescribeStackResources',
                'cloudformation:DeleteChangeSet',
                'cloudformation:DeleteStack',
            ],
            Resource: '*',
        },
        {
            Sid: 'ExistingResourceLookupAccess',
            Effect: 'Allow',
            Action: [
                'ec2:DescribeVpcs',
                'ec2:DescribeSubnets',
                'ec2:DescribeSecurityGroups',
                'ecs:DescribeClusters',
                'ecr:DescribeRepositories',
                'elasticloadbalancing:DescribeLoadBalancers',
                'iam:GetRole',
                'secretsmanager:DescribeSecret',
            ],
            Resource: '*',
        },
        {
            Sid: 'StsAutomationAccess',
            Effect: 'Allow',
            Action: ['sts:GetCallerIdentity'],
            Resource: '*',
        },
    ],
};

/** Resumo dos serviços cobertos pela policy de automação (UI de onboarding). */
export const AUTOMATION_PERMISSIONS_SERVICE_SUMMARY: Array<{ service: string; actions: string }> = [
    { service: 'S3', actions: 'CreateBucket, versioning, encryption, delete' },
    { service: 'CloudFront', actions: 'CreateDistribution, Get/Update/Delete' },
    { service: 'ECS / ECR', actions: 'Cluster, task definition, repository' },
    { service: 'ELB / EC2 / VPC', actions: 'LB, SG, VPC, subnet, NAT, instance' },
    {
        service: 'Lambda / IAM',
        actions: 'Function, role, SimulatePrincipalPolicy, PutRolePolicy, GetRolePolicy',
    },
    { service: 'RDS / Amplify / API GW', actions: 'Instance, app, REST API' },
    { service: 'CloudFormation', actions: 'Change set, stack, describe, delete' },
    { service: 'STS / Secrets', actions: 'GetCallerIdentity, DescribeSecret' },
];
