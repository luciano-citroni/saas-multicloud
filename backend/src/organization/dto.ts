import { z } from 'zod';

const organizationIdSchema = z.string().uuid();

const organizationBaseSchema = z.object({
    name: z.string().min(2).max(100),
    cnpj: z.string().min(11).max(20),
});

export const createOrganizationSchema = organizationBaseSchema;
export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = organizationBaseSchema.partial();
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;

export const organizationIdParamSchema = z.object({
    id: organizationIdSchema,
});
export type OrganizationIdParam = z.infer<typeof organizationIdParamSchema>;
