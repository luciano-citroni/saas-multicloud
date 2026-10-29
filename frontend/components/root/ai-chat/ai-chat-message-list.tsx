'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bot, CheckIcon, CopyIcon, MessageCircleDashed } from 'lucide-react';
import type { AiChatMessage } from '@/app/actions/ai-chat';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Message, MessageAvatar, MessageContent, MessageFooter } from '@/components/ui/message';
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
    locale: 'pt' | 'en';
    onSuggestion?: (prompt: string) => void;
    suggestionsDisabled?: boolean;
    onSourceNavigate?: () => void;
};

const EASE = [0.22, 1, 0.36, 1] as const;

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
    locale,
    onSuggestion,
    suggestionsDisabled,
    onSourceNavigate,
}: Props) {
    const prefersReducedMotion = useReducedMotion();

    if (!messages.length && !streamingContent && !isStreaming) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8 text-center">
                <Avatar size="lg" className="bg-primary/10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                        <MessageCircleDashed className="size-5" />
                    </AvatarFallback>
                </Avatar>
                <div className="space-y-1.5">
                    <p className="text-sm font-medium tracking-tight">{emptyTitle}</p>
                    <p className="text-muted-foreground max-w-sm text-xs leading-relaxed">{emptyDescription}</p>
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
            <div className="min-h-0 flex-1">
                <MessageScroller>
                    <MessageScrollerViewport>
                        <MessageScrollerContent className="gap-6 px-4 py-5">
                            <AnimatePresence initial={false}>
                                {messages.map((message) => {
                                    const time = formatTime(message.createdAt);
                                    if (message.role === 'user') {
                                        return (
                                            <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor>
                                                <motion.div
                                                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.28, ease: EASE }}
                                                >
                                                    <Message align="end">
                                                        <MessageContent className="gap-1.5">
                                                            <Bubble align="end" variant="muted" className="max-w-[90%]">
                                                                <BubbleContent className="whitespace-pre-wrap leading-6">
                                                                    {message.content}
                                                                </BubbleContent>
                                                            </Bubble>
                                                            {time ? <MessageFooter>{time}</MessageFooter> : null}
                                                        </MessageContent>
                                                    </Message>
                                                </motion.div>
                                            </MessageScrollerItem>
                                        );
                                    }

                                    return (
                                        <MessageScrollerItem key={message.id} messageId={message.id}>
                                            <motion.div
                                                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.32, ease: EASE }}
                                            >
                                                <Message align="start">
                                                    <MessageAvatar>
                                                        <Avatar size="sm">
                                                            <AvatarFallback className="bg-muted text-foreground">
                                                                <Bot className="size-3.5" />
                                                            </AvatarFallback>
                                                        </Avatar>
                                                    </MessageAvatar>
                                                    <MessageContent className="max-w-[90%] gap-2">
                                                        <MarkdownRenderer content={message.content} />
                                                        {message.sources?.length ? (
                                                            <AiChatSources
                                                                sources={message.sources}
                                                                label={sourcesLabel}
                                                                openLabel={openSourceLabel}
                                                                onNavigate={onSourceNavigate}
                                                            />
                                                        ) : null}
                                                        <MessageFooter className="gap-1 px-0">
                                                            <CopyAction
                                                                content={message.content}
                                                                copyLabel={copyLabel}
                                                                copiedLabel={copiedLabel}
                                                            />
                                                            {time ? <span className="ml-1">{time}</span> : null}
                                                        </MessageFooter>
                                                    </MessageContent>
                                                </Message>
                                            </motion.div>
                                        </MessageScrollerItem>
                                    );
                                })}
                            </AnimatePresence>

                            {isStreaming || streamingContent !== null || toolSteps.length > 0 ? (
                                <MessageScrollerItem messageId="streaming-assistant">
                                    <motion.div
                                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.25, ease: EASE }}
                                    >
                                        <Message align="start">
                                            <MessageAvatar>
                                                <Avatar size="sm">
                                                    <AvatarFallback className="bg-muted text-foreground">
                                                        <Bot className="size-3.5" />
                                                    </AvatarFallback>
                                                </Avatar>
                                            </MessageAvatar>
                                            <MessageContent className="max-w-[90%] gap-2">
                                                {toolSteps.length > 0 ? (
                                                    <AiChatToolTrace steps={toolSteps} label={toolsLabel} />
                                                ) : null}
                                                {streamingContent ? (
                                                    <MarkdownRenderer content={streamingContent} />
                                                ) : (
                                                    <AiChatResearching label={researchingLabel} />
                                                )}
                                            </MessageContent>
                                        </Message>
                                    </motion.div>
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
