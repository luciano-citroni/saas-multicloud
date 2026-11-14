import type {
    AiProviderAdapter,
    AiProviderCapabilities,
    AiProviderModelInfo,
    AiProviderValidateResult,
} from './ai-provider.adapter';

const EMPTY_CAPABILITIES: AiProviderCapabilities = {
    validateCredentials: false,
    listModels: false,
    listProjects: false,
    fetchUsage: false,
    fetchCosts: false,
    fetchLimits: false,
    usageByUser: false,
    syncHistorical: false,
};

export class StubAiProviderAdapter implements AiProviderAdapter {
    readonly capabilities = EMPTY_CAPABILITIES;

    constructor(readonly slug: string) {}

    async validateCredentials(): Promise<AiProviderValidateResult> {
        return {
            ok: false,
            message: `Adapter for provider "${this.slug}" is not implemented yet.`,
        };
    }

    async listModels(): Promise<AiProviderModelInfo[]> {
        return [];
    }
}
