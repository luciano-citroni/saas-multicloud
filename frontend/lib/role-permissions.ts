export function buildTrustPolicy(externalId: string) {
    return {
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Principal: {
                    AWS: ['arn:aws:iam::<PLATFORM_ACCOUNT_ID>:root', process.env.AWS_USER_ARN || 'arn:aws:iam::371117669756:user/saas-multicloud'],
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
    ],
};
