import { Injectable, Logger } from '@nestjs/common';
import type {
    AiProviderAdapter,
    AiProviderCapabilities,
    AiProviderCostEntry,
    AiProviderModelInfo,
    AiProviderUsageEntry,
    AiProviderUserInfo,
    AiProviderValidateResult,
} from './ai-provider.adapter';

type OpenAiCostBucket = {
    start_time?: number;
    results?: Array<{
        amount?: { value?: number; currency?: string };
        line_item?: string | null;
        user_id?: string | null;
    }>;
};

type OpenAiUsageBucket = {
    start_time?: number;
    results?: Array<{
        model?: string | null;
        user_id?: string | null;
        input_tokens?: number;
        output_tokens?: number;
        input_cached_tokens?: number;
        num_model_requests?: number;
    }>;
};

type OpenAiPage<T> = {
    data?: T[];
    has_more?: boolean;
    next_page?: string | null;
};

/**
 * OpenAI BYOK adapter.
 * Models/validate work with project API keys (`apiKey`).
 * Organization Costs/Usage Admin APIs prefer `adminApiKey`; without them
 * fetch* returns [] and connection stays partial — never invents data.
 * @see https://developers.openai.com/api/docs/guides/admin-apis
 */
@Injectable()
export class OpenAiFinopsAdapter implements AiProviderAdapter {
    readonly slug = 'openai';
    readonly capabilities: AiProviderCapabilities = {
        validateCredentials: true,
        listModels: true,
        listProjects: false,
        fetchUsage: true,
        fetchCosts: true,
        fetchLimits: false,
        usageByUser: true,
        syncHistorical: true,
    };

    private readonly logger = new Logger(OpenAiFinopsAdapter.name);

    private getApiKey(creds: Record<string, unknown>): string {
        const apiKey = typeof creds.apiKey === 'string' ? creds.apiKey.trim() : '';
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY_MISSING');
        }
        return apiKey;
    }

    private getAdminKey(creds: Record<string, unknown>): string {
        const admin =
            typeof creds.adminApiKey === 'string' && creds.adminApiKey.trim()
                ? creds.adminApiKey.trim()
                : null;
        return admin ?? this.getApiKey(creds);
    }

    private buildHeaders(
        creds: Record<string, unknown>,
        options?: { admin?: boolean },
    ): Record<string, string> {
        const key = options?.admin ? this.getAdminKey(creds) : this.getApiKey(creds);
        const headers: Record<string, string> = {
            Authorization: `Bearer ${key}`,
        };
        if (typeof creds.organizationId === 'string' && creds.organizationId.trim()) {
            headers['OpenAI-Organization'] = creds.organizationId.trim();
        }
        if (typeof creds.projectId === 'string' && creds.projectId.trim()) {
            headers['OpenAI-Project'] = creds.projectId.trim();
        }
        return headers;
    }

    private toUnix(date: string, endOfDay = false): number {
        const iso = endOfDay ? `${date}T23:59:59.999Z` : `${date}T00:00:00.000Z`;
        return Math.floor(new Date(iso).getTime() / 1000);
    }

    private async fetchPaginated<T>(
        baseUrl: string,
        headers: Record<string, string>,
        label: string,
    ): Promise<T[]> {
        const buckets: T[] = [];
        let page: string | null = null;
        let guard = 0;

        while (guard < 40) {
            guard += 1;
            const url = page ? `${baseUrl}&page=${encodeURIComponent(page)}` : baseUrl;
            const response = await fetch(url, { method: 'GET', headers });
            if (response.status === 401 || response.status === 403) {
                this.logger.warn(`openai.${label}.admin_unavailable`);
                return [];
            }
            if (!response.ok) {
                this.logger.warn(`openai.${label}.failed status=${response.status}`);
                return buckets;
            }
            const payload = (await response.json()) as OpenAiPage<T>;
            buckets.push(...(payload.data ?? []));
            if (!payload.has_more || !payload.next_page) break;
            page = payload.next_page;
        }

        return buckets;
    }

    async validateCredentials(creds: Record<string, unknown>): Promise<AiProviderValidateResult> {
        try {
            const response = await fetch('https://api.openai.com/v1/models?limit=1', {
                method: 'GET',
                headers: this.buildHeaders(creds),
            });
            if (!response.ok) {
                this.logger.warn(`openai.validate.failed status=${response.status}`);
                return {
                    ok: false,
                    message: `OpenAI rejected the credentials (HTTP ${response.status}).`,
                    accountId: typeof creds.organizationId === 'string' ? creds.organizationId : null,
                    projectId: typeof creds.projectId === 'string' ? creds.projectId : null,
                };
            }

            const adminProbe = await fetch(
                `https://api.openai.com/v1/organization/costs?start_time=${this.toUnix(
                    new Date(Date.now() - 86400000).toISOString().slice(0, 10),
                )}&end_time=${this.toUnix(new Date().toISOString().slice(0, 10), true)}&bucket_width=1d&limit=1`,
                { method: 'GET', headers: this.buildHeaders(creds, { admin: true }) },
            );

            const adminOk = adminProbe.ok;
            return {
                ok: true,
                message: adminOk
                    ? 'Credentials validated. Organization admin costs API is available.'
                    : 'Credentials validated for Models API. Organization admin usage/costs are not available for this key (partial sync). Provide an Admin API key for official spend.',
                accountId: typeof creds.organizationId === 'string' ? creds.organizationId : null,
                projectId: typeof creds.projectId === 'string' ? creds.projectId : null,
            };
        } catch (error) {
            this.logger.warn(`openai.validate.error: ${error instanceof Error ? error.message : 'unknown'}`);
            return { ok: false, message: 'Could not reach OpenAI to validate credentials.' };
        }
    }

    async listModels(creds: Record<string, unknown>): Promise<AiProviderModelInfo[]> {
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: this.buildHeaders(creds),
        });
        if (!response.ok) {
            throw new Error(`OPENAI_LIST_MODELS_FAILED_${response.status}`);
        }
        const payload = (await response.json()) as { data?: Array<{ id?: string; owned_by?: string }> };
        const models = Array.isArray(payload.data) ? payload.data : [];
        return models
            .filter((item) => typeof item.id === 'string' && item.id.length > 0)
            .map((item) => ({
                modelIdentifier: item.id as string,
                displayName: item.id as string,
                modality: item.id?.includes('embedding') ? 'embedding' : 'chat',
                contextWindow: null,
                capabilities: { ownedBy: item.owned_by ?? null },
            }));
    }

    private mapCostBuckets(
        buckets: OpenAiCostBucket[],
        startDate: string,
        source: string,
    ): AiProviderCostEntry[] {
        const entries: AiProviderCostEntry[] = [];
        for (const bucket of buckets) {
            const date = bucket.start_time
                ? new Date(bucket.start_time * 1000).toISOString().slice(0, 10)
                : startDate;
            for (const result of bucket.results ?? []) {
                const amount = Number(result.amount?.value ?? 0);
                if (!Number.isFinite(amount)) continue;
                entries.push({
                    date,
                    model: result.line_item ?? null,
                    cost: amount,
                    currency: result.amount?.currency ?? 'USD',
                    userExternalId: result.user_id ?? null,
                    metadata: { source },
                });
            }
        }
        return entries;
    }

    async fetchCosts(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderCostEntry[]> {
        const headers = this.buildHeaders(creds, { admin: true });
        const byUserUrl =
            `https://api.openai.com/v1/organization/costs` +
            `?start_time=${this.toUnix(startDate)}` +
            `&end_time=${this.toUnix(endDate, true)}` +
            `&bucket_width=1d&limit=31&group_by[]=user_id&group_by[]=line_item`;

        let buckets = await this.fetchPaginated<OpenAiCostBucket>(byUserUrl, headers, 'fetchCosts.byUser');
        if (buckets.length > 0) {
            return this.mapCostBuckets(buckets, startDate, 'openai_organization_costs_by_user');
        }

        const fallbackUrl =
            `https://api.openai.com/v1/organization/costs` +
            `?start_time=${this.toUnix(startDate)}` +
            `&end_time=${this.toUnix(endDate, true)}` +
            `&bucket_width=1d&limit=31&group_by[]=line_item`;
        buckets = await this.fetchPaginated<OpenAiCostBucket>(fallbackUrl, headers, 'fetchCosts');
        return this.mapCostBuckets(buckets, startDate, 'openai_organization_costs');
    }

    async fetchUsage(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderUsageEntry[]> {
        const headers = this.buildHeaders(creds, { admin: true });
        const byUserUrl =
            `https://api.openai.com/v1/organization/usage/completions` +
            `?start_time=${this.toUnix(startDate)}` +
            `&end_time=${this.toUnix(endDate, true)}` +
            `&bucket_width=1d&limit=31&group_by[]=model&group_by[]=user_id`;

        let usageBuckets = await this.fetchPaginated<OpenAiUsageBucket>(
            byUserUrl,
            headers,
            'fetchUsage.byUser',
        );
        let groupedByUser = usageBuckets.some((b) =>
            (b.results ?? []).some((r) => typeof r.user_id === 'string' && r.user_id.length > 0),
        );

        if (usageBuckets.length === 0) {
            const fallbackUrl =
                `https://api.openai.com/v1/organization/usage/completions` +
                `?start_time=${this.toUnix(startDate)}` +
                `&end_time=${this.toUnix(endDate, true)}` +
                `&bucket_width=1d&limit=31&group_by[]=model`;
            usageBuckets = await this.fetchPaginated<OpenAiUsageBucket>(
                fallbackUrl,
                headers,
                'fetchUsage',
            );
            groupedByUser = false;
        }

        const costs = await this.fetchCosts(creds, startDate, endDate);

        const costByDateUser = new Map<string, { total: number; currency: string }>();
        for (const cost of costs) {
            const key = `${cost.date}::${cost.userExternalId ?? 'unknown'}`;
            const prev = costByDateUser.get(key) ?? { total: 0, currency: cost.currency };
            prev.total += cost.cost;
            costByDateUser.set(key, prev);
        }

        const entries: AiProviderUsageEntry[] = [];
        const seenCostKeys = new Set<string>();

        for (const bucket of usageBuckets) {
            const date = bucket.start_time
                ? new Date(bucket.start_time * 1000).toISOString().slice(0, 10)
                : startDate;
            const results = bucket.results ?? [];

            const tokensByUser = new Map<string, number>();
            for (const result of results) {
                const userKey = result.user_id ?? 'unknown';
                const tokens = Number(result.input_tokens ?? 0) + Number(result.output_tokens ?? 0);
                tokensByUser.set(userKey, (tokensByUser.get(userKey) ?? 0) + tokens);
            }

            for (const [index, result] of results.entries()) {
                const model = result.model ?? 'unknown';
                const userExternalId = result.user_id ?? null;
                const userKey = userExternalId ?? 'unknown';
                const inputTokens = Number(result.input_tokens ?? 0);
                const outputTokens = Number(result.output_tokens ?? 0);
                const cachedInputTokens = Number(result.input_cached_tokens ?? 0);
                const totalTokens = inputTokens + outputTokens;
                const costBucket = costByDateUser.get(`${date}::${userKey}`);
                const userTokens = tokensByUser.get(userKey) ?? 0;
                const share =
                    costBucket && userTokens > 0
                        ? (totalTokens / userTokens) * costBucket.total
                        : null;
                if (share != null) seenCostKeys.add(`${date}::${userKey}`);

                entries.push({
                    occurredAt: new Date(`${date}T12:00:00.000Z`),
                    model,
                    inputTokens,
                    outputTokens,
                    cachedInputTokens,
                    totalTokens,
                    officialCost: share,
                    currency: costBucket?.currency ?? 'USD',
                    userExternalId,
                    providerRequestId: `openai-usage-${date}-${index}-${model}-${userKey}`,
                    metadata: {
                        source: groupedByUser
                            ? 'openai_organization_usage_completions_by_user'
                            : 'openai_organization_usage_completions',
                        numModelRequests: result.num_model_requests ?? null,
                        costAllocated: share != null,
                    },
                });
            }
        }

        if (entries.length === 0) {
            return costs.map((cost, index) => ({
                occurredAt: new Date(`${cost.date}T12:00:00.000Z`),
                model: cost.model ?? 'unknown',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                officialCost: cost.cost,
                currency: cost.currency,
                userExternalId: cost.userExternalId ?? null,
                providerRequestId: `openai-cost-${cost.date}-${index}-${cost.userExternalId ?? 'na'}-${cost.model ?? 'na'}`,
                metadata: {
                    source: 'openai_organization_costs',
                    note: 'Token breakdown unavailable from usage endpoint; official_cost only.',
                },
            }));
        }

        for (const [index, cost] of costs.entries()) {
            const key = `${cost.date}::${cost.userExternalId ?? 'unknown'}`;
            if (seenCostKeys.has(key)) continue;
            seenCostKeys.add(key);
            entries.push({
                occurredAt: new Date(`${cost.date}T12:00:00.000Z`),
                model: cost.model ?? 'unknown',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                officialCost: cost.cost,
                currency: cost.currency,
                userExternalId: cost.userExternalId ?? null,
                providerRequestId: `openai-cost-only-${cost.date}-${index}-${cost.userExternalId ?? 'na'}`,
                metadata: {
                    source: 'openai_organization_costs',
                    note: 'Cost-only row; no matching completions usage bucket.',
                },
            });
        }

        return entries;
    }

    async listUsers(creds: Record<string, unknown>): Promise<AiProviderUserInfo[]> {
        const headers = this.buildHeaders(creds, { admin: true });
        const users: AiProviderUserInfo[] = [];
        const seen = new Set<string>();
        let after: string | null = null;
        let guard = 0;

        const pushUser = (input: {
            externalId?: string | null;
            email?: string | null;
            name?: string | null;
            role?: string | null;
            source: string;
            aliasOf?: string | null;
        }) => {
            const externalId = input.externalId?.trim();
            if (!externalId || seen.has(externalId)) return;
            seen.add(externalId);
            users.push({
                externalId,
                email: input.email ?? null,
                name: input.name ?? null,
                role: input.role ?? null,
                metadata: {
                    source: input.source,
                    ...(input.aliasOf ? { aliasOf: input.aliasOf } : {}),
                },
            });
        };

        while (guard < 40) {
            guard += 1;
            const params = new URLSearchParams({ limit: '100' });
            if (after) params.set('after', after);
            const response = await fetch(`https://api.openai.com/v1/organization/users?${params}`, {
                method: 'GET',
                headers,
            });
            if (response.status === 401 || response.status === 403) {
                this.logger.warn('openai.listUsers.admin_unavailable');
                return users;
            }
            if (!response.ok) {
                this.logger.warn(`openai.listUsers.failed status=${response.status}`);
                return users;
            }

            const payload = (await response.json()) as {
                data?: Array<{
                    id?: string;
                    email?: string | null;
                    name?: string | null;
                    role?: string | null;
                    user?: {
                        id?: string;
                        email?: string | null;
                        name?: string | null;
                    } | null;
                }>;
                has_more?: boolean;
                last_id?: string | null;
            };

            for (const item of payload.data ?? []) {
                // Costs/usage `user_id` often matches the nested account user id, not organization.user.id.
                pushUser({
                    externalId: item.id,
                    email: item.email ?? item.user?.email ?? null,
                    name: item.name ?? item.user?.name ?? null,
                    role: item.role ?? null,
                    source: 'openai_organization_users',
                });
                if (item.user?.id && item.user.id !== item.id) {
                    pushUser({
                        externalId: item.user.id,
                        email: item.user.email ?? item.email ?? null,
                        name: item.user.name ?? item.name ?? null,
                        role: item.role ?? null,
                        source: 'openai_organization_users_nested',
                        aliasOf: item.id,
                    });
                }
            }

            if (!payload.has_more || !payload.last_id) break;
            after = payload.last_id;
        }

        return users;
    }

    async resolveUsersByIds(
        creds: Record<string, unknown>,
        externalIds: string[],
    ): Promise<AiProviderUserInfo[]> {
        const headers = this.buildHeaders(creds, { admin: true });
        const resolved: AiProviderUserInfo[] = [];
        const unique = Array.from(new Set(externalIds.map((id) => id.trim()).filter(Boolean)));

        for (const externalId of unique) {
            const response = await fetch(
                `https://api.openai.com/v1/organization/users/${encodeURIComponent(externalId)}`,
                { method: 'GET', headers },
            );
            if (response.status === 401 || response.status === 403) {
                this.logger.warn('openai.resolveUsers.admin_unavailable');
                return resolved;
            }
            if (response.status === 404) continue;
            if (!response.ok) {
                this.logger.warn(`openai.resolveUsers.failed id=${externalId} status=${response.status}`);
                continue;
            }

            const item = (await response.json()) as {
                id?: string;
                email?: string | null;
                name?: string | null;
                role?: string | null;
                user?: { id?: string; email?: string | null; name?: string | null } | null;
            };

            const name = item.name ?? item.user?.name ?? null;
            const email = item.email ?? item.user?.email ?? null;
            if (item.id) {
                resolved.push({
                    externalId: item.id,
                    email,
                    name,
                    role: item.role ?? null,
                    metadata: { source: 'openai_organization_users_retrieve' },
                });
            }
            // Always keep the requested id as a resolvable key (costs may use nested id).
            resolved.push({
                externalId,
                email,
                name,
                role: item.role ?? null,
                metadata: {
                    source: 'openai_organization_users_retrieve_requested',
                    organizationUserId: item.id ?? null,
                },
            });
            if (item.user?.id && item.user.id !== externalId) {
                resolved.push({
                    externalId: item.user.id,
                    email: item.user.email ?? email,
                    name: item.user.name ?? name,
                    role: item.role ?? null,
                    metadata: {
                        source: 'openai_organization_users_retrieve_nested',
                        organizationUserId: item.id ?? null,
                    },
                });
            }
        }

        return resolved;
    }
}
