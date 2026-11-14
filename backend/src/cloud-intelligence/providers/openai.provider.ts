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
    AiChatStreamHandlers,
    AiProvider,
} from './ai-provider.interface';

@Injectable()
export class OpenAiProvider implements AiProvider {
    private readonly logger = new Logger(OpenAiProvider.name);
    private readonly client: OpenAI | null;
    private readonly model: string;
    private readonly embeddingModel: string;
    private readonly timeoutMs: number;
    private readonly defaultMaxTokens: number;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
        const baseURL = this.configService.get<string>('OPENAI_BASE_URL')?.trim() || undefined;
        this.model = this.configService.get<string>('OPENAI_MODEL')?.trim() || 'gpt-6-luna';
        this.embeddingModel =
            this.configService.get<string>('OPENAI_EMBEDDING_MODEL')?.trim() || 'text-embedding-3-small';
        this.timeoutMs = Number(this.configService.get<string>('AI_CHAT_TIMEOUT_MS') ?? 60_000);
        this.defaultMaxTokens = Number(
            this.configService.get<string>('AI_MAX_TOKENS') ??
                this.configService.get<string>('AI_CHAT_MAX_TOKENS') ??
                2048,
        );
        this.client = apiKey ? new OpenAI({ apiKey, baseURL, timeout: this.timeoutMs }) : null;
    }

    isConfigured(): boolean {
        return this.client !== null;
    }

    supportsEmbeddings(): boolean {
        return this.client !== null && Boolean(this.embeddingModel);
    }

    getModel(): string {
        return this.model;
    }

    getProviderName(): string {
        return 'openai';
    }

    async embed(texts: string[]): Promise<number[][]> {
        if (!this.client) {
            throw new ServiceUnavailableException(
                ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_NOT_CONFIGURED,
            );
        }
        const response = await this.client.embeddings.create({
            model: this.embeddingModel,
            input: texts,
        });
        return response.data
            .sort((a, b) => a.index - b.index)
            .map((item) => item.embedding);
    }

    /** GPT-5+ / GPT-6 / o-series prefer max_completion_tokens over max_tokens. */
    private usesMaxCompletionTokens(model: string): boolean {
        return /^(gpt-5|gpt-6|o\d)/i.test(model);
    }

    /**
     * GPT-6 Sol/Luna support Chat Completions tool calling only with reasoning_effort=none.
     * @see https://developers.openai.com/api/docs/models/gpt-6-luna
     */
    private requiresReasoningNoneForTools(model: string): boolean {
        return /^(gpt-6-luna|gpt-6-sol|gpt-5\.?\d*-?(luna|sol)?)/i.test(model);
    }

    private buildChatParams(request: AiChatCompletionRequest): OpenAI.Chat.Completions.ChatCompletionCreateParams {
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

        // GPT-6 Luna/Sol on Chat Completions only support function calling with
        // reasoning_effort=none; temperature is unsupported unless effort is none.
        // Prefer max_completion_tokens for GPT-5+/GPT-6; keep max_tokens for gpt-4o.
        const maxTokens = request.maxTokens ?? this.defaultMaxTokens;
        const tools = request.tools?.map((tool) => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));
        const isModernModel = this.usesMaxCompletionTokens(this.model);
        // Chat Completions + tools on Luna/Sol only works with reasoning_effort=none.
        // temperature is rejected when effort is not none (default is medium).
        const needsReasoningNoneForTools =
            Boolean(tools?.length) && this.requiresReasoningNoneForTools(this.model);

        return {
            model: this.model,
            messages,
            tools,
            ...(isModernModel
                ? {
                      max_completion_tokens: maxTokens,
                      ...(needsReasoningNoneForTools
                          ? { reasoning_effort: 'none' as const }
                          : {}),
                  }
                : {
                      max_tokens: maxTokens,
                      temperature: 0.2,
                  }),
        };
    }

    private mapProviderError(error: unknown, signal?: AbortSignal): never {
        if (signal?.aborted) {
            throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`openai.complete.failed: ${message}`);

        if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('timed out')) {
            throw new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_TIMEOUT);
        }

        throw new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_UNAVAILABLE);
    }

    async complete(request: AiChatCompletionRequest): Promise<AiChatCompletionResult> {
        if (!this.client) {
            throw new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_NOT_CONFIGURED);
        }

        try {
            const response = await this.client.chat.completions.create(
                { ...this.buildChatParams(request), stream: false },
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
            this.mapProviderError(error, request.signal);
        }
    }

    async streamComplete(
        request: AiChatCompletionRequest,
        handlers?: AiChatStreamHandlers,
    ): Promise<AiChatCompletionResult> {
        if (!this.client) {
            throw new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_NOT_CONFIGURED);
        }

        try {
            const stream = await this.client.chat.completions.create(
                { ...this.buildChatParams(request), stream: true, stream_options: { include_usage: true } },
                { signal: request.signal },
            );

            let content = '';
            const toolCallsByIndex = new Map<
                number,
                { id: string; name: string; arguments: string }
            >();
            let usage: AiChatCompletionResult['usage'];

            for await (const chunk of stream) {
                if (request.signal?.aborted) {
                    break;
                }

                if (chunk.usage) {
                    usage = {
                        promptTokens: chunk.usage.prompt_tokens,
                        completionTokens: chunk.usage.completion_tokens,
                        totalTokens: chunk.usage.total_tokens,
                    };
                }

                const choice = chunk.choices[0];
                if (!choice) continue;

                const delta = choice.delta;
                if (delta?.content) {
                    content += delta.content;
                    await handlers?.onContentDelta?.(delta.content, content);
                }

                if (delta?.tool_calls?.length) {
                    for (const toolDelta of delta.tool_calls) {
                        const index = toolDelta.index ?? 0;
                        const current = toolCallsByIndex.get(index) ?? {
                            id: '',
                            name: '',
                            arguments: '',
                        };
                        if (toolDelta.id) current.id = toolDelta.id;
                        if (toolDelta.function?.name) current.name = toolDelta.function.name;
                        if (toolDelta.function?.arguments) {
                            current.arguments += toolDelta.function.arguments;
                        }
                        toolCallsByIndex.set(index, current);
                    }
                }
            }

            const toolCalls = Array.from(toolCallsByIndex.entries())
                .sort(([a], [b]) => a - b)
                .map(([, call]) => ({
                    id: call.id,
                    name: call.name,
                    arguments: call.arguments || '{}',
                }))
                .filter((call) => Boolean(call.id && call.name));

            return {
                content: content || null,
                toolCalls,
                usage,
            };
        } catch (error) {
            this.mapProviderError(error, request.signal);
        }
    }
}
