'use client';

import Link from 'next/link';
import {
    ArrowUpRight,
    BookOpen,
    Cloud,
    DollarSign,
    FileSearch,
    ShieldCheck,
    Workflow,
    type LucideIcon,
} from 'lucide-react';
import type { AiChatSource } from '@/app/actions/ai-chat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    ACTIVE_ORG_STORAGE_KEY,
    notifyActiveCloudAccountChanged,
} from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';

const MODULE_ICON: Record<string, LucideIcon> = {
    finops: DollarSign,
    cloud: Cloud,
    cloud_inventory: Cloud,
    assessment: FileSearch,
    governance: ShieldCheck,
    automation: Workflow,
    docs: BookOpen,
};

function activateCloudAccount(cloudAccountId: string) {
    if (typeof window === 'undefined') {
        return;
    }
    const orgId = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    localStorage.setItem('smc_active_cloud_account_id', cloudAccountId);
    if (orgId) {
        localStorage.setItem(`smc_active_cloud_account_id:${orgId}`, cloudAccountId);
    }
    notifyActiveCloudAccountChanged();
}

function isSafeInternalHref(href: string) {
    return href.startsWith('/') && !href.startsWith('//') && !href.includes('://');
}

type Props = {
    sources: AiChatSource[];
    label: string;
    openLabel: string;
    onNavigate?: () => void;
};

export function AiChatSources({ sources, label, openLabel, onNavigate }: Props) {
    if (!sources.length) {
        return null;
    }

    return (
        <div className="mt-3 space-y-2">
            <Separator />
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</p>
            <div className="flex flex-col gap-1.5">
                {sources.map((source) => {
                    const Icon = MODULE_ICON[source.module] ?? BookOpen;
                    const href = source.href && isSafeInternalHref(source.href) ? source.href : null;
                    const key = `${source.module}-${source.label}-${source.detail ?? ''}-${source.href ?? ''}`;

                    if (!href) {
                        return (
                            <Badge
                                key={key}
                                variant="secondary"
                                className="h-auto max-w-full justify-start gap-1.5 px-2.5 py-1.5 font-normal"
                            >
                                <Icon className="size-3.5 opacity-70" />
                                <span className="truncate">
                                    {source.label}
                                    {source.detail ? ` · ${source.detail}` : ''}
                                </span>
                            </Badge>
                        );
                    }

                    return (
                        <Button
                            key={key}
                            asChild
                            variant="outline"
                            size="sm"
                            className={cn(
                                'border-border/80 bg-muted/30 hover:bg-muted/60 h-auto max-w-full justify-between gap-2 px-2.5 py-2 font-normal',
                            )}
                        >
                            <Link
                                href={href}
                                onClick={() => {
                                    if (source.cloudAccountId) {
                                        activateCloudAccount(source.cloudAccountId);
                                    }
                                    onNavigate?.();
                                }}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <Icon className="size-3.5 shrink-0 opacity-70" />
                                    <span className="min-w-0 text-left">
                                        <span className="block truncate text-sm leading-tight">{source.label}</span>
                                        {source.detail ? (
                                            <span className="text-muted-foreground block truncate text-[11px] leading-tight">
                                                {source.detail}
                                            </span>
                                        ) : null}
                                    </span>
                                </span>
                                <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]">
                                    {openLabel}
                                    <ArrowUpRight className="size-3.5" />
                                </span>
                            </Link>
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}
