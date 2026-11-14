import { z } from 'zod';

export type AiGovernanceSchemaMessages = {
    nameRequired: string;
    providerRequired: string;
    apiKeyRequired: string;
    roleArnRequired: string;
    regionRequired: string;
    endpointRequired: string;
    entraTenantRequired: string;
    clientIdRequired: string;
    clientSecretRequired: string;
    subscriptionIdRequired: string;
    quantityInvalid: string;
    unitCostInvalid: string;
    remainingInvalid: string;
};

export type ConnectionLimitsSchemaMessages = {
    userRequired: string;
    limitRequired: string;
    tokensInvalid: string;
    costInvalid: string;
    rpmInvalid: string;
};

export function createConnectionLimitsSchema(msgs: ConnectionLimitsSchemaMessages) {
    const optionalNonNegative = (invalid: string) =>
        z
            .string()
            .trim()
            .optional()
            .or(z.literal(''))
            .refine(
                (value) => !value || (Number.isFinite(Number(value)) && Number(value) >= 0),
                invalid,
            );

    const optionalPositiveInt = (invalid: string) =>
        z
            .string()
            .trim()
            .optional()
            .or(z.literal(''))
            .refine((value) => {
                if (!value) return true;
                const n = Number(value);
                return Number.isInteger(n) && n > 0;
            }, invalid);

    return z
        .object({
            target: z.enum(['connection', 'user']),
            userExternalId: z.string().optional().or(z.literal('')),
            maxTokens: optionalNonNegative(msgs.tokensInvalid),
            maxCost: optionalNonNegative(msgs.costInvalid),
            maxRequestsPerMinute: optionalPositiveInt(msgs.rpmInvalid),
            onLimitAction: z.enum(['notify', 'block', 'rate_limit']),
        })
        .superRefine((data, ctx) => {
            if (data.target === 'user' && !data.userExternalId?.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    message: msgs.userRequired,
                    path: ['userExternalId'],
                });
            }
            const tokens = data.maxTokens ? Number(data.maxTokens) : null;
            const cost = data.maxCost ? Number(data.maxCost) : null;
            const rpm = data.maxRequestsPerMinute ? Number(data.maxRequestsPerMinute) : null;
            const hasTokens = tokens != null && Number.isFinite(tokens);
            const hasCost = cost != null && Number.isFinite(cost);
            const hasRpm = rpm != null && Number.isFinite(rpm);
            if (!hasTokens && !hasCost && !hasRpm) {
                ctx.addIssue({
                    code: 'custom',
                    message: msgs.limitRequired,
                    path: ['maxTokens'],
                });
            }
        });
}

export type ConnectionLimitsFormValues = z.infer<ReturnType<typeof createConnectionLimitsSchema>>;

export function createTeamSchema(msgs: AiGovernanceSchemaMessages) {
    return z.object({
        name: z.string().trim().min(1, msgs.nameRequired),
    });
}

export function createApplicationSchema(msgs: AiGovernanceSchemaMessages) {
    return z.object({
        name: z.string().trim().min(1, msgs.nameRequired),
    });
}

export function createLicenseSchema(msgs: AiGovernanceSchemaMessages) {
    return z.object({
        name: z.string().trim().min(1, msgs.nameRequired),
        provider: z.string().trim().min(1, msgs.providerRequired),
        licenseType: z.enum(['seat', 'credit_pack', 'commitment']),
        quantity: z
            .string()
            .trim()
            .min(1, msgs.quantityInvalid)
            .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, msgs.quantityInvalid),
        unitCost: z
            .string()
            .trim()
            .min(1, msgs.unitCostInvalid)
            .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, msgs.unitCostInvalid),
    });
}

export function createAzureCreditsSchema(msgs: AiGovernanceSchemaMessages) {
    return z.object({
        name: z.string().trim().min(1, msgs.nameRequired),
        quantity: z
            .string()
            .trim()
            .min(1, msgs.quantityInvalid)
            .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, msgs.quantityInvalid),
        remainingQuantity: z
            .string()
            .trim()
            .optional()
            .refine(
                (v) => v == null || v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0),
                msgs.remainingInvalid,
            ),
    });
}

export function createConnectionSchema(msgs: AiGovernanceSchemaMessages) {
    return z
        .object({
            providerSlug: z.string().min(1, msgs.providerRequired),
            connectionName: z.string().trim().min(1, msgs.nameRequired),
            apiKey: z.string(),
            adminApiKey: z.string(),
            providerOrgId: z.string(),
            providerProjectId: z.string(),
            roleArn: z.string(),
            externalId: z.string(),
            awsRegion: z.string(),
            azureEndpoint: z.string(),
            azureSubscriptionId: z.string(),
            msTenantId: z.string(),
            msClientId: z.string(),
            msClientSecret: z.string(),
        })
        .superRefine((data, ctx) => {
            if (data.providerSlug === 'aws_bedrock') {
                if (!data.roleArn?.trim()) {
                    ctx.addIssue({ code: 'custom', message: msgs.roleArnRequired, path: ['roleArn'] });
                }
                if (!data.awsRegion?.trim()) {
                    ctx.addIssue({ code: 'custom', message: msgs.regionRequired, path: ['awsRegion'] });
                }
                return;
            }
            if (data.providerSlug === 'azure_ai_foundry') {
                if (!data.azureEndpoint?.trim()) {
                    ctx.addIssue({ code: 'custom', message: msgs.endpointRequired, path: ['azureEndpoint'] });
                }
                if (!data.apiKey?.trim()) {
                    ctx.addIssue({ code: 'custom', message: msgs.apiKeyRequired, path: ['apiKey'] });
                }
                // Cost Management SP fields are optional together; if any is set, require all.
                const spTouched =
                    Boolean(data.msTenantId?.trim()) ||
                    Boolean(data.msClientId?.trim()) ||
                    Boolean(data.msClientSecret?.trim()) ||
                    Boolean(data.azureSubscriptionId?.trim());
                if (spTouched) {
                    if (!data.msTenantId?.trim()) {
                        ctx.addIssue({
                            code: 'custom',
                            message: msgs.entraTenantRequired,
                            path: ['msTenantId'],
                        });
                    }
                    if (!data.msClientId?.trim()) {
                        ctx.addIssue({ code: 'custom', message: msgs.clientIdRequired, path: ['msClientId'] });
                    }
                    if (!data.msClientSecret?.trim()) {
                        ctx.addIssue({
                            code: 'custom',
                            message: msgs.clientSecretRequired,
                            path: ['msClientSecret'],
                        });
                    }
                    if (!data.azureSubscriptionId?.trim()) {
                        ctx.addIssue({
                            code: 'custom',
                            message: msgs.subscriptionIdRequired,
                            path: ['azureSubscriptionId'],
                        });
                    }
                }
                return;
            }
            if (data.providerSlug === 'microsoft_copilot') {
                if (!data.msTenantId?.trim()) {
                    ctx.addIssue({ code: 'custom', message: msgs.entraTenantRequired, path: ['msTenantId'] });
                }
                if (!data.msClientId?.trim()) {
                    ctx.addIssue({ code: 'custom', message: msgs.clientIdRequired, path: ['msClientId'] });
                }
                if (!data.msClientSecret?.trim()) {
                    ctx.addIssue({ code: 'custom', message: msgs.clientSecretRequired, path: ['msClientSecret'] });
                }
                return;
            }
            if (!data.apiKey?.trim()) {
                ctx.addIssue({ code: 'custom', message: msgs.apiKeyRequired, path: ['apiKey'] });
            }
        });
}

export type TeamFormValues = z.infer<ReturnType<typeof createTeamSchema>>;
export type ApplicationFormValues = z.infer<ReturnType<typeof createApplicationSchema>>;
export type LicenseFormValues = z.infer<ReturnType<typeof createLicenseSchema>>;
export type AzureCreditsFormValues = z.infer<ReturnType<typeof createAzureCreditsSchema>>;
export type ConnectionFormValues = z.infer<ReturnType<typeof createConnectionSchema>>;

export function buildConnectionCredentials(data: ConnectionFormValues): Record<string, unknown> {
    if (data.providerSlug === 'aws_bedrock') {
        return {
            roleArn: data.roleArn,
            externalId: data.externalId || undefined,
            region: data.awsRegion,
            accountId: data.providerOrgId || undefined,
        };
    }
    if (data.providerSlug === 'azure_ai_foundry') {
        return {
            apiKey: data.apiKey,
            endpoint: data.azureEndpoint,
            resourceName: data.providerOrgId || undefined,
            deploymentName: data.providerProjectId || undefined,
            ...(data.msTenantId?.trim() ? { tenantId: data.msTenantId.trim() } : {}),
            ...(data.msClientId?.trim() ? { clientId: data.msClientId.trim() } : {}),
            ...(data.msClientSecret?.trim() ? { clientSecret: data.msClientSecret.trim() } : {}),
            ...(data.azureSubscriptionId?.trim()
                ? { subscriptionId: data.azureSubscriptionId.trim() }
                : {}),
        };
    }
    if (data.providerSlug === 'microsoft_copilot') {
        return {
            tenantId: data.msTenantId,
            clientId: data.msClientId,
            clientSecret: data.msClientSecret,
        };
    }
    return {
        apiKey: data.apiKey,
        ...(data.adminApiKey?.trim() ? { adminApiKey: data.adminApiKey.trim() } : {}),
        organizationId: data.providerOrgId || undefined,
        projectId: data.providerProjectId || undefined,
    };
}
