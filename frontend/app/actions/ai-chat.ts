export type AiChatSource = {
    module: string;
    label: string;
    detail?: string;
    href?: string;
    cloudAccountId?: string;
};

export type AiChatConversation = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
};

export type AiChatMessage = {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    sources?: AiChatSource[] | null;
    createdAt: string;
};

export type AiChatConversationDetail = AiChatConversation & {
    messages: AiChatMessage[];
};

function withOrg(path: string, organizationId: string) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}organizationId=${encodeURIComponent(organizationId)}`;
}

export async function listAiChatConversations(organizationId: string) {
    return fetch(withOrg('/api/ai-chat/conversations', organizationId), { cache: 'no-store' });
}

export async function createAiChatConversation(organizationId: string, title?: string) {
    return fetch(withOrg('/api/ai-chat/conversations', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(title ? { title } : {}),
    });
}

export async function getAiChatConversation(organizationId: string, conversationId: string) {
    return fetch(withOrg(`/api/ai-chat/conversations/${encodeURIComponent(conversationId)}`, organizationId), {
        cache: 'no-store',
    });
}

export async function deleteAiChatConversation(organizationId: string, conversationId: string) {
    return fetch(withOrg(`/api/ai-chat/conversations/${encodeURIComponent(conversationId)}`, organizationId), {
        method: 'DELETE',
    });
}

export async function cancelAiChatGeneration(organizationId: string, conversationId: string) {
    return fetch(withOrg(`/api/ai-chat/conversations/${encodeURIComponent(conversationId)}/cancel`, organizationId), {
        method: 'POST',
    });
}

export function streamAiChatMessageUrl(organizationId: string, conversationId: string) {
    return withOrg(`/api/ai-chat/conversations/${encodeURIComponent(conversationId)}/messages`, organizationId);
}
