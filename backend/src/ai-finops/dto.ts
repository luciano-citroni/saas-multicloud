import { z } from 'zod';

export const createConnectionSchema = z.object({
    organizationId: z.string().uuid(),
    providerSlug: z.string().min(1).max(64),
    name: z.string().min(1).max(255),
    providerAccountId: z.string().max(255).optional().nullable(),
    providerProjectId: z.string().max(255).optional().nullable(),
    region: z.string().max(64).optional().nullable(),
    credentials: z.record(z.string(), z.unknown()),
});
export type CreateConnectionDto = z.infer<typeof createConnectionSchema>;

export const updateConnectionSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    providerAccountId: z.string().max(255).optional().nullable(),
    providerProjectId: z.string().max(255).optional().nullable(),
    region: z.string().max(64).optional().nullable(),
    status: z.enum(['pending', 'active', 'partial', 'error', 'disabled']).optional(),
    credentials: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateConnectionDto = z.infer<typeof updateConnectionSchema>;

export const syncConnectionSchema = z.object({
    syncType: z.enum(['initial', 'incremental', 'manual']).default('manual'),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type SyncConnectionDto = z.infer<typeof syncConnectionSchema>;

export const createTeamSchema = z.object({
    organizationId: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional().nullable(),
});
export type CreateTeamDto = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional().nullable(),
    status: z.enum(['active', 'disabled']).optional(),
});
export type UpdateTeamDto = z.infer<typeof updateTeamSchema>;

export const addTeamMemberSchema = z.object({
    userId: z.string().uuid(),
    roleInTeam: z.enum(['member', 'lead']).default('member'),
});
export type AddTeamMemberDto = z.infer<typeof addTeamMemberSchema>;

export const createApplicationSchema = z.object({
    organizationId: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional().nullable(),
});
export type CreateApplicationDto = z.infer<typeof createApplicationSchema>;

export const createApiKeySchema = z.object({
    name: z.string().min(1).max(128),
    userId: z.string().uuid().optional().nullable(),
    allowedProviders: z.array(z.string()).default([]),
    allowedModels: z.array(z.string()).default([]),
    expiresAt: z.string().datetime().optional().nullable(),
});
export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;

const policyFieldsSchema = z.object({
    organizationId: z.string().uuid(),
    scopeType: z.enum(['organization', 'connection', 'team', 'user', 'application']),
    scopeId: z.string().min(1).max(255).optional().nullable(),
    name: z.string().min(1).max(255),
    maxTokens: z.number().int().nonnegative().optional().nullable(),
    maxCost: z.number().nonnegative().optional().nullable(),
    maxRequestsPerMinute: z.number().int().positive().optional().nullable(),
    allowedProviders: z.array(z.string()).default([]),
    allowedModels: z.array(z.string()).default([]),
    onLimitAction: z.enum(['notify', 'block', 'rate_limit', 'block_models', 'fallback']).default('notify'),
    fallbackConfig: z.record(z.string(), z.unknown()).default({}),
});

export const createPolicySchema = policyFieldsSchema.superRefine((data, ctx) => {
    if (data.scopeType !== 'organization' && !data.scopeId) {
        ctx.addIssue({
            code: 'custom',
            path: ['scopeId'],
            message: 'scopeId is required for non-organization policies',
        });
    }
});
export type CreatePolicyDto = z.infer<typeof createPolicySchema>;

export const updatePolicySchema = policyFieldsSchema.partial().omit({ organizationId: true });
export type UpdatePolicyDto = z.infer<typeof updatePolicySchema>;

export const createBudgetSchema = z.object({
    organizationId: z.string().uuid(),
    name: z.string().min(1).max(255),
    scopeType: z.enum([
        'organization',
        'provider',
        'connection',
        'model',
        'team',
        'user',
        'application',
        'license',
        'credit',
    ]),
    scopeId: z.string().max(255).optional().nullable(),
    budgetAmount: z.number().positive(),
    currency: z.string().length(3).default('USD'),
    period: z.enum(['daily', 'monthly']).default('monthly'),
    alertThresholds: z.array(z.number().min(1).max(100)).default([50, 75, 90, 100]),
    alertChannels: z.array(z.enum(['email', 'whatsapp'])).default(['email']),
    alertNotificationGroupIds: z.array(z.string().uuid()).default([]),
});
export type CreateBudgetDto = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = createBudgetSchema.partial().omit({ organizationId: true });
export type UpdateBudgetDto = z.infer<typeof updateBudgetSchema>;

export const createLicenseSchema = z.object({
    organizationId: z.string().uuid(),
    provider: z.string().min(1).max(64),
    licenseType: z.enum(['seat', 'credit_pack', 'commitment']),
    name: z.string().min(1).max(255),
    quantity: z.number().nonnegative(),
    unitCost: z.number().nonnegative().default(0),
    currency: z.string().length(3).default('USD'),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    source: z.string().min(1).max(64).default('manual'),
    remainingQuantity: z.number().nonnegative().optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(['active', 'expired', 'disabled']).optional(),
});
export type CreateLicenseDto = z.infer<typeof createLicenseSchema>;

export const updateLicenseSchema = createLicenseSchema.partial().omit({ organizationId: true });
export type UpdateLicenseDto = z.infer<typeof updateLicenseSchema>;

const stringListFromQuery = (itemSchema: z.ZodType<string>) =>
    z.preprocess((value) => {
        if (value == null || value === '') return undefined;
        const parts = Array.isArray(value)
            ? value.flatMap((entry) => String(entry).split(','))
            : String(value).split(',');
        const ids = parts.map((part) => part.trim()).filter(Boolean);
        return ids.length > 0 ? ids : undefined;
    }, z.array(itemSchema).max(50).optional());

const uuidListFromQuery = stringListFromQuery(z.string().uuid());
const providerUserExternalIdListFromQuery = stringListFromQuery(
    z.string().min(1).max(255),
);

export const usageQuerySchema = z.object({
    midOrganizationId: z.string().uuid().optional(),
    connectionId: z.string().uuid().optional(),
    connectionIds: uuidListFromQuery,
    provider: z.string().optional(),
    model: z.string().optional(),
    userId: z.string().uuid().optional(),
    providerUserExternalIds: providerUserExternalIdListFromQuery,
    teamId: z.string().uuid().optional(),
    applicationId: z.string().uuid().optional(),
    usageSource: z.enum(['provider_admin', 'gateway']).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type UsageQueryDto = z.infer<typeof usageQuerySchema>;

export const dashboardQuerySchema = z.object({
    midOrganizationId: z.string().uuid().optional(),
    connectionId: z.string().uuid().optional(),
    connectionIds: uuidListFromQuery,
    providerUserExternalIds: providerUserExternalIdListFromQuery,
    provider: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type DashboardQueryDto = z.infer<typeof dashboardQuerySchema>;

export const explorerQuerySchema = dashboardQuerySchema.extend({
    groupBy: z
        .enum(['provider', 'model', 'user', 'team', 'application', 'day', 'month'])
        .default('provider'),
});
export type ExplorerQueryDto = z.infer<typeof explorerQuerySchema>;
