import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorMessages } from '../common/messages/error-messages';
import type { AiChatSource } from '../db/entites/ai-chat-message.entity';
import { ChatAuditService } from './chat-audit.service';
import { ChatHistoryService } from './chat-history.service';
import { ChatScopeService } from './chat-scope.service';
import { ChatToolService } from './chat-tool.service';
import type { CreateConversationDto, SendMessageDto } from './dto';
import { AI_CHAT_SYSTEM_PROMPT_V3 } from './prompts/system-prompt';
import type { AiChatProviderMessage } from './providers/ai-provider.interface';
import { OpenAiProvider } from './providers/openai.provider';

export type SseEvent =
    | { event: 'token'; data: { content: string } }
    | { event: 'tool'; data: { name: string; status: 'started' | 'finished' | 'error' } }
    | { event: 'sources'; data: { sources: AiChatSource[] } }
    | { event: 'done'; data: { messageId: string; conversationId: string } }
    | { event: 'error'; data: { message: string } };

@Injectable()
export class AiChatService {
    private readonly logger = new Logger(AiChatService.name);
    private readonly activeGenerations = new Map<string, AbortController>();
    private readonly maxToolCalls: number;
    private readonly maxHistoryMessages: number;

    constructor(
        private readonly historyService: ChatHistoryService,
        private readonly scopeService: ChatScopeService,
        private readonly toolService: ChatToolService,
        private readonly auditService: ChatAuditService,
        private readonly openAiProvider: OpenAiProvider,
        private readonly configService: ConfigService,
    ) {
        this.maxToolCalls = Number(this.configService.get<string>('AI_CHAT_MAX_TOOL_CALLS') ?? 6);
        this.maxHistoryMessages = Number(this.configService.get<string>('AI_CHAT_MAX_HISTORY_MESSAGES') ?? 20);
    }

    listConversations(organizationId: string, userId: string) {
        return this.historyService.listConversations(organizationId, userId);
    }

    async createConversation(organizationId: string, userId: string, dto: CreateConversationDto) {
        const conversation = await this.historyService.createConversation(
            organizationId,
            userId,
            dto.title ?? 'Nova conversa',
        );
        await this.auditService.record({
            organizationId,
            actorId: userId,
            action: 'conversation_created',
            entityType: 'ai_chat_conversation',
            entityId: conversation.id,
        });
        return conversation;
    }

    getConversation(conversationId: string, organizationId: string, userId: string) {
        return this.historyService.getConversationWithMessages(conversationId, organizationId, userId);
    }

    async deleteConversation(conversationId: string, organizationId: string, userId: string) {
        this.cancelGeneration(conversationId, userId);
        await this.historyService.deleteConversation(conversationId, organizationId, userId);
    }

    cancelGeneration(conversationId: string, userId: string): boolean {
        const key = `${userId}:${conversationId}`;
        const controller = this.activeGenerations.get(key);
        if (!controller) {
            return false;
        }
        controller.abort();
        this.activeGenerations.delete(key);
        return true;
    }

    async *streamMessage(
        conversationId: string,
        organizationId: string,
        userId: string,
        dto: SendMessageDto,
    ): AsyncGenerator<SseEvent> {
        const startedAt = Date.now();
        const generationKey = `${userId}:${conversationId}`;
        const existing = this.activeGenerations.get(generationKey);
        if (existing) {
            existing.abort();
        }
        const abortController = new AbortController();
        this.activeGenerations.set(generationKey, abortController);

        try {
            const conversation = await this.historyService.getConversationOrFail(
                conversationId,
                organizationId,
                userId,
            );

            await this.historyService.addMessage({
                conversationId: conversation.id,
                role: 'user',
                content: dto.content,
            });

            await this.auditService.record({
                organizationId,
                actorId: userId,
                action: 'message_sent',
                entityType: 'ai_chat_conversation',
                entityId: conversation.id,
                metadata: { length: dto.content.length },
            });

            if (conversation.title === 'Nova conversa' || conversation.title === 'New conversation') {
                await this.historyService.updateTitle(
                    conversation.id,
                    organizationId,
                    userId,
                    dto.content.slice(0, 80),
                );
            }

            const scope = this.scopeService.evaluate(dto.content);
            if (!scope.allowed) {
                await this.auditService.record({
                    organizationId,
                    actorId: userId,
                    action: 'scope_rejected',
                    entityType: 'ai_chat_conversation',
                    entityId: conversation.id,
                    metadata: { reason: scope.reason },
                });
                const assistant = await this.historyService.addMessage({
                    conversationId: conversation.id,
                    role: 'assistant',
                    content: scope.message,
                    sources: [],
                });
                yield { event: 'token', data: { content: scope.message } };
                yield { event: 'done', data: { messageId: assistant.id, conversationId: conversation.id } };
                return;
            }

            // Greetings: reply without tools/provider so we never attach module page links.
            if (scope.reason === 'greeting') {
                const assistant = await this.historyService.addMessage({
                    conversationId: conversation.id,
                    role: 'assistant',
                    content: scope.message,
                    sources: [],
                });
                yield { event: 'token', data: { content: scope.message } };
                yield { event: 'done', data: { messageId: assistant.id, conversationId: conversation.id } };
                return;
            }

            if (!this.openAiProvider.isConfigured()) {
                throw new ServiceUnavailableException(ErrorMessages.AI_CHAT.PROVIDER_NOT_CONFIGURED);
            }

            const enabledModules = await this.toolService.resolveEnabledModules(organizationId);
            const tools = this.toolService.listToolsForContext(enabledModules);

            const history = await this.historyService.getRecentMessagesForContext(
                conversation.id,
                organizationId,
                userId,
                this.maxHistoryMessages,
            );

            const messages: AiChatProviderMessage[] = [
                { role: 'system', content: AI_CHAT_SYSTEM_PROMPT_V3 },
                ...history
                    .filter((message) => message.role === 'user' || message.role === 'assistant')
                    .map((message) => ({
                        role: message.role as 'user' | 'assistant',
                        content: message.content,
                    })),
            ];

            // Optional explicit account filter (only when the client sends it). Default remains org-wide.
            if (dto.cloudAccountId) {
                messages.splice(1, 0, {
                    role: 'system',
                    content: `The user explicitly scoped this question to cloudAccountId ${dto.cloudAccountId}. Prefer that account when calling tools; still revalidate it in tools. If tools support omitting cloudAccountId, you may still use org-wide aggregation when comparing accounts.`,
                });
            }

            const collectedSources: AiChatSource[] = [];
            let toolCallsUsed = 0;
            let finalContent = '';
            let usage: Record<string, unknown> | null = null;

            while (true) {
                if (abortController.signal.aborted) {
                    throw new ServiceUnavailableException(ErrorMessages.AI_CHAT.GENERATION_CANCELLED);
                }

                const completion = await this.openAiProvider.complete({
                    messages,
                    tools,
                    signal: abortController.signal,
                });
                usage = completion.usage ?? usage;

                if (completion.toolCalls.length > 0) {
                    messages.push({
                        role: 'assistant',
                        content: completion.content,
                        tool_calls: completion.toolCalls,
                    });

                    for (const toolCall of completion.toolCalls) {
                        toolCallsUsed += 1;
                        if (toolCallsUsed > this.maxToolCalls) {
                            throw new ServiceUnavailableException(ErrorMessages.AI_CHAT.TOOL_LIMIT_EXCEEDED);
                        }

                        yield { event: 'tool', data: { name: toolCall.name, status: 'started' } };

                        let parsedArgs: Record<string, unknown> = {};
                        try {
                            parsedArgs = JSON.parse(toolCall.arguments || '{}') as Record<string, unknown>;
                        } catch {
                            parsedArgs = {};
                        }

                        try {
                            const result = await this.toolService.executeTool(toolCall.name, parsedArgs, {
                                organizationId,
                                userId,
                                enabledModules,
                            });
                            collectedSources.push(...result.sources);
                            messages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: result.content,
                            });
                            yield { event: 'tool', data: { name: toolCall.name, status: 'finished' } };
                        } catch (error) {
                            const message =
                                error instanceof Error ? error.message : ErrorMessages.GENERAL.UNEXPECTED_ERROR;
                            messages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: wrapToolError(message),
                            });
                            yield { event: 'tool', data: { name: toolCall.name, status: 'error' } };
                        }
                    }
                    continue;
                }

                finalContent =
                    completion.content?.trim() ||
                    'Não encontrei dados suficientes para responder com segurança.';
                break;
            }

            const uniqueSources = dedupeSources(collectedSources);
            const assistantMessage = await this.historyService.addMessage({
                conversationId: conversation.id,
                role: 'assistant',
                content: finalContent,
                sources: uniqueSources,
                tokenUsage: usage,
            });

            yield { event: 'token', data: { content: finalContent } };
            if (uniqueSources.length > 0) {
                yield { event: 'sources', data: { sources: uniqueSources } };
            }
            yield {
                event: 'done',
                data: { messageId: assistantMessage.id, conversationId: conversation.id },
            };

            this.logger.log(
                `ai-chat.completed org=${organizationId} conversation=${conversation.id} latencyMs=${Date.now() - startedAt} tools=${toolCallsUsed} tokens=${usage?.totalTokens ?? 'n/a'}`,
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : ErrorMessages.AI_CHAT.PROVIDER_UNAVAILABLE;
            await this.auditService.record({
                organizationId,
                actorId: userId,
                action: 'provider_error',
                entityType: 'ai_chat_conversation',
                entityId: conversationId,
                metadata: { message },
            });
            yield { event: 'error', data: { message } };
        } finally {
            if (this.activeGenerations.get(generationKey) === abortController) {
                this.activeGenerations.delete(generationKey);
            }
        }
    }
}

function wrapToolError(message: string): string {
    return `<UNTRUSTED_DATA>\n${JSON.stringify({ error: message })}\n</UNTRUSTED_DATA>`;
}

function dedupeSources(sources: AiChatSource[]): AiChatSource[] {
    const seen = new Set<string>();
    const result: AiChatSource[] = [];
    for (const source of sources) {
        const key = `${source.module}|${source.label}|${source.detail ?? ''}|${source.href ?? ''}|${source.cloudAccountId ?? ''}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(source);
    }
    return result;
}
