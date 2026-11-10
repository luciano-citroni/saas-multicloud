'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MessageSquareText, Trash2 } from 'lucide-react';
import type { AiChatConversation } from '@/app/actions/ai-chat';
import { Button } from '@/components/ui/button';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AppLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';

type GroupKey = 'today' | 'yesterday' | 'earlier';

type Props = {
    conversations: AiChatConversation[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    loading?: boolean;
    locale: AppLocale;
    labels: {
        empty: string;
        delete: string;
        today: string;
        yesterday: string;
        earlier: string;
    };
};

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getGroupKey(iso: string, now = new Date()): GroupKey {
    const date = new Date(iso);
    const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
    if (diffDays <= 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    return 'earlier';
}

function formatRelativeTime(iso: string, locale: AppLocale) {
    const date = new Date(iso);
    const diffMs = date.getTime() - Date.now();
    const diffSec = Math.round(diffMs / 1000);
    const absSec = Math.abs(diffSec);
    const rtf = new Intl.RelativeTimeFormat(locale === 'pt' ? 'pt-BR' : 'en', { numeric: 'auto' });

    if (absSec < 60) return rtf.format(Math.round(diffSec / 60) || 0, 'minute');
    if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
    if (absSec < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
    if (absSec < 86_400 * 7) return rtf.format(Math.round(diffSec / 86_400), 'day');

    return date.toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en', {
        day: '2-digit',
        month: 'short',
    });
}

function groupConversations(conversations: AiChatConversation[]) {
    const groups: Record<GroupKey, AiChatConversation[]> = {
        today: [],
        yesterday: [],
        earlier: [],
    };

    for (const conversation of conversations) {
        groups[getGroupKey(conversation.updatedAt || conversation.createdAt)].push(conversation);
    }

    return (['today', 'yesterday', 'earlier'] as const)
        .map((key) => ({ key, items: groups[key] }))
        .filter((group) => group.items.length > 0);
}

function ConversationListSkeleton() {
    return (
        <div className="space-y-2 px-3 py-3">
            {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                    <Skeleton className="size-9 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-[72%]" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function AiChatConversationList({
    conversations,
    activeId,
    onSelect,
    onDelete,
    loading = false,
    locale,
    labels,
}: Props) {
    const prefersReducedMotion = useReducedMotion();
    const groups = groupConversations(conversations);

    if (loading) {
        return (
            <div className="relative h-full min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto overscroll-contain">
                    <ConversationListSkeleton />
                </div>
            </div>
        );
    }

    return (
        <TooltipProvider delayDuration={200}>
            <div className="relative h-full min-h-0 flex-1 overflow-hidden">
                {!conversations.length ? (
                    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                        <div className="bg-muted/70 text-muted-foreground/80 flex size-11 items-center justify-center rounded-full">
                            <MessageSquareText className="size-5" />
                        </div>
                        <p className="max-w-[240px] text-sm leading-relaxed">{labels.empty}</p>
                    </div>
                ) : (
                    <div className="absolute inset-0 overflow-y-auto overscroll-contain px-2 py-2">
                        <AnimatePresence initial={false}>
                            {groups.map((group, groupIndex) => (
                                <div key={group.key} className="mb-1">
                                    {groupIndex > 0 ? <Separator className="mx-2 my-2" /> : null}
                                    <p className="text-muted-foreground/80 px-2.5 pb-1.5 pt-1 text-[10px] font-medium tracking-wide uppercase">
                                        {labels[group.key]}
                                    </p>
                                    <ItemGroup className="gap-1.5">
                                        {group.items.map((conversation) => {
                                            const isActive = activeId === conversation.id;
                                            const when = formatRelativeTime(
                                                conversation.updatedAt || conversation.createdAt,
                                                locale,
                                            );

                                            return (
                                                <motion.div
                                                    key={conversation.id}
                                                    layout={!prefersReducedMotion}
                                                    initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={prefersReducedMotion ? undefined : { opacity: 0, height: 0 }}
                                                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                                >
                                                    <Item
                                                        role="listitem"
                                                        tabIndex={0}
                                                        size="sm"
                                                        variant={isActive ? 'muted' : 'outline'}
                                                        aria-selected={isActive}
                                                        className={cn(
                                                            'group cursor-pointer hover:bg-muted/60',
                                                            isActive &&
                                                                'border-primary/40 bg-primary/10 ring-primary/20 ring-1',
                                                        )}
                                                        onClick={() => onSelect(conversation.id)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter' || event.key === ' ') {
                                                                event.preventDefault();
                                                                onSelect(conversation.id);
                                                            }
                                                        }}
                                                    >
                                                        <ItemMedia
                                                            variant="icon"
                                                            className={cn(
                                                                'bg-background size-9 rounded-lg border',
                                                                isActive
                                                                    ? 'border-primary/30 text-primary'
                                                                    : 'border-border text-muted-foreground',
                                                            )}
                                                        >
                                                            <MessageSquareText className="size-3.5" />
                                                        </ItemMedia>
                                                        <ItemContent className="min-w-0">
                                                            <ItemTitle className="line-clamp-2 w-full max-w-none whitespace-normal">
                                                                {conversation.title}
                                                            </ItemTitle>
                                                            <ItemDescription className="line-clamp-1 text-[11px]">
                                                                {when}
                                                            </ItemDescription>
                                                        </ItemContent>
                                                        <ItemActions>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon-xs"
                                                                        className={cn(
                                                                            'text-muted-foreground hover:text-destructive size-7 shrink-0 rounded-md',
                                                                            'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
                                                                            'focus-visible:opacity-100',
                                                                        )}
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            onDelete(conversation.id);
                                                                        }}
                                                                        aria-label={labels.delete}
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="left">
                                                                    {labels.delete}
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </ItemActions>
                                                    </Item>
                                                </motion.div>
                                            );
                                        })}
                                    </ItemGroup>
                                </div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}
