import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorMessages } from '../../common/messages/error-messages';
import type { AiProvider } from './ai-provider.interface';
import { OpenAiProvider } from './openai.provider';

@Injectable()
export class AiProviderFactory {
    private readonly logger = new Logger(AiProviderFactory.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly openAiProvider: OpenAiProvider,
    ) {}

    isEnabled(): boolean {
        const raw = this.configService.get<string>('AI_ENABLED');
        if (raw === undefined || raw === null || raw === '') {
            return true;
        }
        return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase());
    }

    getProvider(): AiProvider & { isConfigured(): boolean; getModel(): string; getProviderName(): string } {
        if (!this.isEnabled()) {
            throw new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_DISABLED);
        }

        const providerName = (
            this.configService.get<string>('AI_CHAT_PROVIDER') ??
            this.configService.get<string>('AI_PROVIDER') ??
            'openai'
        )
            .trim()
            .toLowerCase();

        if (providerName !== 'openai') {
            this.logger.warn(`Unsupported AI provider "${providerName}", falling back to openai`);
        }

        return this.openAiProvider;
    }
}
