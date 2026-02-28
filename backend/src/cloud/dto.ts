import { z } from 'zod';
import { CloudProvider } from '../db/entites/cloud-account.entity';

const cloudProviderSchema = z.enum([CloudProvider.AWS, CloudProvider.AZURE, CloudProvider.GCP]);

export const createCloudAccountSchema = z.object({
    provider: cloudProviderSchema,
    alias: z.string().min(1).max(100),
    credentials: z.record(z.any()), // Aceita um objeto de credenciais
});

export const cloudAccountIdParamSchema = z.object({
    id: z.string().uuid(),
});

export type CreateCloudAccountDto = z.infer<typeof createCloudAccountSchema>;
export type CloudAccountIdParam = z.infer<typeof cloudAccountIdParamSchema>;

// exports are declared inline above
