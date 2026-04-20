import { z } from 'zod';

const awsRegionRegex = /^[a-z]{2}(-gov)?-[a-z]+-\d$/i;

const ec2ConfigSchema = z.object({
    instanceType: z.string().min(1, 'Instance type é obrigatório'),
    region: z.string().regex(awsRegionRegex, 'Região AWS inválida (ex: us-east-1)'),
    amiId: z.string().min(1).optional(),
    osPreset: z.string().optional(),
    keyName: z.string().optional(),
    vpcId: z.string().optional(),
    subnetId: z.string().optional(),
    securityGroupIds: z.array(z.string()).optional(),
    diskType: z.enum(['gp3', 'gp2', 'io1', 'st1', 'sc1']).optional(),
    diskSizeGb: z.number().int().positive().optional(),
    diskIops: z.number().int().positive().optional(),
    diskThroughput: z.number().int().positive().optional(),
    diskDeleteOnTermination: z.boolean().optional(),
    tags: z.record(z.string()).optional(),
});

const s3ConfigSchema = z.object({
    bucketName: z.string().min(3).max(63, 'Nome do bucket deve ter entre 3 e 63 caracteres'),
    region: z.string().regex(awsRegionRegex, 'Região AWS inválida'),
    versioning: z.boolean().default(false),
    encryption: z.boolean().default(true),
    storageGb: z.number().positive().default(10),
});

const rdsConfigSchema = z.object({
    dbInstanceIdentifier: z.string().min(1, 'Identificador do DB é obrigatório'),
    dbInstanceClass: z.string().min(1, 'Classe da instância é obrigatória'),
    engine: z.enum(['mysql', 'postgres', 'mariadb', 'aurora-mysql', 'aurora-postgresql']),
    masterUsername: z.string().min(1),
    masterUserPassword: z.string().min(8),
    allocatedStorage: z.number().int().positive().default(20),
    region: z.string().regex(awsRegionRegex, 'Região AWS inválida'),
    multiAz: z.boolean().default(false),
});

const lambdaConfigSchema = z.object({
    functionName: z.string().min(1, 'Nome da função é obrigatório'),
    runtime: z.enum(['nodejs20.x', 'nodejs18.x', 'python3.12', 'python3.11', 'java21']),
    handler: z.string().min(1).default('index.handler'),
    region: z.string().regex(awsRegionRegex, 'Região AWS inválida'),
    memorySize: z.number().int().positive().default(128),
    timeout: z.number().int().positive().max(900).default(30),
    roleArn: z.string().min(1, 'Role ARN é obrigatório'),
    description: z.string().optional(),
});

export const flowNodeSchema = z.object({
    id: z.string().min(1),
    type: z.enum(['ec2', 's3', 'rds', 'lambda']),
    label: z.string().optional(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    config: z.union([ec2ConfigSchema, s3ConfigSchema, rdsConfigSchema, lambdaConfigSchema]),
});

export const flowEdgeSchema = z.object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
});

export const flowDefinitionSchema = z.object({
    nodes: z.array(flowNodeSchema).min(1, 'O fluxo precisa de ao menos um recurso'),
    edges: z.array(flowEdgeSchema).default([]),
});

export const estimateCostBodySchema = z.object({
    flow: flowDefinitionSchema,
    cloudAccountId: z.string().uuid('cloudAccountId inválido'),
});

export const runAutomationBodySchema = z.object({
    flow: flowDefinitionSchema,
    pricingModel: z.enum(['ON_DEMAND', 'RESERVED', 'SAVINGS']),
    cloudAccountId: z.string().uuid('cloudAccountId inválido'),
});

export type FlowNodeDto = z.infer<typeof flowNodeSchema>;
export type FlowDefinitionDto = z.infer<typeof flowDefinitionSchema>;
export type EstimateCostBodyDto = z.infer<typeof estimateCostBodySchema>;
export type RunAutomationBodyDto = z.infer<typeof runAutomationBodySchema>;
