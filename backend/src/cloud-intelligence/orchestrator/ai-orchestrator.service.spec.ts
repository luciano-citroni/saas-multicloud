import { ServiceUnavailableException } from '@nestjs/common';
import { ErrorMessages } from '../../common/messages/error-messages';
import { AiAgentType } from '../agents/agent.interface';
import { AiOrchestratorService } from './ai-orchestrator.service';

describe('AiOrchestratorService', () => {
    const conversationService = {
        getConversationOrFail: jest.fn(),
        addMessage: jest.fn(),
        updateTitle: jest.fn(),
        getRecentMessagesForContext: jest.fn(),
        listConversations: jest.fn(),
        createConversation: jest.fn(),
        getConversationWithMessages: jest.fn(),
        deleteConversation: jest.fn(),
    };
    const contextBuilder = {
        evaluate: jest.fn(),
    };
    const toolRegistry = {
        resolveEnabledModules: jest.fn(),
        listToolsForContext: jest.fn(),
        executeTool: jest.fn(),
    };
    const auditService = {
        record: jest.fn(),
    };
    const provider = {
        isConfigured: jest.fn(),
        complete: jest.fn(),
        getModel: jest.fn(() => 'gpt-test'),
        getProviderName: jest.fn(() => 'openai'),
    };
    const providerFactory = {
        getProvider: jest.fn(() => provider),
    };
    const intentClassifier = {
        classify: jest.fn(() => ({
            agentType: AiAgentType.CLOUD_ADVISOR,
            confidence: 0.9,
            reason: 'default_cloud_advisor',
        })),
    };
    const cloudAdvisorDef = {
        type: AiAgentType.CLOUD_ADVISOR,
        displayName: 'AI Cloud Advisor',
        description: 'x',
        available: true,
        systemPromptAddon: 'addon',
    };
    const agentRegistry = {
        resolveOrDefault: jest.fn(() => cloudAdvisorDef),
        resolveForTier: jest.fn(() => cloudAdvisorDef),
        listForTier: jest.fn(() => [cloudAdvisorDef]),
    };
    const usageService = {
        record: jest.fn(),
    };
    const quotasService = {
        assertWithinQuota: jest.fn(),
        getTier: jest.fn().mockResolvedValue('enterprise'),
    };
    const configService = {
        get: jest.fn((key: string) => {
            if (key === 'AI_CHAT_MAX_TOOL_CALLS') return '2';
            if (key === 'AI_CHAT_MAX_HISTORY_MESSAGES') return '20';
            return undefined;
        }),
    };

    const service = new AiOrchestratorService(
        conversationService as never,
        contextBuilder as never,
        toolRegistry as never,
        auditService as never,
        providerFactory as never,
        intentClassifier as never,
        agentRegistry as never,
        usageService as never,
        quotasService as never,
        configService as never,
    );

    beforeEach(() => {
        jest.clearAllMocks();
        conversationService.getConversationOrFail.mockResolvedValue({
            id: 'conv-1',
            title: 'Nova conversa',
        });
        conversationService.addMessage.mockImplementation(async (input) => ({
            id: `msg-${input.role}`,
            ...input,
        }));
        conversationService.getRecentMessagesForContext.mockResolvedValue([]);
        toolRegistry.resolveEnabledModules.mockResolvedValue(new Set(['finops']));
        toolRegistry.listToolsForContext.mockReturnValue([]);
        auditService.record.mockResolvedValue(undefined);
        usageService.record.mockResolvedValue({});
        quotasService.assertWithinQuota.mockResolvedValue(undefined);
        quotasService.getTier.mockResolvedValue('enterprise');
        intentClassifier.classify.mockReturnValue({
            agentType: AiAgentType.CLOUD_ADVISOR,
            confidence: 0.9,
            reason: 'default_cloud_advisor',
        });
        agentRegistry.resolveOrDefault.mockReturnValue(cloudAdvisorDef);
        agentRegistry.resolveForTier.mockReturnValue(cloudAdvisorDef);
        providerFactory.getProvider.mockReturnValue(provider);
    });

    async function collect(events: AsyncGenerator<unknown>) {
        const items: unknown[] = [];
        for await (const event of events) {
            items.push(event);
        }
        return items;
    }

    it('rejects out-of-scope questions without calling the provider or tools', async () => {
        contextBuilder.evaluate.mockReturnValue({
            allowed: false,
            reason: 'off_topic',
            message: ErrorMessages.CLOUD_INTELLIGENCE.OUT_OF_SCOPE,
        });

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'me conte uma piada' }),
        );

        expect(provider.complete).not.toHaveBeenCalled();
        expect(toolRegistry.executeTool).not.toHaveBeenCalled();
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ event: 'token' }),
                expect.objectContaining({ event: 'done' }),
            ]),
        );
        expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'scope_rejected' }));
    });

    it('answers greetings without tools, provider, or page source links', async () => {
        contextBuilder.evaluate.mockReturnValue({
            allowed: true,
            reason: 'greeting',
            message: 'Olá! Em que posso ajudar?',
        });

        const events = await collect(service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Olá' }));

        expect(provider.complete).not.toHaveBeenCalled();
        expect(toolRegistry.executeTool).not.toHaveBeenCalled();
        expect(toolRegistry.resolveEnabledModules).not.toHaveBeenCalled();
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    event: 'token',
                    data: { content: 'Olá! Em que posso ajudar?' },
                }),
                expect.objectContaining({ event: 'done' }),
            ]),
        );
        expect(events.some((event) => (event as { event?: string }).event === 'sources')).toBe(false);
    });

    it('returns controlled error when provider is not configured', async () => {
        contextBuilder.evaluate.mockReturnValue({ allowed: true, reason: 'in_scope' });
        provider.isConfigured.mockReturnValue(false);

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Qual o custo do mês?' }),
        );

        expect(events.some((event) => (event as { event: string }).event === 'error')).toBe(true);
        expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'provider_error' }));
    });

    it('enforces max tool calls', async () => {
        contextBuilder.evaluate.mockReturnValue({ allowed: true, reason: 'in_scope' });
        provider.isConfigured.mockReturnValue(true);
        toolRegistry.listToolsForContext.mockReturnValue([
            { name: 'get_cost_summary', description: 'x', parameters: { type: 'object', properties: {} } },
        ]);
        provider.complete
            .mockResolvedValueOnce({
                content: null,
                toolCalls: [{ id: '1', name: 'get_cost_summary', arguments: '{}' }],
            })
            .mockResolvedValueOnce({
                content: null,
                toolCalls: [{ id: '2', name: 'get_cost_summary', arguments: '{}' }],
            })
            .mockResolvedValueOnce({
                content: null,
                toolCalls: [{ id: '3', name: 'get_cost_summary', arguments: '{}' }],
            });
        toolRegistry.executeTool.mockResolvedValue({
            content: '<UNTRUSTED_DATA>{}</UNTRUSTED_DATA>',
            sources: [],
        });

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Qual o custo?' }),
        );

        expect(events.some((event) => (event as { event: string }).event === 'error')).toBe(true);
        expect(toolRegistry.executeTool).toHaveBeenCalledTimes(2);
    });

    it('strips model-supplied organizationId before executing tools and records usage', async () => {
        contextBuilder.evaluate.mockReturnValue({ allowed: true, reason: 'in_scope' });
        provider.isConfigured.mockReturnValue(true);
        toolRegistry.listToolsForContext.mockReturnValue([
            { name: 'get_cost_summary', description: 'x', parameters: { type: 'object', properties: {} } },
        ]);
        provider.complete
            .mockResolvedValueOnce({
                content: null,
                toolCalls: [
                    {
                        id: '1',
                        name: 'get_cost_summary',
                        arguments: JSON.stringify({ organizationId: 'org-evil', period: 'last30days' }),
                    },
                ],
            })
            .mockResolvedValueOnce({
                content: 'Total foi 10 USD.',
                toolCalls: [],
                usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            });
        toolRegistry.executeTool.mockResolvedValue({
            content: '<UNTRUSTED_DATA>{"ok":true}</UNTRUSTED_DATA>',
            sources: [{ module: 'finops', label: 'FinOps' }],
        });

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Qual o custo?' }),
        );

        expect(toolRegistry.executeTool).toHaveBeenCalledWith(
            'get_cost_summary',
            expect.objectContaining({ period: 'last30days' }),
            expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
        );
        expect(toolRegistry.executeTool.mock.calls[0][1]).not.toHaveProperty('organizationId');
        expect(usageService.record).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'org-1',
                userId: 'user-1',
                inputTokens: 10,
                outputTokens: 5,
            }),
        );
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ event: 'sources' }),
                expect.objectContaining({ event: 'done' }),
            ]),
        );
    });

    it('checks quotas before calling the provider', async () => {
        contextBuilder.evaluate.mockReturnValue({ allowed: true, reason: 'in_scope' });
        quotasService.assertWithinQuota.mockRejectedValue(
            new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.QUOTA_EXCEEDED),
        );

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Qual o custo?' }),
        );

        expect(provider.complete).not.toHaveBeenCalled();
        expect(events.some((event) => (event as { event: string }).event === 'error')).toBe(true);
    });

    it('cancels active generation', () => {
        expect(service.cancelGeneration('missing', 'user-1')).toBe(false);
    });

    it('surfaces provider timeout as controlled error event', async () => {
        contextBuilder.evaluate.mockReturnValue({ allowed: true, reason: 'in_scope' });
        provider.isConfigured.mockReturnValue(true);
        provider.complete.mockRejectedValue(
            new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_TIMEOUT),
        );

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Qual o custo?' }),
        );

        const errorEvent = events.find((event) => (event as { event: string }).event === 'error') as {
            data: { message: string };
        };
        expect(errorEvent.data.message).toContain(ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_TIMEOUT);
    });
});
