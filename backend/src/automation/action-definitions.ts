import { z } from 'zod';
import { AUTOMATION_ACTION_TYPES } from './constants';

const awsRegionRegex = /^[a-z]{2}(?:-(?:gov|iso|isob|isof))?-[a-z0-9-]+-\d+$/i;

export const nodeOutputReferenceSchema = z.object({
    type: z.literal('NODE_OUTPUT'),
    nodeId: z.string().min(1),
    field: z.string().min(1),
});

export const s3ActionConfigSchema = z.object({
    bucketName: z.string().min(3).max(63),
    region: z.string().regex(awsRegionRegex),
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

export const ACTION_OUTPUT_FIELDS: Record<string, readonly string[]> = {
    [AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE]: ['bucketName', 'bucketArn', 'bucketDomainName', 'alreadyExists'],
    [AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE]: ['distributionId', 'domainName', 'arn'],
};

export interface ActionDefinition {
    type: string;
    provider: 'AWS' | 'GCP' | 'AZURE';
    name: string;
    category: string;
    outputFields: readonly string[];
    requiredIamActions: readonly string[];
}

export const ACTION_DEFINITIONS: ActionDefinition[] = [
    {
        type: AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE,
        provider: 'AWS',
        name: 'Create S3 Bucket',
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
    },
    {
        type: AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE,
        provider: 'AWS',
        name: 'Create CloudFront Distribution',
        category: 'CDN',
        outputFields: ACTION_OUTPUT_FIELDS[AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE],
        requiredIamActions: ['cloudfront:CreateDistribution', 'cloudfront:GetDistribution'],
    },
];

export function getActionDefinition(type: string): ActionDefinition | undefined {
    return ACTION_DEFINITIONS.find((def) => def.type === type);
}

export function getConfigSchemaForAction(type: string): z.ZodType | undefined {
    switch (type) {
        case AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE:
            return s3ActionConfigSchema;
        case AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE:
            return cloudFrontActionConfigSchema;
        default:
            return undefined;
    }
}
