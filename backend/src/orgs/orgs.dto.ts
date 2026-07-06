import { z } from 'zod';

export const createOrgSchema = z.object({
    name: z.string().min(2).max(100),
});
export type CreateOrgDto = z.infer<typeof createOrgSchema>;

export const updateOrgSchema = z.object({
    name: z.string().min(2).max(100).optional(),
});
export type UpdateOrgDto = z.infer<typeof updateOrgSchema>;

export const orgIdParamSchema = z.object({
    id: z.string().uuid(),
});
export type OrgIdParam = z.infer<typeof orgIdParamSchema>;
