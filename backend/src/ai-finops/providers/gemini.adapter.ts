import { Injectable, Logger } from '@nestjs/common';
import type {
    AiProviderAdapter,
    AiProviderCapabilities,
    AiProviderCostEntry,
    AiProviderModelInfo,
    AiProviderUsageEntry,
    AiProviderValidateResult,
} from './ai-provider.adapter';

@Injectable()
export class GeminiFinopsAdapter implements AiProviderAdapter {
    readonly slug = 'google_gemini';
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

    private readonly logger = new Logger(GeminiFinopsAdapter.name);

    private apiKey(creds: Record<string, unknown>): string {
        const key = typeof creds.apiKey === 'string' ? creds.apiKey.trim() : '';
        if (!key) throw new Error('GEMINI_API_KEY_MISSING');
        return key;
    }

    async validateCredentials(creds: Record<string, unknown>): Promise<AiProviderValidateResult> {
        try {
            const key = this.apiKey(creds);
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`,
            );
            if (!response.ok) {
                this.logger.warn(`gemini.validate.failed status=${response.status}`);
                return {
                    ok: false,
                    message: `Google Gemini rejected the credentials (HTTP ${response.status}).`,
                };
            }
            return {
                ok: true,
                message:
                    'Credentials validated against Gemini Models API. Google AI Studio has no public Admin usage/cost API — official spend requires Cloud Billing/BigQuery export (not supported here). Gateway estimated costs only (partial).',
            };
        } catch (error) {
            this.logger.warn(`gemini.validate.error: ${error instanceof Error ? error.message : 'unknown'}`);
            return { ok: false, message: 'Could not reach Google Gemini to validate credentials.' };
        }
    }

    async listModels(creds: Record<string, unknown>): Promise<AiProviderModelInfo[]> {
        const key = this.apiKey(creds);
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        );
        if (!response.ok) throw new Error(`GEMINI_LIST_MODELS_FAILED_${response.status}`);
        const payload = (await response.json()) as {
            models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
        };
        return (payload.models ?? [])
            .filter((item) => typeof item.name === 'string')
            .map((item) => ({
                modelIdentifier: (item.name as string).replace(/^models\//, ''),
                displayName: item.displayName ?? (item.name as string),
                modality: item.supportedGenerationMethods?.includes('generateContent') ? 'chat' : 'other',
            }));
    }

    async fetchUsage(): Promise<AiProviderUsageEntry[]> {
        return [];
    }

    async fetchCosts(): Promise<AiProviderCostEntry[]> {
        return [];
    }
}
