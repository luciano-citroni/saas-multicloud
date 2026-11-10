'use client';

import { useState } from 'react';
import { History, MessageSquare, Plus, Sparkles } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { AiChatComposer } from './ai-chat-composer';
import { AiChatConversationList } from './ai-chat-conversation-list';
import { AiChatMessageList } from './ai-chat-message-list';
import { useAiChatController } from './use-ai-chat-controller';

type ChatPaneTab = 'chat' | 'history';

type Props = {
    /** When true, omit page chrome (used inside Cloud Intelligence shell). */
    embedded?: boolean;
};

export function AiChatPage({ embedded = false }: Props) {
    const chat = useAiChatController({ enabled: true });
    const [mobileTab, setMobileTab] = useState<ChatPaneTab>('chat');

    const conversationTitle =
        chat.conversations.find((item) => item.id === chat.activeConversationId)?.title ?? chat.t.title;

    const startNewConversation = () => {
        void chat.handleNewConversation();
        setMobileTab('chat');
    };

    const historyList = (
        <AiChatConversationList
            conversations={chat.conversations}
            activeId={chat.activeConversationId}
            loading={chat.loading}
            locale={chat.locale}
            onSelect={(id) => {
                if (chat.organizationId) {
                    void chat.selectConversation(chat.organizationId, id);
                    setMobileTab('chat');
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
    );

    const chatPane = (
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
    );

    return (
        <div className={cn('flex min-h-0 flex-1 flex-col', !embedded && 'gap-4')}>
            {!embedded ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight">{chat.t.title}</h1>
                        <p className="text-muted-foreground max-w-2xl text-sm">{chat.t.description}</p>
                    </div>
                    <Button
                        type="button"
                        className="gap-2"
                        onClick={startNewConversation}
                        disabled={!chat.organizationId}
                    >
                        <Plus className="size-4" />
                        {chat.t.newConversation}
                    </Button>
                </div>
            ) : null}

            <div
                className={cn(
                    'border-border bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm',
                    embedded
                        ? 'min-h-[calc(100svh-10rem)]'
                        : 'h-[min(70vh,calc(100dvh-14rem))] max-h-[min(70vh,calc(100dvh-14rem))]',
                )}
            >
                {/* Mobile */}
                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
                    <Tabs
                        value={mobileTab}
                        onValueChange={(value) => setMobileTab(value as ChatPaneTab)}
                        className="flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden"
                    >
                        <div className="border-border bg-muted/20 flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
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
                                size="icon-sm"
                                className="shrink-0"
                                onClick={startNewConversation}
                                disabled={!chat.organizationId}
                                aria-label={chat.t.newConversation}
                            >
                                <Plus className="size-4" />
                            </Button>
                        </div>
                        {mobileTab === 'chat' ? (
                            chatPane
                        ) : (
                            <div className="bg-muted/10 relative min-h-0 flex-1 overflow-hidden">
                                {historyList}
                            </div>
                        )}
                    </Tabs>
                </div>

                {/* Desktop */}
                <div className="hidden h-full min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
                    <aside className="border-border bg-muted/15 flex h-full min-h-0 flex-col overflow-hidden border-r">
                        <div className="flex shrink-0 flex-col gap-3 px-3 py-3">
                            <Button
                                type="button"
                                className="h-9 w-full justify-start gap-2"
                                onClick={startNewConversation}
                                disabled={!chat.organizationId}
                            >
                                <Plus className="size-4" />
                                {chat.t.newConversation}
                            </Button>
                            <div className="flex items-center gap-2 px-1">
                                <History className="text-muted-foreground size-3.5" />
                                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                                    {chat.t.historyTitle}
                                </p>
                                {chat.conversations.length > 0 ? (
                                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 tabular-nums">
                                        {chat.conversations.length}
                                    </Badge>
                                ) : null}
                            </div>
                        </div>
                        <Separator className="shrink-0" />
                        <div className="relative min-h-0 flex-1 overflow-hidden">{historyList}</div>
                    </aside>

                    <section className="bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                        <div className="border-border flex h-14 shrink-0 items-center gap-3 border-b px-5">
                            <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                                <Sparkles className="size-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium tracking-tight">{conversationTitle}</p>
                                <p className="text-muted-foreground truncate text-xs">{chat.t.description}</p>
                            </div>
                        </div>
                        {chatPane}
                    </section>
                </div>
            </div>

            <ConfirmDeleteDialog
                open={Boolean(chat.deleteTarget)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !chat.deleting) {
                        chat.setDeleteTarget(null);
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
            />
        </div>
    );
}
