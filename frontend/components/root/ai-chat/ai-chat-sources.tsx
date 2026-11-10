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
import {
    ACTIVE_ORG_STORAGE_KEY,
    notifyActiveCloudAccountChanged,
} from '@/lib/sidebar-context';

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
            <ItemGroup className="gap-1.5">
                {sources.map((source) => {
                    const Icon = MODULE_ICON[source.module] ?? BookOpen;
                    const href = source.href && isSafeInternalHref(source.href) ? source.href : null;
                    const key = `${source.module}-${source.label}-${source.detail ?? ''}-${source.href ?? ''}`;

                    if (!href) {
                        return (
                            <Item key={key} size="sm" variant="muted" className="pointer-events-none">
                                <ItemMedia variant="icon" className="text-muted-foreground">
                                    <Icon className="size-3.5 opacity-70" />
                                </ItemMedia>
                                <ItemContent className="min-w-0">
                                    <ItemTitle className="truncate">{source.label}</ItemTitle>
                                    {source.detail ? (
                                        <ItemDescription className="truncate">{source.detail}</ItemDescription>
                                    ) : null}
                                </ItemContent>
                            </Item>
                        );
                    }

                    return (
                        <Item
                            key={key}
                            asChild
                            size="sm"
                            variant="outline"
                            className="bg-muted/30 hover:bg-muted/60 cursor-pointer"
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
                                <ItemMedia variant="icon" className="text-muted-foreground">
                                    <Icon className="size-3.5 opacity-70" />
                                </ItemMedia>
                                <ItemContent className="min-w-0">
                                    <ItemTitle className="truncate">{source.label}</ItemTitle>
                                    {source.detail ? (
                                        <ItemDescription className="truncate">{source.detail}</ItemDescription>
                                    ) : null}
                                </ItemContent>
                                <ItemActions className="text-muted-foreground text-[11px]">
                                    <span className="flex items-center gap-1">
                                        {openLabel}
                                        <ArrowUpRight className="size-3.5" />
                                    </span>
                                </ItemActions>
                            </Link>
                        </Item>
                    );
                })}
            </ItemGroup>
        </div>
    );
}
