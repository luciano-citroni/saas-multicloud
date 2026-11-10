'use client';

import { useEffect, useRef, useState } from 'react';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { AI_CHAT_OPEN_EVENT } from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';
import { AiChatComposer } from './ai-chat-composer';
import { AiChatConversationList } from './ai-chat-conversation-list';
import { AiChatMessageList } from './ai-chat-message-list';
import { AiChatTriggerButton } from './ai-chat-trigger-button';
import { useAiChatController } from './use-ai-chat-controller';

type ChatTab = 'chat' | 'history';
type DrawerDirection = 'bottom' | 'right';

function restoreBodyPointerEvents() {
    if (typeof document === 'undefined') {
        return;
    }
    document.body.style.pointerEvents = '';
}

export function AiChatDrawer() {
    const [open, setOpen] = useState(false);
    const [visited, setVisited] = useState(false);
    const [tab, setTab] = useState<ChatTab>('chat');
    const isMobile = useIsMobile();
    const chat = useAiChatController({ enabled: open });
    const directionRef = useRef<DrawerDirection>(isMobile ? 'bottom' : 'right');
    if (!open) {
        directionRef.current = isMobile ? 'bottom' : 'right';
    }
    const direction = directionRef.current;
    const isBottom = direction === 'bottom';

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
        if (!chat.deleteTarget) {
            const timer = window.setTimeout(restoreBodyPointerEvents, 0);
            return () => window.clearTimeout(timer);
        }
    }, [chat.deleteTarget]);

    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen) {
            setVisited(true);
        }
        setOpen(nextOpen);
        if (!nextOpen) {
            chat.setDeleteTarget(null);
            restoreBodyPointerEvents();
        }
    };

    return (
        <>
            {!open ? <AiChatTriggerButton variant="fab" onClick={() => handleOpenChange(true)} /> : null}

            <Drawer
                open={open}
                direction={direction}
                shouldScaleBackground={false}
                dismissible
                onOpenChange={handleOpenChange}
            >
                {visited ? (
                    <DrawerContent
                        className={cn(
                            'bg-background flex flex-col gap-0 overflow-hidden p-0',
                            isBottom
                                ? 'mt-0 h-[95dvh] max-h-[95dvh] rounded-t-xl'
                                : 'h-full max-h-none w-full rounded-none sm:max-w-lg md:max-w-2xl',
                        )}
                    >
                        <div className="flex h-full min-h-0 flex-1 flex-col">
                            <DrawerHeader className="border-border bg-background relative shrink-0 border-b px-4 py-3 pr-14 text-left">
                                <DrawerTitle className="text-base">{chat.t.title}</DrawerTitle>
                                <DrawerDescription className="text-xs leading-relaxed">
                                    {chat.t.description}
                                </DrawerDescription>
                                <DrawerClose asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        className="absolute top-3 right-3"
                                        aria-label="Close"
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
                                <div className="border-border bg-background flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
                                    <TabsList className="grid h-9 min-w-0 flex-1 grid-cols-2">
                                        <TabsTrigger value="chat" className="gap-1.5 px-3">
                                            <MessageSquare className="size-3.5" />
                                            {chat.t.tabChat}
                                        </TabsTrigger>
                                        <TabsTrigger value="history" className="gap-1.5 px-3">
                                            <History className="size-3.5" />
                                            {chat.t.tabHistory}
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
                                        size="lg"
                                        className="h-9 shrink-0 gap-1.5 rounded-lg px-3"
                                        onClick={() => void chat.handleNewConversation()}
                                        disabled={!chat.organizationId}
                                    >
                                        <Plus className="size-3.5" />
                                        <span className="hidden sm:inline">{chat.t.newConversation}</span>
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
                                            onSourceNavigate={() => handleOpenChange(false)}
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
                    </DrawerContent>
                ) : null}
            </Drawer>

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
