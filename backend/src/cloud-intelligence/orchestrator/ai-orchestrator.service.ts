import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorMessages } from '../../common/messages/error-messages';
import type { AiChatSource } from '../../db/entites/ai-chat-message.entity';
import { AiAgentType } from '../agents/agent.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { AiAuditService } from '../audit/ai-audit.service';
import type { CreateConversationDto, SendMessageDto } from '../dto';
import { ConversationService } from '../history/conversation.service';
import { AI_CHAT_SYSTEM_PROMPT_V4 } from '../prompts/system-prompt';
import type { AiChatProviderMessage } from '../providers/ai-provider.interface';
import { AiProviderFactory } from '../providers/ai-provider.factory';
import { AiToolRegistry } from '../tools/ai-tool.registry';
import { AiQuotasService } from '../usage/ai-quotas.service';
import { AiUsageService } from '../usage/ai-usage.service';
import { ContextBuilderService } from './context-builder.service';
import { IntentClassifierService } from './intent-classifier.service';

export type SseEvent =
    | { event: 'token'; data: { content: string } }
    | { event: 'tool'; data: { name: string; status: 'started' | 'finished' | 'error' } }
    | { event: 'sources'; data: { sources: AiChatSource[] } }
    | { event: 'agent'; data: { agentType: string; available: boolean } }
    | { event: 'done'; data: { messageId: string; conversationId: string } }
    | { event: 'error'; data: { message: string } };

@Injectable()
export class AiOrchestratorService {
    private readonly logger = new Logger(AiOrchestratorService.name);
    private readonly activeGenerations = new Map<string, AbortController>();
    private readonly maxToolCalls: number;
    private readonly maxHistoryMessages: number;

    constructor(
        private readonly conversationService: ConversationService,
        private readonly contextBuilder: ContextBuilderService,
        private readonly toolRegistry: AiToolRegistry,
        private readonly auditService: AiAuditService,
        private readonly providerFactory: AiProviderFactory,
        private readonly intentClassifier: IntentClassifierService,
        private readonly agentRegistry: AgentRegistry,
        private readonly usageService: AiUsageService,
        private readonly quotasService: AiQuotasService,
        private readonly configService: ConfigService,
    ) {
        this.maxToolCalls = Number(this.configService.get<string>('AI_CHAT_MAX_TOOL_CALLS') ?? 6);
        this.maxHistoryMessages = Number(
            this.configService.get<string>('AI_CHAT_MAX_HISTORY_MESSAGES') ?? 20,
        );
    }

    listConversations(organizationId: string, userId: string) {
        return this.conversationService.listConversations(organizationId, userId);
    }

    async createConversation(organizationId: string, userId: string, dto: CreateConversationDto) {
        const conversation = await this.conversationService.createConversation(
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
        return this.conversationService.getConversationWithMessages(conversationId, organizationId, userId);
    }

    async deleteConversation(conversationId: string, organizationId: string, userId: string) {
        this.cancelGeneration(conversationId, userId);
        await this.conversationService.deleteConversation(conversationId, organizationId, userId);
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
            const conversation = await this.conversationService.getConversationOrFail(
                conversationId,
                organizationId,
                userId,
            );

            await this.conversationService.addMessage({
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
                await this.conversationService.updateTitle(
                    conversation.id,
                    organizationId,
                    userId,
                    dto.content.slice(0, 80),
                );
            }

            const scope = this.contextBuilder.evaluate(dto.content);
            if (!scope.allowed) {
                await this.auditService.record({
                    organizationId,
                    actorId: userId,
                    action: 'scope_rejected',
                    entityType: 'ai_chat_conversation',
                    entityId: conversation.id,
                    metadata: { reason: scope.reason },
                });
                const assistant = await this.conversationService.addMessage({
                    conversationId: conversation.id,
                    role: 'assistant',
                    content: scope.message,
                    sources: [],
                    agentType: AiAgentType.CLOUD_ADVISOR,
                });
                yield { event: 'token', data: { content: scope.message } };
                yield { event: 'done', data: { messageId: assistant.id, conversationId: conversation.id } };
                return;
            }

            if (scope.reason === 'greeting') {
                const assistant = await this.conversationService.addMessage({
                    conversationId: conversation.id,
                    role: 'assistant',
                    content: scope.message,
                    sources: [],
                    agentType: AiAgentType.CLOUD_ADVISOR,
                });
                yield { event: 'token', data: { content: scope.message } };
                yield { event: 'done', data: { messageId: assistant.id, conversationId: conversation.id } };
                return;
            }

            const intent = this.intentClassifier.classify(dto.content);
            const tier = await this.quotasService.getTier(organizationId);
            const agent = this.agentRegistry.resolveForTier(tier, intent.agentType);
            yield {
                event: 'agent',
                data: {
                    agentType: agent.type,
                    available: agent.available,
                },
            };

            // Specialized agents not yet implemented fall back to Cloud Advisor tools.
            const effectiveAgent = agent.available
                ? agent
                : this.agentRegistry.resolveOrDefault(AiAgentType.CLOUD_ADVISOR);

            if (
                (!agent.available || agent.type !== intent.agentType) &&
                intent.agentType !== AiAgentType.CLOUD_ADVISOR
            ) {
                await this.auditService.record({
                    organizationId,
                    actorId: userId,
                    action: 'agent_fallback',
                    entityType: 'ai_chat_conversation',
                    entityId: conversation.id,
                    metadata: {
                        requested: intent.agentType,
                        tier,
                        fallback: effectiveAgent.type,
                    },
                });
            }

            await this.quotasService.assertWithinQuota(organizationId, effectiveAgent.type);

            const provider = this.providerFactory.getProvider();
            if (!provider.isConfigured()) {
                throw new ServiceUnavailableException(
                    ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_NOT_CONFIGURED,
                );
            }

            const enabledModules = await this.toolRegistry.resolveEnabledModules(organizationId);
            const tools = this.toolRegistry.listToolsForContext(enabledModules);

            const history = await this.conversationService.getRecentMessagesForContext(
                conversation.id,
                organizationId,
                userId,
                this.maxHistoryMessages,
            );

            const systemPrompt = [
                AI_CHAT_SYSTEM_PROMPT_V4,
                effectiveAgent.systemPromptAddon,
            ]
                .filter(Boolean)
                .join('\n\n');

            const messages: AiChatProviderMessage[] = [
                { role: 'system', content: systemPrompt },
                ...history
                    .filter((message) => message.role === 'user' || message.role === 'assistant')
                    .map((message) => ({
                        role: message.role as 'user' | 'assistant',
                        content: message.content,
                    })),
            ];

            if (dto.cloudAccountId) {
                messages.splice(1, 0, {
                    role: 'system',
                    content: `The user explicitly scoped this question to cloudAccountId ${dto.cloudAccountId}. Prefer that account when calling tools; still revalidate it in tools. If tools support omitting cloudAccountId, you may still use org-wide aggregation when comparing accounts.`,
                });
            }

            const collectedSources: AiChatSource[] = [];
            let toolCallsUsed = 0;
            let finalContent = '';
            let usage: {
                promptTokens?: number;
                completionTokens?: number;
                totalTokens?: number;
            } | null = null;

            while (true) {
                if (abortController.signal.aborted) {
                    throw new ServiceUnavailableException(
                        ErrorMessages.CLOUD_INTELLIGENCE.GENERATION_CANCELLED,
                    );
                }

                const completion = await provider.complete({
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
                            throw new ServiceUnavailableException(
                                ErrorMessages.CLOUD_INTELLIGENCE.TOOL_LIMIT_EXCEEDED,
                            );
                        }

                        yield { event: 'tool', data: { name: toolCall.name, status: 'started' } };

                        let parsedArgs: Record<string, unknown> = {};
                        try {
                            parsedArgs = JSON.parse(toolCall.arguments || '{}') as Record<string, unknown>;
                        } catch {
                            parsedArgs = {};
                        }

                        // Never trust model-supplied organization IDs.
                        delete parsedArgs.organizationId;
                        delete parsedArgs.tenantId;
                        delete parsedArgs.orgId;

                        try {
                            const result = await this.toolRegistry.executeTool(toolCall.name, parsedArgs, {
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
                                error instanceof Error
                                    ? error.message
                                    : ErrorMessages.GENERAL.UNEXPECTED_ERROR;
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
            const assistantMessage = await this.conversationService.addMessage({
                conversationId: conversation.id,
                role: 'assistant',
                content: finalContent,
                sources: uniqueSources,
                tokenUsage: usage,
                agentType: effectiveAgent.type,
            });

            await this.usageService.record({
                organizationId,
                userId,
                agentType: effectiveAgent.type,
                provider: provider.getProviderName(),
                model: provider.getModel(),
                inputTokens: usage?.promptTokens ?? 0,
                outputTokens: usage?.completionTokens ?? 0,
                conversationId: conversation.id,
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
                `cloud-intelligence.completed org=${organizationId} conversation=${conversation.id} agent=${effectiveAgent.type} latencyMs=${Date.now() - startedAt} tools=${toolCallsUsed} tokens=${usage?.totalTokens ?? 'n/a'}`,
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_UNAVAILABLE;
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
