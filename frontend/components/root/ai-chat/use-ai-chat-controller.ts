'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    cancelAiChatGeneration,
    createAiChatConversation,
    deleteAiChatConversation,
    getAiChatConversation,
    listAiChatConversations,
    streamAiChatMessageUrl,
    type AiChatConversation,
    type AiChatMessage,
    type AiChatSource,
} from '@/app/actions/ai-chat';
import { useLocale } from '@/components/providers/locale-provider';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import {
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
} from '@/lib/sidebar-context';
import type { AiChatToolStep } from './ai-chat-tool-trace';

function readActiveOrgId(): string | null {
    if (typeof window === 'undefined') {
        return null;
    }
    return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

async function parseSseStream(
    response: Response,
    handlers: {
        onToken: (content: string) => void;
        onSources: (sources: AiChatSource[]) => void;
        onDone: (messageId: string) => void;
        onError: (message: string) => void;
        onTool?: (name: string, status: string) => void;
    },
) {
    if (!response.body) {
        throw new Error('No stream body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n');
        buffer = chunks.pop() ?? '';

        for (const line of chunks) {
            if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
                continue;
            }
            if (!line.startsWith('data:')) {
                continue;
            }
            const raw = line.slice(5).trim();
            if (!raw) {
                continue;
            }
            try {
                const data = JSON.parse(raw) as Record<string, unknown>;
                if (eventName === 'token' && typeof data.content === 'string') {
                    handlers.onToken(data.content);
                } else if (eventName === 'sources' && Array.isArray(data.sources)) {
                    handlers.onSources(data.sources as AiChatSource[]);
                } else if (eventName === 'done' && typeof data.messageId === 'string') {
                    handlers.onDone(data.messageId);
                } else if (eventName === 'error' && typeof data.message === 'string') {
                    handlers.onError(data.message);
                } else if (eventName === 'tool' && typeof data.name === 'string') {
                    handlers.onTool?.(data.name, String(data.status ?? ''));
                }
            } catch {
                // ignore malformed chunk
            }
            eventName = 'message';
        }
    }
}

export function useAiChatController(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? true;
    const t = useTranslations('aiChat');
    const { locale } = useLocale();
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [conversations, setConversations] = useState<AiChatConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<AiChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [streamingContent, setStreamingContent] = useState<string | null>(null);
    const [toolSteps, setToolSteps] = useState<AiChatToolStep[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AiChatConversation | null>(null);
    const [deleting, setDeleting] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const activeConversationIdRef = useRef<string | null>(null);
    const streamingRafRef = useRef<number | null>(null);
    const pendingStreamContentRef = useRef<string | null>(null);

    const flushStreamingContent = useCallback(() => {
        streamingRafRef.current = null;
        if (pendingStreamContentRef.current !== null) {
            setStreamingContent(pendingStreamContentRef.current);
        }
    }, []);

    const scheduleStreamingContent = useCallback(
        (content: string) => {
            pendingStreamContentRef.current = content;
            if (streamingRafRef.current != null) {
                return;
            }
            streamingRafRef.current = window.requestAnimationFrame(flushStreamingContent);
        },
        [flushStreamingContent],
    );

    const clearStreamingSchedule = useCallback(() => {
        if (streamingRafRef.current != null) {
            window.cancelAnimationFrame(streamingRafRef.current);
            streamingRafRef.current = null;
        }
        pendingStreamContentRef.current = null;
    }, []);

    useEffect(() => {
        activeConversationIdRef.current = activeConversationId;
    }, [activeConversationId]);

    useEffect(() => {
        return () => {
            clearStreamingSchedule();
        };
    }, [clearStreamingSchedule]);

    useEffect(() => {
        const syncContext = () => {
            setOrganizationId(readActiveOrgId());
        };
        syncContext();
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, syncContext);
        window.addEventListener('storage', syncContext);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, syncContext);
            window.removeEventListener('storage', syncContext);
        };
    }, []);

    const selectConversation = useCallback(
        async (orgId: string, conversationId: string) => {
            activeConversationIdRef.current = conversationId;
            setActiveConversationId(conversationId);
            const response = await getAiChatConversation(orgId, conversationId);
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body, locale));
                return;
            }
            const detail = body as { messages?: AiChatMessage[] };
            setMessages(detail.messages ?? []);
            setStreamingContent(null);
            setToolSteps([]);
        },
        [locale],
    );

    const loadConversations = useCallback(
        async (orgId: string, loadOptions?: { silent?: boolean; autoSelect?: boolean }) => {
            const silent = loadOptions?.silent ?? false;
            const autoSelect = loadOptions?.autoSelect ?? true;
            if (!silent) {
                setLoading(true);
            }
            try {
                const response = await listAiChatConversations(orgId);
                const body = await response.json();
                if (!response.ok) {
                    toast.error(extractErrorMessage(body, locale));
                    return;
                }
                const items = Array.isArray(body)
                    ? (body as AiChatConversation[])
                    : ((body.items as AiChatConversation[]) ?? []);
                setConversations(items);
                if (autoSelect && !activeConversationIdRef.current && items[0]) {
                    await selectConversation(orgId, items[0].id);
                }
            } catch {
                toast.error(t.loadError);
            } finally {
                if (!silent) {
                    setLoading(false);
                }
            }
        },
        [locale, selectConversation, t.loadError],
    );

    useEffect(() => {
        if (!enabled || !organizationId) {
            return;
        }
        void loadConversations(organizationId);
    }, [enabled, organizationId, loadConversations]);

    const handleNewConversation = useCallback(async () => {
        if (!organizationId) {
            return;
        }
        const response = await createAiChatConversation(organizationId);
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body, locale));
            return;
        }
        const created = body as AiChatConversation;
        activeConversationIdRef.current = created.id;
        setConversations((prev) => [created, ...prev]);
        setActiveConversationId(created.id);
        setMessages([]);
        setStreamingContent(null);
        setToolSteps([]);
    }, [locale, organizationId]);

    const requestDeleteConversation = useCallback(
        (conversationId: string) => {
            const target = conversations.find((item) => item.id === conversationId) ?? null;
            if (!target) {
                return;
            }
            setDeleteTarget(target);
        },
        [conversations],
    );

    const confirmDeleteConversation = useCallback(async (): Promise<boolean> => {
        if (!organizationId || !deleteTarget) {
            return true;
        }

        const conversationId = deleteTarget.id;
        setDeleting(true);
        try {
            const response = await deleteAiChatConversation(organizationId, conversationId);
            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => ({}));
                toast.error(extractErrorMessage(body, locale));
                return false;
            }
            setConversations((prev) => prev.filter((item) => item.id !== conversationId));
            if (activeConversationIdRef.current === conversationId) {
                activeConversationIdRef.current = null;
                setActiveConversationId(null);
                setMessages([]);
            }
            setDeleteTarget(null);
            return true;
        } finally {
            setDeleting(false);
        }
    }, [deleteTarget, locale, organizationId]);

    const handleSendWithContent = useCallback(
        async (rawContent: string) => {
            if (!organizationId || !rawContent.trim() || isStreaming) {
                return;
            }

            let conversationId = activeConversationId;
            if (!conversationId) {
                const response = await createAiChatConversation(
                    organizationId,
                    rawContent.trim().slice(0, 80),
                );
                const body = await response.json();
                if (!response.ok) {
                    toast.error(extractErrorMessage(body, locale));
                    return;
                }
                const created = body as AiChatConversation;
                conversationId = created.id;
                activeConversationIdRef.current = created.id;
                setConversations((prev) => [created, ...prev]);
                setActiveConversationId(created.id);
            }

            const content = rawContent.trim();
            setDraft('');
            const optimisticUser: AiChatMessage = {
                id: `local-user-${Date.now()}`,
                role: 'user',
                content,
                createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, optimisticUser]);
            setIsStreaming(true);
            setStreamingContent('');
            setToolSteps([]);

            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const response = await fetch(streamAiChatMessageUrl(organizationId, conversationId), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content }),
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    toast.error(extractErrorMessage(body, locale));
                    setStreamingContent(null);
                    return;
                }

                let finalContent = '';
                let finalSources: AiChatSource[] = [];

                await parseSseStream(response, {
                    onToken: (tokenContent) => {
                        finalContent = tokenContent;
                        scheduleStreamingContent(tokenContent);
                    },
                    onSources: (sources) => {
                        finalSources = sources;
                    },
                    onTool: (name, status) => {
                        const normalized = (
                            status === 'finished' || status === 'error' ? status : 'started'
                        ) as AiChatToolStep['status'];
                        setToolSteps((prev) => {
                            const next = [...prev];
                            const existingIndex = next.findIndex(
                                (step) => step.name === name && step.status === 'started',
                            );
                            if (existingIndex >= 0 && normalized !== 'started') {
                                next[existingIndex] = { name, status: normalized };
                                return next;
                            }
                            return [...next, { name, status: normalized }];
                        });
                    },
                    onDone: (messageId) => {
                        clearStreamingSchedule();
                        setMessages((prev) => [
                            ...prev,
                            {
                                id: messageId,
                                role: 'assistant',
                                content: finalContent,
                                sources: finalSources,
                                createdAt: new Date().toISOString(),
                            },
                        ]);
                        setStreamingContent(null);
                        setToolSteps([]);
                        // Bump conversation in local list (title/updatedAt) without refetch.
                        setConversations((prev) => {
                            const idx = prev.findIndex((item) => item.id === conversationId);
                            if (idx < 0) return prev;
                            const current = prev[idx];
                            const nextTitle =
                                current.title?.trim() ||
                                content.slice(0, 80) ||
                                current.title;
                            const updated = {
                                ...current,
                                title: nextTitle,
                                updatedAt: new Date().toISOString(),
                            };
                            return [updated, ...prev.filter((_, i) => i !== idx)];
                        });
                    },
                    onError: (message) => {
                        clearStreamingSchedule();
                        toast.error(extractErrorMessage({ message }, locale));
                        setStreamingContent(null);
                        setToolSteps([]);
                    },
                });
            } catch (error) {
                if ((error as Error).name !== 'AbortError') {
                    toast.error(t.streamError);
                }
                clearStreamingSchedule();
                setStreamingContent(null);
                setToolSteps([]);
            } finally {
                setIsStreaming(false);
                abortRef.current = null;
            }
        },
        [
            activeConversationId,
            clearStreamingSchedule,
            isStreaming,
            locale,
            organizationId,
            scheduleStreamingContent,
            t.streamError,
        ],
    );

    const handleSuggestion = useCallback(
        (prompt: string) => {
            setDraft(prompt);
            void handleSendWithContent(prompt);
        },
        [handleSendWithContent],
    );

    const handleSend = useCallback(async () => {
        await handleSendWithContent(draft);
    }, [draft, handleSendWithContent]);

    const handleStop = useCallback(async () => {
        abortRef.current?.abort();
        clearStreamingSchedule();
        if (organizationId && activeConversationId) {
            await cancelAiChatGeneration(organizationId, activeConversationId).catch(() => undefined);
        }
        setIsStreaming(false);
        setStreamingContent(null);
        setToolSteps([]);
    }, [activeConversationId, clearStreamingSchedule, organizationId]);

    return {
        t,
        locale,
        organizationId,
        conversations,
        activeConversationId,
        messages,
        draft,
        setDraft,
        streamingContent,
        toolSteps,
        isStreaming,
        loading,
        deleteTarget,
        setDeleteTarget,
        deleting,
        loadConversations,
        selectConversation,
        handleNewConversation,
        requestDeleteConversation,
        confirmDeleteConversation,
        handleSuggestion,
        handleSend,
        handleStop,
    };
}
