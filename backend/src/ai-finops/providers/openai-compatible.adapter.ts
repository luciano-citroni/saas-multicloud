import { Logger } from '@nestjs/common';
import type {
    AiProviderAdapter,
    AiProviderCapabilities,
    AiProviderCostEntry,
    AiProviderModelInfo,
    AiProviderUsageEntry,
    AiProviderValidateResult,
} from './ai-provider.adapter';

/**
 * Shared OpenAI-compatible BYOK adapter (DeepSeek, Groq, Mistral, etc.).
 * Usage/cost admin APIs are not assumed — capabilities stay honest.
 */
export class OpenAiCompatibleFinopsAdapter implements AiProviderAdapter {
    readonly capabilities: AiProviderCapabilities = {
        validateCredentials: true,
        listModels: true,
        listProjects: false,
        fetchUsage: false,
        fetchCosts: false,
        fetchLimits: false,
        usageByUser: false,
        syncHistorical: false,
    };

    private readonly logger: Logger;

    constructor(
        readonly slug: string,
        private readonly baseUrl: string,
        private readonly displayName: string,
    ) {
        this.logger = new Logger(`OpenAiCompatibleFinopsAdapter:${slug}`);
    }

    private apiKey(creds: Record<string, unknown>): string {
        const key = typeof creds.apiKey === 'string' ? creds.apiKey.trim() : '';
        if (!key) throw new Error(`${this.slug.toUpperCase()}_API_KEY_MISSING`);
        return key;
    }

    private headers(creds: Record<string, unknown>): Record<string, string> {
        return {
            Authorization: `Bearer ${this.apiKey(creds)}`,
            'Content-Type': 'application/json',
        };
    }

    async validateCredentials(creds: Record<string, unknown>): Promise<AiProviderValidateResult> {
        try {
            const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models`, {
                method: 'GET',
                headers: this.headers(creds),
            });
            if (!response.ok) {
                this.logger.warn(`${this.slug}.validate.failed status=${response.status}`);
                return {
                    ok: false,
                    message: `${this.displayName} rejected the credentials (HTTP ${response.status}).`,
                };
            }
            return {
                ok: true,
                message: `Credentials validated against ${this.displayName} Models API. No public Admin usage/cost API is documented for standard API keys — use AI Gateway estimated costs only (partial).`,
            };
        } catch (error) {
            this.logger.warn(
                `${this.slug}.validate.error: ${error instanceof Error ? error.message : 'unknown'}`,
            );
            return { ok: false, message: `Could not reach ${this.displayName} to validate credentials.` };
        }
    }

    async listModels(creds: Record<string, unknown>): Promise<AiProviderModelInfo[]> {
        const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models`, {
            method: 'GET',
            headers: this.headers(creds),
        });
        if (!response.ok) {
            throw new Error(`${this.slug.toUpperCase()}_LIST_MODELS_FAILED_${response.status}`);
        }
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

    async fetchUsage(): Promise<AiProviderUsageEntry[]> {
        return [];
    }

    async fetchCosts(): Promise<AiProviderCostEntry[]> {
        return [];
    }
}
