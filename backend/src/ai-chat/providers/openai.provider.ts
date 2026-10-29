import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ErrorMessages } from '../../common/messages/error-messages';
import type {
    AiChatCompletionRequest,
    AiChatCompletionResult,
    AiProvider,
} from './ai-provider.interface';

@Injectable()
export class OpenAiProvider implements AiProvider {
    private readonly logger = new Logger(OpenAiProvider.name);
    private readonly client: OpenAI | null;
    private readonly model: string;
    private readonly timeoutMs: number;
    private readonly defaultMaxTokens: number;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
        const baseURL = this.configService.get<string>('OPENAI_BASE_URL')?.trim() || undefined;
        this.model = this.configService.get<string>('OPENAI_MODEL')?.trim() || 'gpt-6-luna';
        this.timeoutMs = Number(this.configService.get<string>('AI_CHAT_TIMEOUT_MS') ?? 60_000);
        this.defaultMaxTokens = Number(this.configService.get<string>('AI_CHAT_MAX_TOKENS') ?? 2048);
        this.client = apiKey ? new OpenAI({ apiKey, baseURL, timeout: this.timeoutMs }) : null;
    }

    isConfigured(): boolean {
        return this.client !== null;
    }

    async complete(request: AiChatCompletionRequest): Promise<AiChatCompletionResult> {
        if (!this.client) {
            throw new ServiceUnavailableException(ErrorMessages.AI_CHAT.PROVIDER_NOT_CONFIGURED);
        }

        try {
            const messages = request.messages.map((message) => {
                if (message.role === 'assistant' && message.tool_calls?.length) {
                    return {
                        role: 'assistant' as const,
                        content: message.content,
                        tool_calls: message.tool_calls.map((call) => ({
                            id: call.id,
                            type: 'function' as const,
                            function: {
                                name: call.name,
                                arguments: call.arguments,
                            },
                        })),
                    };
                }
                return message;
            }) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

            const response = await this.client.chat.completions.create(
                {
                    model: this.model,
                    messages,
                    tools: request.tools?.map((tool) => ({
                        type: 'function' as const,
                        function: {
                            name: tool.name,
                            description: tool.description,
                            parameters: tool.parameters,
                        },
                    })),
                    max_tokens: request.maxTokens ?? this.defaultMaxTokens,
                    temperature: 0.2,
                },
                { signal: request.signal },
            );

            const choice = response.choices[0]?.message;
            const toolCalls =
                choice?.tool_calls
                    ?.filter((call) => call.type === 'function')
                    .map((call) => ({
                        id: call.id,
                        name: call.function.name,
                        arguments: call.function.arguments ?? '{}',
                    })) ?? [];

            return {
                content: choice?.content ?? null,
                toolCalls,
                usage: {
                    promptTokens: response.usage?.prompt_tokens,
                    completionTokens: response.usage?.completion_tokens,
                    totalTokens: response.usage?.total_tokens,
                },
            };
        } catch (error) {
            if (request.signal?.aborted) {
                throw error;
            }

            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`openai.complete.failed: ${message}`);

            if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('timed out')) {
                throw new ServiceUnavailableException(ErrorMessages.AI_CHAT.PROVIDER_TIMEOUT);
            }

            throw new ServiceUnavailableException(ErrorMessages.AI_CHAT.PROVIDER_UNAVAILABLE);
        }
    }
}
