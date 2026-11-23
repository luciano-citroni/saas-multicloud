import { z } from 'zod';

export const inventoryPeriodSchema = z
    .enum(['thismonth', 'last6months', 'last12months', 'ytd', 'all'])
    .default('all');

export const inventoryResourcesQuerySchema = z.object({
    q: z.string().trim().max(200).optional(),
    resourceType: z.string().trim().max(100).optional(),
    region: z.string().trim().max(100).optional(),
    /** Tag filter: `key` or `key:value` (always split on the first `:`). */
    tag: z.string().trim().max(200).optional(),
    period: inventoryPeriodSchema,
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type InventoryResourcesQueryDto = z.infer<typeof inventoryResourcesQuerySchema>;

export const inventoryOverviewQuerySchema = z.object({
    period: inventoryPeriodSchema,
});

export type InventoryOverviewQueryDto = z.infer<typeof inventoryOverviewQuerySchema>;
