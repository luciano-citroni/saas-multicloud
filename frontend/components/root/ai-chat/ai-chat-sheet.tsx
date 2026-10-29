'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { History, Loader2, MessageSquare, Plus } from 'lucide-react';
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from '@/lib/i18n';
import { extractErrorMessage } from '@/lib/error-messages';
import { useLocale } from '@/components/providers/locale-provider';
import {
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    AI_CHAT_OPEN_EVENT,
} from '@/lib/sidebar-context';
import { AiChatComposer } from './ai-chat-composer';
import { AiChatConversationList } from './ai-chat-conversation-list';
import { AiChatMessageList } from './ai-chat-message-list';
import type { AiChatToolStep } from './ai-chat-tool-trace';
import { AiChatTriggerButton } from './ai-chat-trigger-button';

type ChatTab = 'chat' | 'history';

function restoreBodyPointerEvents() {
    if (typeof document === 'undefined') {
        return;
    }
    document.body.style.pointerEvents = '';
}

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

export function AiChatSheet() {
    const t = useTranslations('aiChat');
    const tc = useTranslations('common');
    const { locale } = useLocale();
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<ChatTab>('chat');
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
    const prefersReducedMotion = useReducedMotion();

    useEffect(() => {
        activeConversationIdRef.current = activeConversationId;
    }, [activeConversationId]);

    useEffect(() => {
        const syncContext = () => {
            setOrganizationId(readActiveOrgId());
        };
        const openChat = () => {
            setTab('chat');
            setOpen(true);
        };
        syncContext();
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, syncContext);
        window.addEventListener('storage', syncContext);
        window.addEventListener(AI_CHAT_OPEN_EVENT, openChat);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, syncContext);
            window.removeEventListener('storage', syncContext);
            window.removeEventListener(AI_CHAT_OPEN_EVENT, openChat);
        };
    }, []);

    useEffect(() => {
        if (!open || !organizationId) {
            return;
        }
        void loadConversations(organizationId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, organizationId]);

    useEffect(() => {
        if (!deleteTarget) {
            const timer = window.setTimeout(restoreBodyPointerEvents, 0);
            return () => window.clearTimeout(timer);
        }
    }, [deleteTarget]);

    async function loadConversations(orgId: string, options?: { silent?: boolean; autoSelect?: boolean }) {
        const silent = options?.silent ?? false;
        const autoSelect = options?.autoSelect ?? true;
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
            const items = Array.isArray(body) ? (body as AiChatConversation[]) : (body.items as AiChatConversation[]) ?? [];
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
    }

    async function selectConversation(orgId: string, conversationId: string) {
        activeConversationIdRef.current = conversationId;
        setActiveConversationId(conversationId);
        setTab('chat');
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
    }

    function handleSuggestion(prompt: string) {
        setDraft(prompt);
        void handleSendWithContent(prompt);
    }

    async function handleNewConversation() {
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
        setTab('chat');
    }

    function requestDeleteConversation(conversationId: string) {
        const target = conversations.find((item) => item.id === conversationId) ?? null;
        if (!target) {
            return;
        }
        setDeleteTarget(target);
    }

    async function confirmDeleteConversation() {
        if (!organizationId || !deleteTarget) {
            return;
        }

        const conversationId = deleteTarget.id;
        setDeleting(true);
        try {
            const response = await deleteAiChatConversation(organizationId, conversationId);
            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => ({}));
                toast.error(extractErrorMessage(body, locale));
                return;
            }
            setConversations((prev) => prev.filter((item) => item.id !== conversationId));
            if (activeConversationIdRef.current === conversationId) {
                activeConversationIdRef.current = null;
                setActiveConversationId(null);
                setMessages([]);
            }
            setDeleteTarget(null);
            window.setTimeout(restoreBodyPointerEvents, 0);
        } finally {
            setDeleting(false);
        }
    }

    async function handleSend() {
        await handleSendWithContent(draft);
    }

    async function handleSendWithContent(rawContent: string) {
        if (!organizationId || !rawContent.trim() || isStreaming) {
            return;
        }

        let conversationId = activeConversationId;
        if (!conversationId) {
            const response = await createAiChatConversation(organizationId, rawContent.trim().slice(0, 80));
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
                    setStreamingContent(tokenContent);
                },
                onSources: (sources) => {
                    finalSources = sources;
                },
                onTool: (name, status) => {
                    const normalized = (status === 'finished' || status === 'error' ? status : 'started') as AiChatToolStep['status'];
                    setToolSteps((prev) => {
                        const next = [...prev];
                        const existingIndex = next.findIndex((step) => step.name === name && step.status === 'started');
                        if (existingIndex >= 0 && normalized !== 'started') {
                            next[existingIndex] = { name, status: normalized };
                            return next;
                        }
                        if (normalized === 'started') {
                            return [...next, { name, status: normalized }];
                        }
                        return [...next, { name, status: normalized }];
                    });
                },
                onDone: (messageId) => {
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
                },
                onError: (message) => {
                    toast.error(extractErrorMessage({ message }, locale));
                    setStreamingContent(null);
                    setToolSteps([]);
                },
            });
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                toast.error(t.streamError);
            }
            setStreamingContent(null);
            setToolSteps([]);
        } finally {
            setIsStreaming(false);
            abortRef.current = null;
            if (organizationId) {
                void loadConversations(organizationId, { silent: true, autoSelect: false });
            }
        }
    }

    async function handleStop() {
        abortRef.current?.abort();
        if (organizationId && activeConversationId) {
            await cancelAiChatGeneration(organizationId, activeConversationId).catch(() => undefined);
        }
        setIsStreaming(false);
        setStreamingContent(null);
        setToolSteps([]);
    }

    return (
        <>
            <AnimatePresence>
                {!open ? (
                    <motion.div
                        key="ai-chat-fab"
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 8 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <AiChatTriggerButton variant="fab" />
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <Sheet
                open={open}
                onOpenChange={(nextOpen) => {
                    setOpen(nextOpen);
                    if (!nextOpen) {
                        setDeleteTarget(null);
                        restoreBodyPointerEvents();
                    }
                }}
            >
                <SheetContent
                    side="right"
                    className="data-[side=right]:data-open:slide-in-from-right-full data-[side=right]:data-closed:slide-out-to-right-full flex h-full w-full flex-col gap-0 overflow-hidden p-0 duration-300 ease-out sm:max-w-lg md:max-w-2xl"
                >
                    <motion.div
                        className="flex h-full min-h-0 flex-1 flex-col"
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.04 }}
                    >
                        <SheetHeader className="border-border bg-background shrink-0 border-b px-4 py-3 pr-14 text-left">
                            <SheetTitle className="text-base">{t.title}</SheetTitle>
                            <SheetDescription className="text-xs leading-relaxed">{t.description}</SheetDescription>
                        </SheetHeader>

                        <Tabs
                            value={tab}
                            onValueChange={(value) => setTab(value as ChatTab)}
                            className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
                        >
                            <div className="border-border bg-background flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
                                <TabsList className="grid h-9 min-w-0 flex-1 grid-cols-2">
                                    <TabsTrigger value="chat" className="gap-1.5 px-3">
                                        <MessageSquare className="size-3.5" />
                                        {t.tabChat}
                                    </TabsTrigger>
                                    <TabsTrigger value="history" className="gap-1.5 px-3">
                                        <History className="size-3.5" />
                                        {t.tabHistory}
                                        {conversations.length > 0 ? (
                                            <Badge
                                                variant="secondary"
                                                className="h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums"
                                            >
                                                {conversations.length}
                                            </Badge>
                                        ) : null}
                                    </TabsTrigger>
                                </TabsList>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="lg"
                                    className="h-9 shrink-0 gap-1.5 rounded-lg px-3"
                                    onClick={() => void handleNewConversation()}
                                    disabled={!organizationId}
                                >
                                    <Plus className="size-3.5" />
                                    {t.newConversation}
                                </Button>
                            </div>

                            {tab === 'chat' ? (
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                                    <AiChatMessageList
                                        messages={messages}
                                        streamingContent={streamingContent}
                                        toolSteps={toolSteps}
                                        isStreaming={isStreaming}
                                        sourcesLabel={t.sources}
                                        openSourceLabel={t.openSource}
                                        toolsLabel={t.tools}
                                        researchingLabel={t.researching}
                                        copyLabel={t.copy}
                                        copiedLabel={t.copied}
                                        emptyTitle={t.emptyTitle}
                                        emptyDescription={t.emptyDescription}
                                        suggestionsTitle={t.suggestionsTitle}
                                        locale={locale}
                                        onSuggestion={handleSuggestion}
                                        suggestionsDisabled={!organizationId || isStreaming}
                                        onSourceNavigate={() => {
                                            setOpen(false);
                                            restoreBodyPointerEvents();
                                        }}
                                    />

                                    <AiChatComposer
                                        value={draft}
                                        onChange={setDraft}
                                        onSubmit={() => void handleSend()}
                                        onStop={() => void handleStop()}
                                        disabled={!organizationId}
                                        isStreaming={isStreaming}
                                        placeholder={t.placeholder}
                                        sendLabel={t.send}
                                        stopLabel={t.stop}
                                        noOrgHint={!organizationId ? t.selectOrganization : null}
                                    />
                                </div>
                            ) : (
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                                    <AiChatConversationList
                                        conversations={conversations}
                                        activeId={activeConversationId}
                                        loading={loading}
                                        locale={locale}
                                        onSelect={(id) => organizationId && void selectConversation(organizationId, id)}
                                        onDelete={requestDeleteConversation}
                                        labels={{
                                            empty: t.noConversations,
                                            delete: t.deleteConversation,
                                            today: t.historyToday,
                                            yesterday: t.historyYesterday,
                                            earlier: t.historyEarlier,
                                        }}
                                    />
                                </div>
                            )}
                        </Tabs>
                    </motion.div>
                </SheetContent>
            </Sheet>

            <AlertDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !deleting) {
                        setDeleteTarget(null);
                        window.setTimeout(restoreBodyPointerEvents, 0);
                    }
                }}
            >
                <AlertDialogContent
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        restoreBodyPointerEvents();
                    }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t.deleteConfirmTitle}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget ? (
                                <>
                                    <span className="text-foreground font-medium">&ldquo;{deleteTarget.title}&rdquo;</span>
                                    {' '}
                                    {t.deleteConfirmDescription}
                                </>
                            ) : (
                                t.deleteConfirmDescription
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>{tc.cancel}</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleting}
                            onClick={(event) => {
                                event.preventDefault();
                                void confirmDeleteConversation();
                            }}
                        >
                            {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
                            {t.deleteConfirmAction}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
