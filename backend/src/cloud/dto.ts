import { z } from 'zod';

import { CloudProvider } from '../db/entites/cloud-account.entity';

const cloudProviderSchema = z.enum([CloudProvider.AWS, CloudProvider.AZURE, CloudProvider.GCP]);

const awsRegionRegex = /^[a-z]{2}(-gov)?-[a-z]+-\d$/i;

const awsRegionSchema = z.string({ invalid_type_error: 'região inválida' }).trim().regex(awsRegionRegex, 'região AWS inválida (ex: us-east-1)');

const azureGuidSchema = z.string({ invalid_type_error: 'GUID inválido' }).trim().uuid('GUID Azure inválido');

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
            // Se o provider for AWS, validar as credenciais

            if (data.provider === CloudProvider.AWS) {
                const result = awsCredentialsSchema.safeParse(data.credentials);

                return result.success;
            }

            if (data.provider === CloudProvider.AZURE) {
                const result = azureCredentialSchema.safeParse(data.credentials);

                return result.success;
            }

            return true;
        },

        (data) => {
            const result =
                data.provider === CloudProvider.AZURE
                    ? azureCredentialSchema.safeParse(data.credentials)
                    : awsCredentialsSchema.safeParse(data.credentials);

            const firstIssue = result.error?.errors[0];

            const issuePath = firstIssue?.path && firstIssue.path.length > 0 ? ['credentials', ...firstIssue.path.map(String)] : ['credentials'];

            return {
                message: firstIssue?.message || 'Credenciais AWS inválidas',

                path: issuePath,
            };
        }
    );

export const cloudAccountIdParamSchema = z.object({
    id: z.string().uuid(),
});

export const listCloudAccountsQuerySchema = z.object({
    name: z.string().trim().max(100).optional(),
    isActive: z.enum(['true', 'false']).optional(),
});

export type CreateCloudAccountDto = z.infer<typeof createCloudAccountSchema>;

export type CloudAccountIdParam = z.infer<typeof cloudAccountIdParamSchema>;

export type ListCloudAccountsQueryDto = z.infer<typeof listCloudAccountsQuerySchema>;

// exports are declared inline above
