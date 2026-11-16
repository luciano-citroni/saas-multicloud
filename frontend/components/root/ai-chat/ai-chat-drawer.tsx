'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { History, MessageSquare, Plus, X } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsBelowLg } from '@/hooks/use-mobile';
import { useTranslations } from '@/lib/i18n';
import {
    AI_CHAT_OPEN_EVENT,
    MOBILE_FILTERS_DRAWER_EVENT,
    type MobileFiltersDrawerEventDetail,
} from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';
import { AiChatComposer } from './ai-chat-composer';
import { AiChatConversationList } from './ai-chat-conversation-list';
import { AiChatMessageList } from './ai-chat-message-list';
import { AiChatTriggerButton } from './ai-chat-trigger-button';
import { useAiChatController } from './use-ai-chat-controller';

type ChatTab = 'chat' | 'history';
type DrawerDirection = 'bottom' | 'right';
type AiChatController = ReturnType<typeof useAiChatController>;

const CHAT_SNAP_POINTS = [0.7, 1] as const;

function restoreBodyPointerEvents() {
    if (typeof document === 'undefined') {
        return;
    }
    document.body.style.pointerEvents = '';
}

function AiChatDrawerBody({
    chat,
    tab,
    setTab,
    closeLabel,
    onClose,
}: {
    chat: AiChatController;
    tab: ChatTab;
    setTab: Dispatch<SetStateAction<ChatTab>>;
    closeLabel: string;
    onClose: () => void;
}) {
    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            <DrawerHeader className="border-border relative shrink-0 gap-1 border-b px-4 py-3 pr-12 text-left">
                <DrawerTitle className="text-base leading-tight">{chat.t.title}</DrawerTitle>
                <DrawerDescription className="line-clamp-2 text-xs leading-snug">
                    {chat.t.description}
                </DrawerDescription>
                <DrawerClose asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-2.5 right-2.5"
                        aria-label={closeLabel}
                    >
                        <X className="size-4" />
                    </Button>
                </DrawerClose>
            </DrawerHeader>

            <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as ChatTab)}
                className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
            >
                <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
                    <TabsList className="grid h-8 min-w-0 flex-1 grid-cols-2">
                        <TabsTrigger value="chat" className="gap-1.5 px-2 text-xs sm:text-sm">
                            <MessageSquare className="size-3.5 shrink-0" />
                            <span className="truncate">{chat.t.tabChat}</span>
                        </TabsTrigger>
                        <TabsTrigger value="history" className="gap-1.5 px-2 text-xs sm:text-sm">
                            <History className="size-3.5 shrink-0" />
                            <span className="truncate">{chat.t.tabHistory}</span>
                            {chat.conversations.length > 0 ? (
                                <Badge
                                    variant="secondary"
                                    className="h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums"
                                >
                                    {chat.conversations.length}
                                </Badge>
                            ) : null}
                        </TabsTrigger>
                    </TabsList>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="shrink-0"
                        onClick={() => void chat.handleNewConversation()}
                        disabled={!chat.organizationId}
                        aria-label={chat.t.newConversation}
                        title={chat.t.newConversation}
                    >
                        <Plus className="size-3.5" />
                    </Button>
                </div>

                {tab === 'chat' ? (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <AiChatMessageList
                            messages={chat.messages}
                            streamingContent={chat.streamingContent}
                            toolSteps={chat.toolSteps}
                            isStreaming={chat.isStreaming}
                            sourcesLabel={chat.t.sources}
                            openSourceLabel={chat.t.openSource}
                            toolsLabel={chat.t.tools}
                            researchingLabel={chat.t.researching}
                            copyLabel={chat.t.copy}
                            copiedLabel={chat.t.copied}
                            emptyTitle={chat.t.emptyTitle}
                            emptyDescription={chat.t.emptyDescription}
                            suggestionsTitle={chat.t.suggestionsTitle}
                            assistantLabel={chat.t.assistantLabel}
                            youLabel={chat.t.youLabel}
                            locale={chat.locale}
                            onSuggestion={chat.handleSuggestion}
                            suggestionsDisabled={!chat.organizationId || chat.isStreaming}
                            onSourceNavigate={onClose}
                        />

                        <div className="shrink-0">
                            <AiChatComposer
                                value={chat.draft}
                                onChange={chat.setDraft}
                                onSubmit={() => void chat.handleSend()}
                                onStop={() => void chat.handleStop()}
                                disabled={!chat.organizationId}
                                isStreaming={chat.isStreaming}
                                placeholder={chat.t.placeholder}
                                sendLabel={chat.t.send}
                                stopLabel={chat.t.stop}
                                noOrgHint={!chat.organizationId ? chat.t.selectOrganization : null}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <AiChatConversationList
                            conversations={chat.conversations}
                            activeId={chat.activeConversationId}
                            loading={chat.loading}
                            locale={chat.locale}
                            onSelect={(id) => {
                                if (chat.organizationId) {
                                    void chat.selectConversation(chat.organizationId, id);
                                    setTab('chat');
                                }
                            }}
                            onDelete={chat.requestDeleteConversation}
                            labels={{
                                empty: chat.t.noConversations,
                                delete: chat.t.deleteConversation,
                                today: chat.t.historyToday,
                                yesterday: chat.t.historyYesterday,
                                earlier: chat.t.historyEarlier,
                            }}
                        />
                    </div>
                )}
            </Tabs>
        </div>
    );
}

export function AiChatDrawer() {
    const [open, setOpen] = useState(false);
    const [visited, setVisited] = useState(false);
    const [tab, setTab] = useState<ChatTab>('chat');
    const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
    const [snapPoint, setSnapPoint] = useState<number | string | null>(CHAT_SNAP_POINTS[0]);
    const isBelowLg = useIsBelowLg();
    const tc = useTranslations('common');
    const chat = useAiChatController({ enabled: open });
    const directionRef = useRef<DrawerDirection>(isBelowLg ? 'bottom' : 'right');
    if (!open) {
        directionRef.current = isBelowLg ? 'bottom' : 'right';
    }
    const direction = directionRef.current;
    const isBottom = direction === 'bottom';
    const isFullHeight = isBottom && (snapPoint === 1 || snapPoint === '1');
    const showFab = !open && !filtersDrawerOpen;

    useEffect(() => {
        const openChat = () => {
            setTab('chat');
            setVisited(true);
            setOpen(true);
        };
        window.addEventListener(AI_CHAT_OPEN_EVENT, openChat);
        return () => {
            window.removeEventListener(AI_CHAT_OPEN_EVENT, openChat);
        };
    }, []);

    useEffect(() => {
        const onFiltersDrawer = (event: Event) => {
            const detail = (event as CustomEvent<MobileFiltersDrawerEventDetail>).detail;
            setFiltersDrawerOpen(Boolean(detail?.open));
        };
        window.addEventListener(MOBILE_FILTERS_DRAWER_EVENT, onFiltersDrawer);
        return () => {
            window.removeEventListener(MOBILE_FILTERS_DRAWER_EVENT, onFiltersDrawer);
        };
    }, []);

    useEffect(() => {
        if (!chat.deleteTarget) {
            const timer = window.setTimeout(restoreBodyPointerEvents, 0);
            return () => window.clearTimeout(timer);
        }
    }, [chat.deleteTarget]);

    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen) {
            setVisited(true);
            setSnapPoint(CHAT_SNAP_POINTS[0]);
        }
        setOpen(nextOpen);
        if (!nextOpen) {
            chat.setDeleteTarget(null);
            restoreBodyPointerEvents();
        }
    };

    const body = visited ? (
        <AiChatDrawerBody
            chat={chat}
            tab={tab}
            setTab={setTab}
            closeLabel={tc.close}
            onClose={() => handleOpenChange(false)}
        />
    ) : null;

    return (
        <>
            {showFab ? <AiChatTriggerButton variant="fab" onClick={() => handleOpenChange(true)} /> : null}

            {isBottom ? (
                <Drawer
                    open={open}
                    direction="bottom"
                    shouldScaleBackground={false}
                    dismissible
                    onOpenChange={handleOpenChange}
                    snapPoints={[...CHAT_SNAP_POINTS]}
                    activeSnapPoint={snapPoint}
                    setActiveSnapPoint={setSnapPoint}
                    fadeFromIndex={1}
                >
                    {body ? (
                        <DrawerContent
                            className={cn(
                                'bg-background flex h-full max-h-[100dvh] flex-col gap-0 overflow-hidden p-0',
                                isFullHeight ? 'rounded-none' : 'rounded-t-xl',
                            )}
                        >
                            {body}
                        </DrawerContent>
                    ) : null}
                </Drawer>
            ) : (
                <Drawer
                    open={open}
                    direction="right"
                    shouldScaleBackground={false}
                    dismissible
                    onOpenChange={handleOpenChange}
                >
                    {body ? (
                        <DrawerContent className="bg-background flex h-full max-h-none w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-md lg:max-w-lg">
                            {body}
                        </DrawerContent>
                    ) : null}
                </Drawer>
            )}

            <ConfirmDeleteDialog
                open={Boolean(chat.deleteTarget)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !chat.deleting) {
                        chat.setDeleteTarget(null);
                        window.setTimeout(restoreBodyPointerEvents, 0);
                    }
                }}
                title={chat.t.deleteConfirmTitle}
                description={
                    chat.deleteTarget ? (
                        <>
                            <span className="text-foreground font-medium">
                                &ldquo;{chat.deleteTarget.title}&rdquo;
                            </span>{' '}
                            {chat.t.deleteConfirmDescription}
                        </>
                    ) : (
                        chat.t.deleteConfirmDescription
                    )
                }
                resourceName={chat.deleteTarget?.title ?? ''}
                confirmLabel={chat.t.deleteConfirmAction}
                isConfirming={chat.deleting}
                onConfirm={chat.confirmDeleteConversation}
                contentProps={{
                    onCloseAutoFocus: (event) => {
                        event.preventDefault();
                        restoreBodyPointerEvents();
                    },
                }}
            />
        </>
    );
}
