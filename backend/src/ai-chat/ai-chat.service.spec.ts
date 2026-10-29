import { ServiceUnavailableException } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { ErrorMessages } from '../common/messages/error-messages';

describe('AiChatService', () => {
    const historyService = {
        getConversationOrFail: jest.fn(),
        addMessage: jest.fn(),
        updateTitle: jest.fn(),
        getRecentMessagesForContext: jest.fn(),
        listConversations: jest.fn(),
        createConversation: jest.fn(),
        getConversationWithMessages: jest.fn(),
        deleteConversation: jest.fn(),
    };
    const scopeService = {
        evaluate: jest.fn(),
    };
    const toolService = {
        resolveEnabledModules: jest.fn(),
        listToolsForContext: jest.fn(),
        executeTool: jest.fn(),
    };
    const auditService = {
        record: jest.fn(),
    };
    const openAiProvider = {
        isConfigured: jest.fn(),
        complete: jest.fn(),
    };
    const configService = {
        get: jest.fn((key: string) => {
            if (key === 'AI_CHAT_MAX_TOOL_CALLS') return '2';
            if (key === 'AI_CHAT_MAX_HISTORY_MESSAGES') return '20';
            return undefined;
        }),
    };

    const service = new AiChatService(
        historyService as never,
        scopeService as never,
        toolService as never,
        auditService as never,
        openAiProvider as never,
        configService as never,
    );

    beforeEach(() => {
        jest.clearAllMocks();
        historyService.getConversationOrFail.mockResolvedValue({
            id: 'conv-1',
            title: 'Nova conversa',
        });
        historyService.addMessage.mockImplementation(async (input) => ({
            id: `msg-${input.role}`,
            ...input,
        }));
        historyService.getRecentMessagesForContext.mockResolvedValue([]);
        toolService.resolveEnabledModules.mockResolvedValue(new Set(['finops']));
        toolService.listToolsForContext.mockReturnValue([]);
        auditService.record.mockResolvedValue(undefined);
    });

    async function collect(events: AsyncGenerator<unknown>) {
        const items: unknown[] = [];
        for await (const event of events) {
            items.push(event);
        }
        return items;
    }

    it('rejects out-of-scope questions without calling the provider or tools', async () => {
        scopeService.evaluate.mockReturnValue({
            allowed: false,
            reason: 'off_topic',
            message: ErrorMessages.AI_CHAT.OUT_OF_SCOPE,
        });

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'me conte uma piada' }),
        );

        expect(openAiProvider.complete).not.toHaveBeenCalled();
        expect(toolService.executeTool).not.toHaveBeenCalled();
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ event: 'token' }),
                expect.objectContaining({ event: 'done' }),
            ]),
        );
        expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'scope_rejected' }));
    });

    it('answers greetings without tools, provider, or page source links', async () => {
        scopeService.evaluate.mockReturnValue({
            allowed: true,
            reason: 'greeting',
            message: 'Olá! Em que posso ajudar?',
        });

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Olá' }),
        );

        expect(openAiProvider.complete).not.toHaveBeenCalled();
        expect(toolService.executeTool).not.toHaveBeenCalled();
        expect(toolService.resolveEnabledModules).not.toHaveBeenCalled();
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
        expect(historyService.addMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                role: 'assistant',
                content: 'Olá! Em que posso ajudar?',
                sources: [],
            }),
        );
    });

    it('returns controlled error when provider is not configured', async () => {
        scopeService.evaluate.mockReturnValue({ allowed: true, reason: 'in_scope' });
        openAiProvider.isConfigured.mockReturnValue(false);

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Qual o custo do mês?' }),
        );

        expect(events.some((event) => (event as { event: string }).event === 'error')).toBe(true);
        expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'provider_error' }));
    });

    it('enforces max tool calls', async () => {
        scopeService.evaluate.mockReturnValue({ allowed: true, reason: 'in_scope' });
        openAiProvider.isConfigured.mockReturnValue(true);
        toolService.listToolsForContext.mockReturnValue([
            { name: 'get_cost_summary', description: 'x', parameters: { type: 'object', properties: {} } },
        ]);
        openAiProvider.complete
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
        toolService.executeTool.mockResolvedValue({ content: '<UNTRUSTED_DATA>{}</UNTRUSTED_DATA>', sources: [] });

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Qual o custo?' }),
        );

        expect(events.some((event) => (event as { event: string }).event === 'error')).toBe(true);
        expect(toolService.executeTool).toHaveBeenCalledTimes(2);
    });

    it('passes backend organizationId to tools even if model args try to escalate', async () => {
        scopeService.evaluate.mockReturnValue({ allowed: true, reason: 'in_scope' });
        openAiProvider.isConfigured.mockReturnValue(true);
        toolService.listToolsForContext.mockReturnValue([
            { name: 'get_cost_summary', description: 'x', parameters: { type: 'object', properties: {} } },
        ]);
        openAiProvider.complete
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
                usage: { totalTokens: 12 },
            });
        toolService.executeTool.mockResolvedValue({
            content: '<UNTRUSTED_DATA>{"ok":true}</UNTRUSTED_DATA>',
            sources: [{ module: 'finops', label: 'FinOps' }],
        });

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Qual o custo?' }),
        );

        expect(toolService.executeTool).toHaveBeenCalledWith(
            'get_cost_summary',
            expect.objectContaining({ organizationId: 'org-evil', period: 'last30days' }),
            expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
        );
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ event: 'sources' }),
                expect.objectContaining({ event: 'done' }),
            ]),
        );
    });

    it('cancels active generation', () => {
        expect(service.cancelGeneration('missing', 'user-1')).toBe(false);
    });

    it('surfaces provider timeout as controlled error event', async () => {
        scopeService.evaluate.mockReturnValue({ allowed: true, reason: 'in_scope' });
        openAiProvider.isConfigured.mockReturnValue(true);
        openAiProvider.complete.mockRejectedValue(
            new ServiceUnavailableException(ErrorMessages.AI_CHAT.PROVIDER_TIMEOUT),
        );

        const events = await collect(
            service.streamMessage('conv-1', 'org-1', 'user-1', { content: 'Qual o custo?' }),
        );

        const errorEvent = events.find((event) => (event as { event: string }).event === 'error') as {
            data: { message: string };
        };
        expect(errorEvent.data.message).toContain(ErrorMessages.AI_CHAT.PROVIDER_TIMEOUT);
    });
});
