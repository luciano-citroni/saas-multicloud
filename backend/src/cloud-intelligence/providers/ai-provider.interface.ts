export type AiChatToolDefinition = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
};

export type AiChatProviderMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls?: AiChatToolCall[] }
    | { role: 'tool'; tool_call_id: string; content: string };

export type AiChatToolCall = {
    id: string;
    name: string;
    arguments: string;
};

export type AiChatCompletionRequest = {
    messages: AiChatProviderMessage[];
    tools?: AiChatToolDefinition[];
    maxTokens?: number;
    signal?: AbortSignal;
};

export type AiChatCompletionResult = {
    content: string | null;
    toolCalls: AiChatToolCall[];
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
};

export type AiChatStreamHandlers = {
    onContentDelta?: (delta: string, fullContent: string) => void | Promise<void>;
};

export interface AiProvider {
    complete(request: AiChatCompletionRequest): Promise<AiChatCompletionResult>;
    /**
     * Optional streaming completion. Providers without streaming fall back to complete().
     * onContentDelta is only called for text deltas (not tool-call rounds).
     */
    streamComplete?(
        request: AiChatCompletionRequest,
        handlers?: AiChatStreamHandlers,
    ): Promise<AiChatCompletionResult>;
}
