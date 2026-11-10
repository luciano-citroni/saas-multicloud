'use client';

import { memo, useState } from 'react';
import { Bot, CheckIcon, CopyIcon, MessageCircleDashed } from 'lucide-react';
import type { AiChatMessage } from '@/app/actions/ai-chat';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import {
    Message,
    MessageAvatar,
    MessageContent,
    MessageFooter,
    MessageHeader,
} from '@/components/ui/message';
import {
    MessageScroller,
    MessageScrollerButton,
    MessageScrollerContent,
    MessageScrollerItem,
    MessageScrollerProvider,
    MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MarkdownRenderer } from './markdown-renderer';
import { AiChatSources } from './ai-chat-sources';
import { AiChatSuggestions } from './ai-chat-suggestions';
import { AiChatResearching, AiChatToolTrace, type AiChatToolStep } from './ai-chat-tool-trace';

type Props = {
    messages: AiChatMessage[];
    streamingContent?: string | null;
    toolSteps?: AiChatToolStep[];
    isStreaming?: boolean;
    sourcesLabel: string;
    openSourceLabel: string;
    toolsLabel: string;
    researchingLabel: string;
    copyLabel: string;
    copiedLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    suggestionsTitle: string;
    assistantLabel?: string;
    youLabel?: string;
    locale: 'pt' | 'en';
    onSuggestion?: (prompt: string) => void;
    suggestionsDisabled?: boolean;
    onSourceNavigate?: () => void;
};

function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function CopyAction({ content, copyLabel, copiedLabel }: { content: string; copyLabel: string; copiedLabel: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copyLabel}
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(content);
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1600);
                        } catch {
                            // ignore clipboard failures
                        }
                    }}
                >
                    {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? copiedLabel : copyLabel}</TooltipContent>
        </Tooltip>
    );
}

const UserBubble = memo(function UserBubble({
    message,
    youLabel,
}: {
    message: AiChatMessage;
    youLabel: string;
}) {
    const time = formatTime(message.createdAt);
    return (
        <Message align="end">
            <MessageContent className="gap-1.5">
                <MessageHeader>{youLabel}</MessageHeader>
                <Bubble align="end" variant="default" className="max-w-[90%]">
                    <BubbleContent className="whitespace-pre-wrap leading-6">{message.content}</BubbleContent>
                </Bubble>
                {time ? <MessageFooter>{time}</MessageFooter> : null}
            </MessageContent>
        </Message>
    );
});

const AssistantBubble = memo(function AssistantBubble({
    message,
    assistantLabel,
    sourcesLabel,
    openSourceLabel,
    copyLabel,
    copiedLabel,
    onSourceNavigate,
}: {
    message: AiChatMessage;
    assistantLabel: string;
    sourcesLabel: string;
    openSourceLabel: string;
    copyLabel: string;
    copiedLabel: string;
    onSourceNavigate?: () => void;
}) {
    const time = formatTime(message.createdAt);
    return (
        <Message align="start">
            <MessageAvatar>
                <Avatar size="sm">
                    <AvatarFallback className="bg-muted text-foreground">
                        <Bot className="size-3.5" />
                    </AvatarFallback>
                </Avatar>
            </MessageAvatar>
            <MessageContent className="max-w-[min(100%,48rem)] gap-2">
                <MessageHeader>{assistantLabel}</MessageHeader>
                <Bubble variant="ghost" className="w-full max-w-full">
                    <BubbleContent className="w-full max-w-full">
                        <MarkdownRenderer content={message.content} />
                    </BubbleContent>
                </Bubble>
                {message.sources?.length ? (
                    <Bubble variant="outline" className="w-full max-w-full">
                        <BubbleContent className="w-full max-w-full space-y-2">
                            <AiChatSources
                                sources={message.sources}
                                label={sourcesLabel}
                                openLabel={openSourceLabel}
                                onNavigate={onSourceNavigate}
                            />
                        </BubbleContent>
                    </Bubble>
                ) : null}
                <MessageFooter className="gap-1 px-0">
                    <CopyAction content={message.content} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                    {time ? <span className="ml-1">{time}</span> : null}
                </MessageFooter>
            </MessageContent>
        </Message>
    );
});

export function AiChatMessageList({
    messages,
    streamingContent,
    toolSteps = [],
    isStreaming = false,
    sourcesLabel,
    openSourceLabel,
    toolsLabel,
    researchingLabel,
    copyLabel,
    copiedLabel,
    emptyTitle,
    emptyDescription,
    suggestionsTitle,
    assistantLabel = 'Assistant',
    youLabel = 'You',
    locale,
    onSuggestion,
    suggestionsDisabled,
    onSourceNavigate,
}: Props) {
    if (!messages.length && !streamingContent && !isStreaming) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-10 text-center">
                <Avatar size="lg" className="bg-primary/10 ring-border size-12 ring-1">
                    <AvatarFallback className="bg-primary/10 text-primary">
                        <MessageCircleDashed className="size-5" />
                    </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                    <p className="text-base font-semibold tracking-tight">{emptyTitle}</p>
                    <p className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed">
                        {emptyDescription}
                    </p>
                </div>
                {onSuggestion ? (
                    <AiChatSuggestions
                        locale={locale}
                        title={suggestionsTitle}
                        onSelect={onSuggestion}
                        disabled={suggestionsDisabled}
                    />
                ) : null}
            </div>
        );
    }

    return (
        <MessageScrollerProvider autoScroll>
            <div className="min-h-0 flex-1 overflow-hidden">
                <MessageScroller className="h-full">
                    <MessageScrollerViewport>
                        <MessageScrollerContent className="gap-6 px-4 py-5">
                            {messages.map((message) => {
                                if (message.role === 'user') {
                                    return (
                                        <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor>
                                            <UserBubble message={message} youLabel={youLabel} />
                                        </MessageScrollerItem>
                                    );
                                }

                                return (
                                    <MessageScrollerItem key={message.id} messageId={message.id}>
                                        <AssistantBubble
                                            message={message}
                                            assistantLabel={assistantLabel}
                                            sourcesLabel={sourcesLabel}
                                            openSourceLabel={openSourceLabel}
                                            copyLabel={copyLabel}
                                            copiedLabel={copiedLabel}
                                            onSourceNavigate={onSourceNavigate}
                                        />
                                    </MessageScrollerItem>
                                );
                            })}

                            {isStreaming || streamingContent !== null || toolSteps.length > 0 ? (
                                <MessageScrollerItem messageId="streaming-assistant">
                                    <Message align="start">
                                        <MessageAvatar>
                                            <Avatar size="sm">
                                                <AvatarFallback className="bg-muted text-foreground">
                                                    <Bot className="size-3.5" />
                                                </AvatarFallback>
                                            </Avatar>
                                        </MessageAvatar>
                                        <MessageContent className="max-w-[min(100%,48rem)] gap-2">
                                            <MessageHeader>{assistantLabel}</MessageHeader>
                                            {toolSteps.length > 0 ? (
                                                <Bubble variant="muted" className="w-full max-w-full">
                                                    <BubbleContent className="w-full max-w-full">
                                                        <AiChatToolTrace steps={toolSteps} label={toolsLabel} />
                                                    </BubbleContent>
                                                </Bubble>
                                            ) : null}
                                            {streamingContent ? (
                                                <Bubble variant="ghost" className="w-full max-w-full">
                                                    <BubbleContent className="w-full max-w-full">
                                                        {/* Plain text while streaming — markdown only after finalize */}
                                                        <div className="text-sm leading-6 whitespace-pre-wrap">
                                                            {streamingContent}
                                                            <span className="bg-foreground/70 ml-0.5 inline-block h-4 w-1.5 animate-pulse align-text-bottom" />
                                                        </div>
                                                    </BubbleContent>
                                                </Bubble>
                                            ) : (
                                                <Bubble variant="secondary">
                                                    <BubbleContent>
                                                        <AiChatResearching label={researchingLabel} />
                                                    </BubbleContent>
                                                </Bubble>
                                            )}
                                        </MessageContent>
                                    </Message>
                                </MessageScrollerItem>
                            ) : null}
                        </MessageScrollerContent>
                    </MessageScrollerViewport>
                    <MessageScrollerButton />
                </MessageScroller>
            </div>
        </MessageScrollerProvider>
    );
}
