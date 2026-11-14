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
 * Microsoft Copilot / M365 connector.
 * Seats via subscribedSkus; official consumption via Graph Copilot Cost Management (credits, not USD invoice).
 * @see https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/cost-management/overview
 */
@Injectable()
export class MicrosoftCopilotFinopsAdapter implements AiProviderAdapter {
    readonly slug = 'microsoft_copilot';
    readonly capabilities: AiProviderCapabilities = {
        validateCredentials: true,
        listModels: false,
        listProjects: false,
        fetchUsage: true,
        fetchCosts: true,
        fetchLimits: false,
        usageByUser: true,
        syncHistorical: true,
    };

    private readonly logger = new Logger(MicrosoftCopilotFinopsAdapter.name);

    private async getAccessToken(creds: Record<string, unknown>): Promise<string | null> {
        const tenantId = typeof creds.tenantId === 'string' ? creds.tenantId.trim() : '';
        const clientId = typeof creds.clientId === 'string' ? creds.clientId.trim() : '';
        const clientSecret = typeof creds.clientSecret === 'string' ? creds.clientSecret.trim() : '';
        if (!tenantId || !clientId || !clientSecret) return null;

        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials',
        });
        const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!response.ok) return null;
        const payload = (await response.json()) as { access_token?: string };
        return payload.access_token ?? null;
    }

    private eachUtcDay(startDate: string, endDate: string): string[] {
        const days: string[] = [];
        const cursor = new Date(`${startDate}T00:00:00.000Z`);
        const end = new Date(`${endDate}T00:00:00.000Z`);
        while (cursor <= end) {
            days.push(cursor.toISOString().slice(0, 10));
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return days;
    }

    async validateCredentials(creds: Record<string, unknown>): Promise<AiProviderValidateResult> {
        try {
            const token = await this.getAccessToken(creds);
            if (!token) {
                return {
                    ok: false,
                    message: 'Microsoft Graph client credentials are incomplete or rejected.',
                };
            }
            const response = await fetch('https://graph.microsoft.com/v1.0/subscribedSkus?$top=1', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                this.logger.warn(`copilot.validate.failed status=${response.status}`);
                return {
                    ok: false,
                    message: `Microsoft Graph rejected the credentials (HTTP ${response.status}). Ensure Organization.Read.All (application) is granted.`,
                };
            }

            const creditsProbe = await fetch(
                'https://graph.microsoft.com/beta/copilot/costManagement/getTenantCreditBalance',
                { headers: { Authorization: `Bearer ${token}` } },
            );

            return {
                ok: true,
                message: creditsProbe.ok
                    ? 'Credentials validated. Graph seats + Copilot Cost Management (credits) are available.'
                    : 'Credentials validated against subscribedSkus. Copilot Cost Management may need additional Graph permissions (partial).',
            };
        } catch (error) {
            this.logger.warn(`copilot.validate.error: ${error instanceof Error ? error.message : 'unknown'}`);
            return { ok: false, message: 'Could not reach Microsoft Graph to validate credentials.' };
        }
    }

    async listModels(): Promise<AiProviderModelInfo[]> {
        return [];
    }

    async fetchCosts(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderCostEntry[]> {
        const token = await this.getAccessToken(creds);
        if (!token) return [];

        const entries: AiProviderCostEntry[] = [];

        // Tenant credit balance snapshot (remaining) — not period spend; still useful official signal.
        const balanceRes = await fetch(
            'https://graph.microsoft.com/beta/copilot/costManagement/getTenantCreditBalance',
            { headers: { Authorization: `Bearer ${token}` } },
        );
        if (balanceRes.ok) {
            const balancePayload = (await balanceRes.json()) as {
                value?: Array<{
                    billingMethod?: string | null;
                    remainingCredits?: number | string | null;
                    currency?: string | null;
                }>;
                remainingCredits?: number | string | null;
            };
            const rows = balancePayload.value ?? [
                {
                    billingMethod: 'tenant',
                    remainingCredits: balancePayload.remainingCredits,
                },
            ];
            for (const [index, row] of rows.entries()) {
                const remaining = Number(row.remainingCredits ?? NaN);
                if (!Number.isFinite(remaining)) continue;
                entries.push({
                    date: endDate,
                    model: row.billingMethod ?? 'copilot_credits_balance',
                    cost: 0,
                    currency: 'CRD',
                    metadata: {
                        source: 'ms_graph_copilot_credit_balance',
                        remainingCredits: remaining,
                        note: 'Official Copilot Credits balance snapshot (not USD invoice).',
                        index,
                    },
                });
            }
        } else if (balanceRes.status !== 404) {
            this.logger.warn(`copilot.fetchCosts.balance_failed status=${balanceRes.status}`);
        }

        // Daily user usage records → sum credits consumed as official "cost" in CRD units.
        const days = this.eachUtcDay(startDate, endDate).slice(-31);
        for (const day of days) {
            const url =
                `https://graph.microsoft.com/beta/copilot/costManagement/usageReports/userUsageRecords` +
                `?$filter=usageDate eq ${day}`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.status === 401 || response.status === 403) {
                this.logger.warn(`copilot.fetchCosts.usage_unavailable status=${response.status}`);
                break;
            }
            if (!response.ok) {
                // Endpoint/filter variants differ by tenant; skip quietly.
                continue;
            }
            const payload = (await response.json()) as {
                value?: Array<{
                    userId?: string | null;
                    id?: string | null;
                    creditsConsumed?: number | string | null;
                    totalCredits?: number | string | null;
                    usageDate?: string | null;
                }>;
            };
            for (const row of payload.value ?? []) {
                const credits = Number(row.creditsConsumed ?? row.totalCredits ?? 0);
                if (!Number.isFinite(credits) || credits === 0) continue;
                entries.push({
                    date: day,
                    model: 'copilot_credits',
                    cost: credits,
                    currency: 'CRD',
                    userExternalId: row.userId ?? row.id ?? null,
                    metadata: {
                        source: 'ms_graph_copilot_user_usage_records',
                        note: 'Copilot Credits consumed (not USD).',
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
        const costs = await this.fetchCosts(creds, startDate, endDate);
        return costs
            .filter((c) => c.metadata?.source === 'ms_graph_copilot_user_usage_records' || c.cost > 0)
            .map((cost, index) => ({
                occurredAt: new Date(`${cost.date}T12:00:00.000Z`),
                model: cost.model ?? 'microsoft-copilot',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                officialCost: cost.cost,
                currency: cost.currency,
                userExternalId: cost.userExternalId ?? null,
                providerRequestId: `copilot-credits-${cost.date}-${index}-${cost.userExternalId ?? 'na'}`,
                metadata: {
                    ...(cost.metadata ?? {}),
                    unit: 'copilot_credits',
                },
            }));
    }

    /** Returns Copilot-related subscribed SKUs when Graph permits. */
    async listCopilotSeats(creds: Record<string, unknown>): Promise<
        Array<{ skuId: string; skuPartNumber: string; prepaidUnits: number; consumedUnits: number }>
    > {
        const token = await this.getAccessToken(creds);
        if (!token) return [];
        const response = await fetch('https://graph.microsoft.com/v1.0/subscribedSkus', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            this.logger.warn(`copilot.skus.failed status=${response.status}`);
            return [];
        }
        const payload = (await response.json()) as {
            value?: Array<{
                skuId?: string;
                skuPartNumber?: string;
                prepaidUnits?: { enabled?: number };
                consumedUnits?: number;
            }>;
        };
        return (payload.value ?? [])
            .filter((sku) => {
                const part = (sku.skuPartNumber ?? '').toUpperCase();
                return part.includes('COPILOT') || part.includes('M365_COPILOT');
            })
            .map((sku) => ({
                skuId: sku.skuId ?? '',
                skuPartNumber: sku.skuPartNumber ?? 'COPILOT',
                prepaidUnits: Number(sku.prepaidUnits?.enabled ?? 0),
                consumedUnits: Number(sku.consumedUnits ?? 0),
            }));
    }
}
