import { Injectable, Logger } from '@nestjs/common';
import type {
    AiProviderAdapter,
    AiProviderCapabilities,
    AiProviderCostEntry,
    AiProviderModelInfo,
    AiProviderUsageEntry,
    AiProviderValidateResult,
} from './ai-provider.adapter';

/**
 * Azure AI Foundry / Azure OpenAI BYOK adapter.
 * Models/validate use resource endpoint + API key.
 * Official costs require Entra SP + subscription via Cost Management.
 * @see https://learn.microsoft.com/en-us/rest/api/cost-management/
 */
@Injectable()
export class AzureAiFoundryFinopsAdapter implements AiProviderAdapter {
    readonly slug = 'azure_ai_foundry';
    readonly capabilities: AiProviderCapabilities = {
        validateCredentials: true,
        listModels: true,
        listProjects: false,
        fetchUsage: true,
        fetchCosts: true,
        fetchLimits: false,
        usageByUser: false,
        syncHistorical: true,
    };

    private readonly logger = new Logger(AzureAiFoundryFinopsAdapter.name);

    private endpoint(creds: Record<string, unknown>): string {
        const raw = typeof creds.endpoint === 'string' ? creds.endpoint.trim().replace(/\/$/, '') : '';
        if (!raw) throw new Error('AZURE_AI_ENDPOINT_MISSING');
        return raw;
    }

    private apiKey(creds: Record<string, unknown>): string {
        const key = typeof creds.apiKey === 'string' ? creds.apiKey.trim() : '';
        if (!key) throw new Error('AZURE_AI_API_KEY_MISSING');
        return key;
    }

    private apiVersion(creds: Record<string, unknown>): string {
        return typeof creds.apiVersion === 'string' && creds.apiVersion.trim()
            ? creds.apiVersion.trim()
            : '2024-10-21';
    }

    private hasCostManagementCreds(creds: Record<string, unknown>): boolean {
        return Boolean(
            typeof creds.tenantId === 'string' &&
                creds.tenantId.trim() &&
                typeof creds.clientId === 'string' &&
                creds.clientId.trim() &&
                typeof creds.clientSecret === 'string' &&
                creds.clientSecret.trim() &&
                typeof creds.subscriptionId === 'string' &&
                creds.subscriptionId.trim(),
        );
    }

    private async getManagementToken(creds: Record<string, unknown>): Promise<string | null> {
        if (!this.hasCostManagementCreds(creds)) return null;
        const tenantId = String(creds.tenantId).trim();
        const clientId = String(creds.clientId).trim();
        const clientSecret = String(creds.clientSecret).trim();
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://management.azure.com/.default',
            grant_type: 'client_credentials',
        });
        const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!response.ok) {
            this.logger.warn(`azure_ai.management_token.failed status=${response.status}`);
            return null;
        }
        const payload = (await response.json()) as { access_token?: string };
        return payload.access_token ?? null;
    }

    async validateCredentials(creds: Record<string, unknown>): Promise<AiProviderValidateResult> {
        try {
            const url = `${this.endpoint(creds)}/openai/deployments?api-version=${this.apiVersion(creds)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'api-key': this.apiKey(creds) },
            });
            if (!response.ok) {
                this.logger.warn(`azure_ai.validate.failed status=${response.status}`);
                return {
                    ok: false,
                    message: `Azure AI Foundry rejected the credentials (HTTP ${response.status}).`,
                    accountId: typeof creds.resourceName === 'string' ? creds.resourceName : null,
                };
            }

            if (!this.hasCostManagementCreds(creds)) {
                return {
                    ok: true,
                    message:
                        'Credentials validated against Azure OpenAI deployments. Add Entra SP + subscriptionId for Cost Management sync (partial).',
                    accountId: typeof creds.resourceName === 'string' ? creds.resourceName : null,
                    projectId: typeof creds.deploymentName === 'string' ? creds.deploymentName : null,
                };
            }

            const token = await this.getManagementToken(creds);
            return {
                ok: true,
                message: token
                    ? 'Credentials validated. Azure Cost Management SP token acquired.'
                    : 'Deployments OK, but Cost Management SP token failed (partial).',
                accountId: typeof creds.subscriptionId === 'string' ? creds.subscriptionId : null,
                projectId: typeof creds.deploymentName === 'string' ? creds.deploymentName : null,
            };
        } catch (error) {
            this.logger.warn(`azure_ai.validate.error: ${error instanceof Error ? error.message : 'unknown'}`);
            return { ok: false, message: 'Could not reach Azure AI Foundry endpoint.' };
        }
    }

    async listModels(creds: Record<string, unknown>): Promise<AiProviderModelInfo[]> {
        const url = `${this.endpoint(creds)}/openai/deployments?api-version=${this.apiVersion(creds)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'api-key': this.apiKey(creds) },
        });
        if (!response.ok) {
            throw new Error(`AZURE_AI_LIST_DEPLOYMENTS_FAILED_${response.status}`);
        }
        const payload = (await response.json()) as {
            data?: Array<{ id?: string; model?: string; name?: string }>;
            value?: Array<{ id?: string; model?: string; name?: string }>;
        };
        const rows = payload.data ?? payload.value ?? [];
        const models: AiProviderModelInfo[] = [];
        for (const row of rows) {
            const id = row.id ?? row.name;
            if (!id) continue;
            models.push({
                modelIdentifier: id,
                displayName: row.model ? `${id} (${row.model})` : id,
                modality: 'chat',
                contextWindow: null,
                capabilities: { underlyingModel: row.model ?? null },
            });
        }
        return models;
    }

    async fetchCosts(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderCostEntry[]> {
        const token = await this.getManagementToken(creds);
        const subscriptionId =
            typeof creds.subscriptionId === 'string' ? creds.subscriptionId.trim() : '';
        if (!token || !subscriptionId) return [];

        const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

        const url =
            `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}` +
            `/providers/Microsoft.CostManagement/query?api-version=2023-03-01`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'ActualCost',
                timeframe: 'Custom',
                timePeriod: {
                    from: `${startDate}T00:00:00Z`,
                    to: endExclusive.toISOString().replace(/\.\d{3}Z$/, 'Z'),
                },
                dataset: {
                    granularity: 'Daily',
                    aggregation: {
                        totalCost: { name: 'Cost', function: 'Sum' },
                        totalUsage: { name: 'UsageQuantity', function: 'Sum' },
                    },
                    grouping: [
                        { type: 'Dimension', name: 'MeterSubCategory' },
                        { type: 'Dimension', name: 'Meter' },
                    ],
                    filter: {
                        or: [
                            {
                                dimensions: {
                                    name: 'ServiceName',
                                    operator: 'In',
                                    values: ['Cognitive Services'],
                                },
                            },
                            {
                                dimensions: {
                                    name: 'MeterSubCategory',
                                    operator: 'In',
                                    values: ['Azure OpenAI', 'Azure Open AI', 'Azure OpenAI Reservation'],
                                },
                            },
                        ],
                    },
                },
            }),
        });

        if (!response.ok) {
            this.logger.warn(`azure_ai.fetchCosts.failed status=${response.status}`);
            return [];
        }

        const payload = (await response.json()) as {
            properties?: {
                columns?: Array<{ name?: string }>;
                rows?: Array<Array<string | number | null>>;
            };
        };

        const columns = (payload.properties?.columns ?? []).map((c) => c.name ?? '');
        const dateIdx = columns.findIndex((n) => n.toLowerCase() === 'usagedate' || n.toLowerCase() === 'date');
        const costIdx = columns.findIndex((n) => n.toLowerCase() === 'cost' || n === 'totalCost');
        const usageIdx = columns.findIndex((n) => n.toLowerCase().includes('usage'));
        const meterIdx = columns.findIndex((n) => n.toLowerCase() === 'meter');
        const subCatIdx = columns.findIndex((n) => n.toLowerCase() === 'metersubcategory');
        const currencyIdx = columns.findIndex((n) => n.toLowerCase() === 'currency');

        const entries: AiProviderCostEntry[] = [];
        for (const row of payload.properties?.rows ?? []) {
            const rawDate = dateIdx >= 0 ? row[dateIdx] : startDate;
            let date = startDate;
            if (typeof rawDate === 'number') {
                const s = String(Math.trunc(rawDate));
                date = s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : startDate;
            } else if (typeof rawDate === 'string') {
                date = rawDate.slice(0, 10);
            }
            const cost = Number(costIdx >= 0 ? row[costIdx] : 0);
            if (!Number.isFinite(cost) || cost === 0) continue;
            const meter = meterIdx >= 0 ? String(row[meterIdx] ?? '') : '';
            const subCat = subCatIdx >= 0 ? String(row[subCatIdx] ?? '') : '';
            entries.push({
                date,
                model: meter || subCat || 'Azure OpenAI',
                cost,
                currency: currencyIdx >= 0 ? String(row[currencyIdx] ?? 'USD') : 'USD',
                metadata: {
                    source: 'azure_cost_management',
                    meterSubCategory: subCat || null,
                    usageQuantity: usageIdx >= 0 ? Number(row[usageIdx] ?? 0) : null,
                },
            });
        }
        return entries;
    }

    async fetchUsage(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderUsageEntry[]> {
        const costs = await this.fetchCosts(creds, startDate, endDate);
        return costs.map((cost, index) => {
            const qty = Number(cost.metadata?.usageQuantity ?? 0);
            return {
                occurredAt: new Date(`${cost.date}T12:00:00.000Z`),
                model: cost.model ?? 'azure-openai',
                inputTokens: Number.isFinite(qty) ? Math.floor(qty) : 0,
                outputTokens: 0,
                totalTokens: Number.isFinite(qty) ? Math.floor(qty) : 0,
                officialCost: cost.cost,
                currency: cost.currency,
                providerRequestId: `azure-cm-${cost.date}-${index}-${cost.model ?? 'na'}`,
                metadata: {
                    source: 'azure_cost_management',
                    note: 'UsageQuantity from Cost Management meters (not chat token breakdown).',
                    meterSubCategory: cost.metadata?.meterSubCategory ?? null,
                },
            };
        });
    }
}
