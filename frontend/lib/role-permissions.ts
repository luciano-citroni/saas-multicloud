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
            Action: ['ce:GetCostAndUsage', 'ce:GetCostForecast', 'ce:GetReservationUtilization', 'ce:GetRightsizingRecommendation'],
            Resource: '*',
        },
    ],
};

/**
 * Permissões adicionais para o módulo de Automação (S3 + CloudFront).
 * Deve estar alinhada com `backend/src/automation/action-definitions.ts`.
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
                'cloudfront:TagResource',
            ],
            Resource: '*',
        },
    ],
};
