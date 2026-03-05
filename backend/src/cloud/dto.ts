import { z } from 'zod';
import { CloudProvider } from '../db/entites/cloud-account.entity';

const cloudProviderSchema = z.enum([CloudProvider.AWS, CloudProvider.AZURE, CloudProvider.GCP]);

// Schema para credenciais AWS
const awsCredentialsSchema = z.object({
    roleArn: z.string({ required_error: 'roleArn é obrigatório', invalid_type_error: 'roleArn inválido' }),
    region: z.string({ required_error: 'region é obrigatória', invalid_type_error: 'region inválida' }),
    externalId: z.string().optional(),
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
            return true;
        },
        (data) => {
            const result = awsCredentialsSchema.safeParse(data.credentials);
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

export type CreateCloudAccountDto = z.infer<typeof createCloudAccountSchema>;
export type CloudAccountIdParam = z.infer<typeof cloudAccountIdParamSchema>;

// exports are declared inline above
