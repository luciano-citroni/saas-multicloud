import { z } from 'zod';

import { CloudProvider } from '../db/entites/cloud-account.entity';

const cloudProviderSchema = z.enum([CloudProvider.AWS, CloudProvider.AZURE, CloudProvider.GCP]);

const awsRegionRegex = /^[a-z]{2}(-gov)?-[a-z]+-\d$/i;

const awsRegionSchema = z.string({ invalid_type_error: 'região inválida' }).trim().regex(awsRegionRegex, 'região AWS inválida (ex: us-east-1)');

const azureGuidSchema = z.string({ invalid_type_error: 'GUID inválido' }).trim().uuid('GUID Azure inválido');

// GCP project IDs: 6–30 chars, lowercase letters/digits/hyphens, starts with letter, no trailing hyphen
const gcpProjectIdRegex = /^[a-z][a-z0-9\-]{4,28}[a-z0-9]$/;
// GCP service account emails: <name>@<project>.iam.gserviceaccount.com
const gcpServiceAccountEmailRegex = /^.+@.+\.iam\.gserviceaccount\.com$/;

// Schema para credenciais AWS

const awsCredentialsSchema = z

    .object({
        roleArn: z.string({ required_error: 'roleArn é obrigatório', invalid_type_error: 'roleArn inválido' }),

        region: awsRegionSchema.optional(),

        regions: z.array(awsRegionSchema, { invalid_type_error: 'regions inválida' }).min(1, 'regions deve conter ao menos 1 região').optional(),

        externalId: z.string().optional(),
    })

    .superRefine((credentials, ctx) => {
        if (!credentials.region && (!credentials.regions || credentials.regions.length === 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,

                message: 'Informe credentials.region ou credentials.regions',

                path: ['region'],
            });
        }
    });

// Schema para credenciais GCP (Service Account Impersonation — sem chaves de longa duração)
export const gcpCredentialSchema = z.object({
    projectId: z
        .string({ required_error: 'projectId é obrigatório', invalid_type_error: 'projectId inválido' })
        .trim()
        .min(6, 'projectId inválido (mín. 6 caracteres)')
        .max(30, 'projectId inválido (máx. 30 caracteres)')
        .regex(gcpProjectIdRegex, 'projectId inválido (ex: meu-projeto-123, apenas letras minúsculas, números e hifens)'),

    serviceAccountEmail: z
        .string({ required_error: 'serviceAccountEmail é obrigatório', invalid_type_error: 'serviceAccountEmail inválido' })
        .trim()
        .email('serviceAccountEmail deve ser um e-mail válido')
        .regex(gcpServiceAccountEmailRegex, 'serviceAccountEmail deve ser uma Service Account GCP (ex: sa@projeto.iam.gserviceaccount.com)'),
});

export const azureCredentialSchema = z
    .object({
        tenantId: azureGuidSchema,

        clientId: azureGuidSchema,

        clientSecret: z
            .string({ required_error: 'clientSecret é obrigatório', invalid_type_error: 'clientSecret inválido' })
            .trim()
            .min(1, 'clientSecret é obrigatório'),

        subscriptionId: azureGuidSchema.optional(),

        subscriptionIds: z
            .array(azureGuidSchema, { invalid_type_error: 'subscriptionIds inválido' })
            .min(1, 'subscriptionIds deve conter ao menos 1 subscription')
            .optional(),
    })
    .superRefine((credentials, ctx) => {
        if (!credentials.subscriptionId && (!credentials.subscriptionIds || credentials.subscriptionIds.length === 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,

                message: 'Informe credentials.subscriptionId ou credentials.subscriptionIds',

                path: ['subscriptionId'],
            });
        }
    });

export const createCloudAccountSchema = z

    .object({
        provider: cloudProviderSchema,

        alias: z.string().min(1).max(100),

        credentials: z.record(z.any()),
    })

    .refine(
        (data) => {
            if (data.provider === CloudProvider.AWS) {
                return awsCredentialsSchema.safeParse(data.credentials).success;
            }

            if (data.provider === CloudProvider.AZURE) {
                return azureCredentialSchema.safeParse(data.credentials).success;
            }

            if (data.provider === CloudProvider.GCP) {
                return gcpCredentialSchema.safeParse(data.credentials).success;
            }

            return true;
        },

        (data) => {
            const result =
                data.provider === CloudProvider.AZURE
                    ? azureCredentialSchema.safeParse(data.credentials)
                    : data.provider === CloudProvider.GCP
                      ? gcpCredentialSchema.safeParse(data.credentials)
                      : awsCredentialsSchema.safeParse(data.credentials);

            const firstIssue = result.error?.errors[0];

            const issuePath = firstIssue?.path && firstIssue.path.length > 0 ? ['credentials', ...firstIssue.path.map(String)] : ['credentials'];

            return {
                message: firstIssue?.message || 'Credenciais inválidas',
                path: issuePath,
            };
        }
    );

export const updateCloudAccountSchema = z
    .object({
        alias: z.string().min(1).max(100).optional(),
        credentials: z.record(z.any()).optional(),
        isActive: z.boolean().optional(),
    })
    .refine((data) => data.alias !== undefined || data.credentials !== undefined || data.isActive !== undefined, {
        message: 'Informe ao menos um campo para atualização',
        path: ['alias'],
    });

export const cloudAccountIdParamSchema = z.object({
    id: z.string().uuid(),
});

export const listCloudAccountsQuerySchema = z.object({
    name: z.string().trim().max(100).optional(),
    isActive: z.enum(['true', 'false']).optional(),
});

export type CreateCloudAccountDto = z.infer<typeof createCloudAccountSchema>;
export type UpdateCloudAccountDto = z.infer<typeof updateCloudAccountSchema>;

export type CloudAccountIdParam = z.infer<typeof cloudAccountIdParamSchema>;

export type ListCloudAccountsQueryDto = z.infer<typeof listCloudAccountsQuerySchema>;

// exports are declared inline above
