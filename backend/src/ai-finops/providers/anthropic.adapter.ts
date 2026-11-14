import { Injectable, Logger } from '@nestjs/common';
import type {
    AiProviderAdapter,
    AiProviderCapabilities,
    AiProviderCostEntry,
    AiProviderModelInfo,
    AiProviderUsageEntry,
    AiProviderValidateResult,
} from './ai-provider.adapter';

type AnthropicActor = {
    type?: string | null;
    user_id?: string | null;
    name?: string | null;
    email?: string | null;
    service_account_id?: string | null;
    api_key_id?: string | null;
};

type AnthropicAnalyticsRow = {
    starting_at?: string;
    group?: {
        model?: string | null;
        actor?: AnthropicActor | null;
        actor_type?: string | null;
    };
    usage?: {
        uncached_input_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation?: {
            ephemeral_1h_input_tokens?: number;
            ephemeral_5m_input_tokens?: number;
        };
        output_tokens?: number;
        total_tokens?: number;
    };
    cost?: {
        amount?: string;
        currency?: string;
    };
};

type AnthropicUsageBucket = {
    starting_at?: string;
    results?: Array<{
        model?: string | null;
        account_id?: string | null;
        uncached_input_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation?: {
            ephemeral_1h_input_tokens?: number;
            ephemeral_5m_input_tokens?: number;
        };
        output_tokens?: number;
    }>;
};

type AnthropicCostBucket = {
    starting_at?: string;
    results?: Array<{
        amount?: string;
        currency?: string;
        model?: string | null;
        description?: string | null;
        cost_type?: string | null;
        workspace_id?: string | null;
    }>;
};

type PaginatedReport<T> = {
    data?: T[];
    has_more?: boolean;
    next_page?: string | null;
};

/**
 * Anthropic BYOK adapter.
 * Models/validate use a standard API key (`apiKey`).
 * Usage/Cost prefer Usage & Cost Analytics API (`group_by=actor`) with Admin key.
 * Falls back to legacy usage_report/cost_report when analytics is unavailable.
 * @see https://platform.claude.com/docs/en/manage-claude/usage-cost-analytics-api
 */
@Injectable()
export class AnthropicFinopsAdapter implements AiProviderAdapter {
    readonly slug = 'anthropic';
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

    private readonly logger = new Logger(AnthropicFinopsAdapter.name);
    private readonly adminVersion = '2026-10-21';
    private readonly analyticsBeta = 'analytics-usage-cost-2026-08-24';
    private readonly modelsVersion = '2023-06-01';

    private apiKey(creds: Record<string, unknown>): string {
        const key = typeof creds.apiKey === 'string' ? creds.apiKey.trim() : '';
        if (!key) throw new Error('ANTHROPIC_API_KEY_MISSING');
        return key;
    }

    private adminKey(creds: Record<string, unknown>): string | null {
        const admin =
            typeof creds.adminApiKey === 'string' && creds.adminApiKey.trim()
                ? creds.adminApiKey.trim()
                : null;
        if (admin) return admin;
        const key = typeof creds.apiKey === 'string' ? creds.apiKey.trim() : '';
        return key || null;
    }

    private modelsHeaders(creds: Record<string, unknown>): Record<string, string> {
        return {
            'x-api-key': this.apiKey(creds),
            'anthropic-version': this.modelsVersion,
        };
    }

    private adminHeaders(creds: Record<string, unknown>, analytics = false): Record<string, string> | null {
        const key = this.adminKey(creds);
        if (!key) return null;
        const headers: Record<string, string> = {
            'x-api-key': key,
            'anthropic-version': this.adminVersion,
        };
        if (analytics) {
            headers['anthropic-beta'] = this.analyticsBeta;
        }
        return headers;
    }

    private toRfc3339(date: string, endExclusive = false): string {
        if (endExclusive) {
            const next = new Date(`${date}T00:00:00.000Z`);
            next.setUTCDate(next.getUTCDate() + 1);
            return next.toISOString().replace(/\.\d{3}Z$/, 'Z');
        }
        return `${date}T00:00:00Z`;
    }

    /** Anthropic reports amounts in lowest currency units (cents) as decimal strings. */
    private centsToUsd(amount: string | undefined): number {
        const raw = Number(amount ?? 0);
        if (!Number.isFinite(raw)) return 0;
        return raw / 100;
    }

    private actorExternalId(actor: AnthropicActor | null | undefined): string | null {
        if (!actor) return null;
        if (typeof actor.user_id === 'string' && actor.user_id) return actor.user_id;
        if (typeof actor.service_account_id === 'string' && actor.service_account_id) {
            return actor.service_account_id;
        }
        if (typeof actor.api_key_id === 'string' && actor.api_key_id) return actor.api_key_id;
        return actor.type ?? null;
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
                this.logger.warn(`anthropic.${label}.admin_unavailable status=${response.status}`);
                return [];
            }
            if (!response.ok) {
                this.logger.warn(`anthropic.${label}.failed status=${response.status}`);
                return buckets;
            }
            const payload = (await response.json()) as PaginatedReport<T>;
            buckets.push(...(payload.data ?? []));
            if (!payload.has_more || !payload.next_page) break;
            page = payload.next_page;
        }

        return buckets;
    }

    async validateCredentials(creds: Record<string, unknown>): Promise<AiProviderValidateResult> {
        try {
            const response = await fetch('https://api.anthropic.com/v1/models?limit=1', {
                method: 'GET',
                headers: this.modelsHeaders(creds),
            });
            if (!response.ok) {
                this.logger.warn(`anthropic.validate.failed status=${response.status}`);
                return {
                    ok: false,
                    message: `Anthropic rejected the credentials (HTTP ${response.status}).`,
                };
            }

            const adminHeaders = this.adminHeaders(creds, true);
            if (!adminHeaders) {
                return {
                    ok: true,
                    message:
                        'Credentials validated against Anthropic Models API. Provide an Admin API key to sync usage/costs.',
                };
            }

            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            const today = new Date().toISOString().slice(0, 10);
            const probeUrl =
                `https://api.anthropic.com/v1/organizations/analytics/cost` +
                `?starting_at=${encodeURIComponent(this.toRfc3339(yesterday))}` +
                `&ending_at=${encodeURIComponent(this.toRfc3339(today, true))}` +
                `&time_bucket_width=1d&limit=1&group_by[]=actor`;
            const adminProbe = await fetch(probeUrl, { method: 'GET', headers: adminHeaders });

            return {
                ok: true,
                message: adminProbe.ok
                    ? 'Credentials validated. Anthropic Analytics usage/cost APIs (incl. per-actor) are available.'
                    : 'Credentials validated for Models API. Admin usage/costs are not available for this key (partial sync).',
            };
        } catch (error) {
            this.logger.warn(`anthropic.validate.error: ${error instanceof Error ? error.message : 'unknown'}`);
            return { ok: false, message: 'Could not reach Anthropic to validate credentials.' };
        }
    }

    async listModels(creds: Record<string, unknown>): Promise<AiProviderModelInfo[]> {
        const response = await fetch('https://api.anthropic.com/v1/models', {
            method: 'GET',
            headers: this.modelsHeaders(creds),
        });
        if (!response.ok) {
            throw new Error(`ANTHROPIC_LIST_MODELS_FAILED_${response.status}`);
        }
        const payload = (await response.json()) as {
            data?: Array<{ id?: string; display_name?: string }>;
        };
        return (payload.data ?? [])
            .filter((item) => typeof item.id === 'string')
            .map((item) => ({
                modelIdentifier: item.id as string,
                displayName: item.display_name ?? (item.id as string),
                modality: 'chat',
                contextWindow: null,
            }));
    }

    private async fetchAnalyticsCosts(
        headers: Record<string, string>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderCostEntry[]> {
        const baseUrl =
            `https://api.anthropic.com/v1/organizations/analytics/cost` +
            `?starting_at=${encodeURIComponent(this.toRfc3339(startDate))}` +
            `&ending_at=${encodeURIComponent(this.toRfc3339(endDate, true))}` +
            `&time_bucket_width=1d&limit=100&group_by[]=actor&group_by[]=model&order_by=time&order=asc`;

        const rows = await this.fetchPaginated<AnthropicAnalyticsRow>(
            baseUrl,
            headers,
            'fetchCosts.analytics',
        );
        const entries: AiProviderCostEntry[] = [];
        for (const [index, row] of rows.entries()) {
            const cost = this.centsToUsd(row.cost?.amount);
            if (!Number.isFinite(cost) || cost === 0) continue;
            const date = row.starting_at ? row.starting_at.slice(0, 10) : startDate;
            const actor = row.group?.actor;
            entries.push({
                date,
                model: row.group?.model ?? null,
                cost,
                currency: row.cost?.currency ?? 'USD',
                userExternalId: this.actorExternalId(actor),
                metadata: {
                    source: 'anthropic_analytics_cost',
                    actorType: actor?.type ?? row.group?.actor_type ?? null,
                    actorName: actor?.name ?? null,
                    actorEmail: actor?.email ?? null,
                    index,
                },
            });
        }
        return entries;
    }

    private async fetchLegacyCosts(
        headers: Record<string, string>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderCostEntry[]> {
        const baseUrl =
            `https://api.anthropic.com/v1/organizations/cost_report` +
            `?starting_at=${encodeURIComponent(this.toRfc3339(startDate))}` +
            `&ending_at=${encodeURIComponent(this.toRfc3339(endDate, true))}` +
            `&bucket_width=1d&limit=31&group_by[]=description`;

        const buckets = await this.fetchPaginated<AnthropicCostBucket>(baseUrl, headers, 'fetchCosts.legacy');
        const entries: AiProviderCostEntry[] = [];
        for (const bucket of buckets) {
            const date = bucket.starting_at ? bucket.starting_at.slice(0, 10) : startDate;
            for (const result of bucket.results ?? []) {
                const cost = this.centsToUsd(result.amount);
                if (!Number.isFinite(cost) || cost === 0) continue;
                entries.push({
                    date,
                    model: result.model ?? result.description ?? null,
                    cost,
                    currency: result.currency ?? 'USD',
                    userExternalId: null,
                    metadata: {
                        source: 'anthropic_cost_report',
                        costType: result.cost_type ?? null,
                        description: result.description ?? null,
                    },
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
        const analyticsHeaders = this.adminHeaders(creds, true);
        if (!analyticsHeaders) return [];

        const analytics = await this.fetchAnalyticsCosts(analyticsHeaders, startDate, endDate);
        if (analytics.length > 0) return analytics;

        const legacyHeaders = this.adminHeaders(creds, false);
        if (!legacyHeaders) return [];
        return this.fetchLegacyCosts(legacyHeaders, startDate, endDate);
    }

    private async fetchAnalyticsUsage(
        headers: Record<string, string>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderUsageEntry[]> {
        const baseUrl =
            `https://api.anthropic.com/v1/organizations/analytics/usage` +
            `?starting_at=${encodeURIComponent(this.toRfc3339(startDate))}` +
            `&ending_at=${encodeURIComponent(this.toRfc3339(endDate, true))}` +
            `&time_bucket_width=1d&limit=100&group_by[]=actor&group_by[]=model&order_by=time&order=asc`;

        const rows = await this.fetchPaginated<AnthropicAnalyticsRow>(
            baseUrl,
            headers,
            'fetchUsage.analytics',
        );
        const costs = await this.fetchAnalyticsCosts(headers, startDate, endDate);

        const costByKey = new Map<string, number>();
        for (const cost of costs) {
            const key = `${cost.date}::${cost.userExternalId ?? 'unknown'}::${cost.model ?? 'unknown'}`;
            costByKey.set(key, (costByKey.get(key) ?? 0) + cost.cost);
        }

        const entries: AiProviderUsageEntry[] = [];
        const seenCostKeys = new Set<string>();

        for (const [index, row] of rows.entries()) {
            const date = row.starting_at ? row.starting_at.slice(0, 10) : startDate;
            const model = row.group?.model ?? 'unknown';
            const actor = row.group?.actor;
            const userExternalId = this.actorExternalId(actor);
            const cacheCreate =
                Number(row.usage?.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
                Number(row.usage?.cache_creation?.ephemeral_5m_input_tokens ?? 0);
            const uncached = Number(row.usage?.uncached_input_tokens ?? 0);
            const cachedRead = Number(row.usage?.cache_read_input_tokens ?? 0);
            const outputTokens = Number(row.usage?.output_tokens ?? 0);
            const inputTokens = uncached + cacheCreate;
            const totalTokens =
                Number(row.usage?.total_tokens ?? 0) || inputTokens + cachedRead + outputTokens;
            const costKey = `${date}::${userExternalId ?? 'unknown'}::${model}`;
            const officialCost = costByKey.get(costKey) ?? null;
            if (officialCost != null) seenCostKeys.add(costKey);

            entries.push({
                occurredAt: new Date(`${date}T12:00:00.000Z`),
                model,
                inputTokens,
                outputTokens,
                cachedInputTokens: cachedRead,
                otherTokens: cacheCreate,
                totalTokens,
                officialCost,
                currency: 'USD',
                userExternalId,
                providerRequestId: `anthropic-analytics-usage-${date}-${index}-${model}-${userExternalId ?? 'na'}`,
                metadata: {
                    source: 'anthropic_analytics_usage',
                    actorType: actor?.type ?? row.group?.actor_type ?? null,
                    actorName: actor?.name ?? null,
                    actorEmail: actor?.email ?? null,
                    uncachedInputTokens: uncached,
                    cacheCreationTokens: cacheCreate,
                },
            });
        }

        for (const [index, cost] of costs.entries()) {
            const key = `${cost.date}::${cost.userExternalId ?? 'unknown'}::${cost.model ?? 'unknown'}`;
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
                providerRequestId: `anthropic-analytics-cost-${cost.date}-${index}-${cost.userExternalId ?? 'na'}`,
                metadata: {
                    ...(cost.metadata ?? {}),
                    note: 'Cost-only row; no matching analytics usage bucket.',
                },
            });
        }

        return entries;
    }

    private async fetchLegacyUsage(
        headers: Record<string, string>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderUsageEntry[]> {
        const usageUrl =
            `https://api.anthropic.com/v1/organizations/usage_report/messages` +
            `?starting_at=${encodeURIComponent(this.toRfc3339(startDate))}` +
            `&ending_at=${encodeURIComponent(this.toRfc3339(endDate, true))}` +
            `&bucket_width=1d&limit=31&group_by[]=model&group_by[]=account_id`;

        const buckets = await this.fetchPaginated<AnthropicUsageBucket>(
            usageUrl,
            headers,
            'fetchUsage.legacy',
        );
        const costs = await this.fetchLegacyCosts(headers, startDate, endDate);

        const costByDateModel = new Map<string, number>();
        for (const cost of costs) {
            const key = `${cost.date}::${cost.model ?? 'unknown'}`;
            costByDateModel.set(key, (costByDateModel.get(key) ?? 0) + cost.cost);
        }

        const entries: AiProviderUsageEntry[] = [];
        for (const bucket of buckets) {
            const date = bucket.starting_at ? bucket.starting_at.slice(0, 10) : startDate;
            for (const [index, result] of (bucket.results ?? []).entries()) {
                const model = result.model ?? 'unknown';
                const cacheCreate =
                    Number(result.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
                    Number(result.cache_creation?.ephemeral_5m_input_tokens ?? 0);
                const uncached = Number(result.uncached_input_tokens ?? 0);
                const cachedRead = Number(result.cache_read_input_tokens ?? 0);
                const outputTokens = Number(result.output_tokens ?? 0);
                const inputTokens = uncached + cacheCreate;
                const totalTokens = inputTokens + cachedRead + outputTokens;
                const userExternalId = result.account_id ?? null;

                entries.push({
                    occurredAt: new Date(`${date}T12:00:00.000Z`),
                    model,
                    inputTokens,
                    outputTokens,
                    cachedInputTokens: cachedRead,
                    otherTokens: cacheCreate,
                    totalTokens,
                    officialCost: costByDateModel.get(`${date}::${model}`) ?? null,
                    currency: 'USD',
                    userExternalId,
                    providerRequestId: `anthropic-usage-${date}-${index}-${model}-${userExternalId ?? 'na'}`,
                    metadata: {
                        source: 'anthropic_usage_report_messages',
                        uncachedInputTokens: uncached,
                        cacheCreationTokens: cacheCreate,
                    },
                });
            }
        }
        return entries;
    }

    async fetchUsage(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderUsageEntry[]> {
        const analyticsHeaders = this.adminHeaders(creds, true);
        if (!analyticsHeaders) return [];

        const analytics = await this.fetchAnalyticsUsage(analyticsHeaders, startDate, endDate);
        if (analytics.length > 0) return analytics;

        const legacyHeaders = this.adminHeaders(creds, false);
        if (!legacyHeaders) return [];
        return this.fetchLegacyUsage(legacyHeaders, startDate, endDate);
    }
}
