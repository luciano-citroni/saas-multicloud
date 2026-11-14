export type AiProviderCapabilities = {
    validateCredentials: boolean;
    listModels: boolean;
    listProjects: boolean;
    fetchUsage: boolean;
    fetchCosts: boolean;
    fetchLimits: boolean;
    usageByUser: boolean;
    syncHistorical: boolean;
};

export type AiProviderValidateResult = {
    ok: boolean;
    accountId?: string | null;
    projectId?: string | null;
    message?: string | null;
};

export type AiProviderModelInfo = {
    modelIdentifier: string;
    displayName: string;
    modality?: string | null;
    contextWindow?: number | null;
    capabilities?: Record<string, unknown>;
};

export type AiProviderUsageEntry = {
    occurredAt: Date;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    otherTokens?: number;
    totalTokens: number;
    officialCost?: number | null;
    currency?: string;
    providerRequestId?: string | null;
    userExternalId?: string | null;
    metadata?: Record<string, unknown>;
};

export type AiProviderCostEntry = {
    date: string;
    model?: string | null;
    cost: number;
    currency: string;
    userExternalId?: string | null;
    metadata?: Record<string, unknown>;
};

export type AiProviderUserInfo = {
    externalId: string;
    email?: string | null;
    name?: string | null;
    role?: string | null;
    metadata?: Record<string, unknown>;
};

export interface AiProviderAdapter {
    readonly slug: string;
    readonly capabilities: AiProviderCapabilities;

    validateCredentials(creds: Record<string, unknown>): Promise<AiProviderValidateResult>;

    listModels(creds: Record<string, unknown>): Promise<AiProviderModelInfo[]>;

    listUsers?(creds: Record<string, unknown>): Promise<AiProviderUserInfo[]>;

    resolveUsersByIds?(
        creds: Record<string, unknown>,
        externalIds: string[],
    ): Promise<AiProviderUserInfo[]>;

    fetchUsage?(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderUsageEntry[]>;

    fetchCosts?(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderCostEntry[]>;
}
