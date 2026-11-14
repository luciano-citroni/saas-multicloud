import { Injectable } from '@nestjs/common';
import { OpenAiFinopsAdapter } from './openai.adapter';
import { BedrockFinopsAdapter } from './bedrock.adapter';
import { AzureAiFoundryFinopsAdapter } from './azure-ai-foundry.adapter';
import { AnthropicFinopsAdapter } from './anthropic.adapter';
import { GeminiFinopsAdapter } from './gemini.adapter';
import { MicrosoftCopilotFinopsAdapter } from './microsoft-copilot.adapter';
import { DeepSeekFinopsAdapter } from './deepseek.adapter';
import { GroqFinopsAdapter } from './groq.adapter';
import { MistralFinopsAdapter } from './mistral.adapter';
import { StubAiProviderAdapter } from './stub.adapter';
import type { AiProviderAdapter } from './ai-provider.adapter';
import { AI_FINOPS_PROVIDER_SEEDS } from '../constants';

@Injectable()
export class AiFinopsAdapterRegistry {
    private readonly adapters: Map<string, AiProviderAdapter>;

    constructor(
        openai: OpenAiFinopsAdapter,
        bedrock: BedrockFinopsAdapter,
        azureAi: AzureAiFoundryFinopsAdapter,
        anthropic: AnthropicFinopsAdapter,
        gemini: GeminiFinopsAdapter,
        copilot: MicrosoftCopilotFinopsAdapter,
        deepseek: DeepSeekFinopsAdapter,
        groq: GroqFinopsAdapter,
        mistral: MistralFinopsAdapter,
    ) {
        this.adapters = new Map<string, AiProviderAdapter>();
        this.adapters.set(openai.slug, openai);
        this.adapters.set(bedrock.slug, bedrock);
        this.adapters.set(azureAi.slug, azureAi);
        this.adapters.set(anthropic.slug, anthropic);
        this.adapters.set(gemini.slug, gemini);
        this.adapters.set(copilot.slug, copilot);
        this.adapters.set(deepseek.slug, deepseek);
        this.adapters.set(groq.slug, groq);
        this.adapters.set(mistral.slug, mistral);
        for (const seed of AI_FINOPS_PROVIDER_SEEDS) {
            if (!this.adapters.has(seed.slug)) {
                this.adapters.set(seed.slug, new StubAiProviderAdapter(seed.slug));
            }
        }
    }

    get(slug: string): AiProviderAdapter | null {
        return this.adapters.get(slug) ?? null;
    }

    list(): AiProviderAdapter[] {
        return Array.from(this.adapters.values());
    }
}
