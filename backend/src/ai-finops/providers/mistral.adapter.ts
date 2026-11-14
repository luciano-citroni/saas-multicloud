import { Injectable, Logger } from '@nestjs/common';
import type {
    AiProviderAdapter,
    AiProviderCapabilities,
    AiProviderCostEntry,
    AiProviderModelInfo,
    AiProviderUsageEntry,
    AiProviderValidateResult,
} from './ai-provider.adapter';

type MistralUsageQueryGroup = {
    start?: string;
    end?: string;
    user_id?: string | null;
    billing_display_name?: string | null;
    billing_metric?: string | null;
    quantity?: number | string | null;
    nb_api_calls?: number | null;
    dimensions?: Record<string, unknown>;
};

/**
 * Mistral BYOK adapter.
 * Models use standard API key; usage/costs require Enterprise Admin API key.
 * @see https://docs.mistral.ai/admin/admin-api/usage-metrics
 */
@Injectable()
export class MistralFinopsAdapter implements AiProviderAdapter {
    readonly slug = 'mistral';
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

    private readonly logger = new Logger(MistralFinopsAdapter.name);
    private readonly modelsBase = 'https://api.mistral.ai/v1';
    private readonly adminBase = 'https://api.mistral.ai/v1/admin';

    private apiKey(creds: Record<string, unknown>): string {
        const key = typeof creds.apiKey === 'string' ? creds.apiKey.trim() : '';
        if (!key) throw new Error('MISTRAL_API_KEY_MISSING');
        return key;
    }

    private adminKey(creds: Record<string, unknown>): string | null {
        const admin =
            typeof creds.adminApiKey === 'string' && creds.adminApiKey.trim()
                ? creds.adminApiKey.trim()
                : null;
        return admin || (typeof creds.apiKey === 'string' ? creds.apiKey.trim() : null) || null;
    }

    private modelsHeaders(creds: Record<string, unknown>): Record<string, string> {
        return {
            Authorization: `Bearer ${this.apiKey(creds)}`,
            'Content-Type': 'application/json',
        };
    }

    private adminHeaders(creds: Record<string, unknown>): Record<string, string> | null {
        const key = this.adminKey(creds);
        if (!key) return null;
        return {
            Authorization: `Bearer ${key}`,
            'x-api-key': key,
            'Content-Type': 'application/json',
        };
    }

    private monthsInRange(startDate: string, endDate: string): Array<{ year: number; month: number }> {
        const start = new Date(`${startDate}T00:00:00.000Z`);
        const end = new Date(`${endDate}T00:00:00.000Z`);
        const out: Array<{ year: number; month: number }> = [];
        const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        while (cursor <= end) {
            out.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
        return out.length ? out : [{ year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 }];
    }

    private extractCategoryCost(
        category: unknown,
        categoryName: string,
        date: string,
        currency: string,
    ): AiProviderCostEntry[] {
        const entries: AiProviderCostEntry[] = [];
        if (!category || typeof category !== 'object') return entries;
        const obj = category as Record<string, unknown>;

        const totalCost = Number(obj.total_cost ?? obj.cost ?? obj.amount ?? NaN);
        if (Number.isFinite(totalCost) && totalCost !== 0) {
            entries.push({
                date,
                model: categoryName,
                cost: totalCost,
                currency,
                metadata: { source: 'mistral_admin_usage', category: categoryName },
            });
            return entries;
        }

        const models = obj.models;
        if (Array.isArray(models)) {
            for (const [index, row] of models.entries()) {
                if (!row || typeof row !== 'object') continue;
                const modelRow = row as Record<string, unknown>;
                const cost = Number(modelRow.total_cost ?? modelRow.cost ?? modelRow.amount ?? NaN);
                const modelName =
                    (typeof modelRow.model === 'string' && modelRow.model) ||
                    (typeof modelRow.name === 'string' && modelRow.name) ||
                    `${categoryName}-${index}`;
                if (!Number.isFinite(cost) || cost === 0) continue;
                entries.push({
                    date,
                    model: modelName,
                    cost,
                    currency,
                    metadata: { source: 'mistral_admin_usage', category: categoryName },
                });
            }
        }

        return entries;
    }

    async validateCredentials(creds: Record<string, unknown>): Promise<AiProviderValidateResult> {
        try {
            const response = await fetch(`${this.modelsBase}/models`, {
                method: 'GET',
                headers: this.modelsHeaders(creds),
            });
            if (!response.ok) {
                this.logger.warn(`mistral.validate.failed status=${response.status}`);
                return {
                    ok: false,
                    message: `Mistral rejected the credentials (HTTP ${response.status}).`,
                };
            }

            const adminHeaders = this.adminHeaders(creds);
            if (!adminHeaders || !creds.adminApiKey) {
                return {
                    ok: true,
                    message:
                        'Credentials validated against Mistral Models API. Enterprise Admin API key required for official usage/costs (partial).',
                };
            }

            const now = new Date();
            const probe = await fetch(
                `${this.adminBase}/usage?month=${now.getUTCMonth() + 1}&year=${now.getUTCFullYear()}`,
                { method: 'GET', headers: adminHeaders },
            );

            return {
                ok: true,
                message: probe.ok
                    ? 'Credentials validated. Mistral Admin usage/cost APIs are available.'
                    : 'Credentials validated for Models API. Admin usage/costs are not available for this key (Enterprise Admin key required; partial).',
            };
        } catch (error) {
            this.logger.warn(`mistral.validate.error: ${error instanceof Error ? error.message : 'unknown'}`);
            return { ok: false, message: 'Could not reach Mistral to validate credentials.' };
        }
    }

    async listModels(creds: Record<string, unknown>): Promise<AiProviderModelInfo[]> {
        const response = await fetch(`${this.modelsBase}/models`, {
            method: 'GET',
            headers: this.modelsHeaders(creds),
        });
        if (!response.ok) throw new Error(`MISTRAL_LIST_MODELS_FAILED_${response.status}`);
        const payload = (await response.json()) as {
            data?: Array<{ id?: string; owned_by?: string }>;
        };
        return (payload.data ?? [])
            .filter((item) => typeof item.id === 'string')
            .map((item) => ({
                modelIdentifier: item.id as string,
                displayName: item.id as string,
                modality: 'chat',
                capabilities: item.owned_by ? { ownedBy: item.owned_by } : undefined,
            }));
    }

    async fetchCosts(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderCostEntry[]> {
        const headers = this.adminHeaders(creds);
        if (!headers) return [];

        const entries: AiProviderCostEntry[] = [];
        for (const { year, month } of this.monthsInRange(startDate, endDate)) {
            const response = await fetch(`${this.adminBase}/usage?month=${month}&year=${year}`, {
                method: 'GET',
                headers,
            });
            if (response.status === 401 || response.status === 403) {
                this.logger.warn(`mistral.fetchCosts.admin_unavailable status=${response.status}`);
                return [];
            }
            if (!response.ok) {
                this.logger.warn(`mistral.fetchCosts.failed status=${response.status}`);
                continue;
            }

            const payload = (await response.json()) as Record<string, unknown>;
            const currency =
                (typeof payload.currency === 'string' && payload.currency) ||
                (typeof payload.currency_symbol === 'string' && payload.currency_symbol) ||
                'USD';
            const date =
                (typeof payload.start_date === 'string' && payload.start_date.slice(0, 10)) ||
                `${year}-${String(month).padStart(2, '0')}-01`;

            for (const category of [
                'completion',
                'chat',
                'ocr',
                'audio',
                'connectors',
                'libraries_api',
                'fine_tuning',
                'vibe_code',
            ]) {
                entries.push(...this.extractCategoryCost(payload[category], category, date, currency));
            }

            const vibeUsage = Number(payload.vibe_usage ?? NaN);
            if (Number.isFinite(vibeUsage) && vibeUsage !== 0 && entries.length === 0) {
                // Quantity-only fallback when priced breakdown is absent — store as cost shell with note.
                entries.push({
                    date,
                    model: 'vibe_usage',
                    cost: 0,
                    currency,
                    metadata: {
                        source: 'mistral_admin_usage',
                        vibeUsage,
                        note: 'Monthly usage returned without priced category totals.',
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
        const headers = this.adminHeaders(creds);
        if (!headers) return [];

        const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

        const response = await fetch(`${this.adminBase}/usage/query`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                start: `${startDate}T00:00:00Z`,
                end: endExclusive.toISOString().replace(/\.\d{3}Z$/, 'Z'),
                time_bucket: 'day',
                group_by: ['user_id', 'billing_display_name'],
                include_nb_api_calls: true,
                limit: 1000,
            }),
        });

        if (response.status === 401 || response.status === 403) {
            this.logger.warn(`mistral.fetchUsage.admin_unavailable status=${response.status}`);
            // Fall back to monthly cost shells so sync still has official spend when query is denied.
            const costs = await this.fetchCosts(creds, startDate, endDate);
            return costs.map((cost, index) => ({
                occurredAt: new Date(`${cost.date}T12:00:00.000Z`),
                model: cost.model ?? 'mistral',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                officialCost: cost.cost,
                currency: cost.currency,
                providerRequestId: `mistral-cost-${cost.date}-${index}`,
                metadata: { ...(cost.metadata ?? {}), note: 'usage/query unavailable; cost-only.' },
            }));
        }

        if (!response.ok) {
            this.logger.warn(`mistral.fetchUsage.failed status=${response.status}`);
            return [];
        }

        const payload = (await response.json()) as {
            groups?: MistralUsageQueryGroup[];
        };
        const costs = await this.fetchCosts(creds, startDate, endDate);
        const costByDate = new Map<string, number>();
        for (const cost of costs) {
            costByDate.set(cost.date, (costByDate.get(cost.date) ?? 0) + cost.cost);
        }

        const groups = payload.groups ?? [];
        const tokensByDate = new Map<string, number>();
        for (const group of groups) {
            const date = (group.start ?? startDate).slice(0, 10);
            const qty = Number(group.quantity ?? 0);
            tokensByDate.set(date, (tokensByDate.get(date) ?? 0) + (Number.isFinite(qty) ? qty : 0));
        }

        const entries: AiProviderUsageEntry[] = [];
        for (const [index, group] of groups.entries()) {
            const date = (group.start ?? startDate).slice(0, 10);
            const model =
                group.billing_display_name ??
                group.billing_metric ??
                (typeof group.dimensions?.billing_display_name === 'string'
                    ? group.dimensions.billing_display_name
                    : null) ??
                'mistral';
            const quantity = Number(group.quantity ?? 0);
            const dayTokens = tokensByDate.get(date) ?? 0;
            const dayCost = costByDate.get(date);
            const share =
                dayCost != null && dayTokens > 0 && Number.isFinite(quantity)
                    ? (quantity / dayTokens) * dayCost
                    : null;

            entries.push({
                occurredAt: new Date(`${date}T12:00:00.000Z`),
                model: String(model),
                inputTokens: Number.isFinite(quantity) ? Math.floor(quantity) : 0,
                outputTokens: 0,
                totalTokens: Number.isFinite(quantity) ? Math.floor(quantity) : 0,
                officialCost: share,
                currency: 'USD',
                userExternalId: group.user_id ?? null,
                providerRequestId: `mistral-usage-${date}-${index}-${group.user_id ?? 'na'}`,
                metadata: {
                    source: 'mistral_admin_usage_query',
                    nbApiCalls: group.nb_api_calls ?? null,
                    costAllocated: share != null,
                },
            });
        }

        if (entries.length === 0) {
            return costs.map((cost, index) => ({
                occurredAt: new Date(`${cost.date}T12:00:00.000Z`),
                model: cost.model ?? 'mistral',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                officialCost: cost.cost,
                currency: cost.currency,
                providerRequestId: `mistral-cost-${cost.date}-${index}`,
                metadata: cost.metadata ?? {},
            }));
        }

        return entries;
    }
}
