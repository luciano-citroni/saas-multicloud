'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, LayoutDashboard, MessageSquare, Sparkles } from 'lucide-react';
import { ScrollableSubnav } from '@/components/root/layout';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

type SubnavLabelKey =
    | 'subnavOverview'
    | 'navRecommendations'
    | 'navChat'
    | 'subnavKnowledge';

const LINKS: ReadonlyArray<{
    href: string;
    labelKey: SubnavLabelKey;
    icon: typeof LayoutDashboard;
    match: (path: string) => boolean;
}> = [
    {
        href: '/cloud-intelligence',
        labelKey: 'subnavOverview',
        icon: LayoutDashboard,
        match: (path) => path === '/cloud-intelligence',
    },
    {
        href: '/cloud-intelligence/recommendations',
        labelKey: 'navRecommendations',
        icon: Sparkles,
        match: (path) => path.startsWith('/cloud-intelligence/recommendations'),
    },
    {
        href: '/cloud-intelligence/chat',
        labelKey: 'navChat',
        icon: MessageSquare,
        match: (path) => path.startsWith('/cloud-intelligence/chat'),
    },
    {
        href: '/cloud-intelligence/knowledge',
        labelKey: 'subnavKnowledge',
        icon: BookOpen,
        match: (path) => path.startsWith('/cloud-intelligence/knowledge'),
    },
];

type CiSubnavProps = {
    className?: string;
};

export function CiSubnav({ className }: CiSubnavProps) {
    const t = useTranslations('cloudIntelligence');
    const pathname = usePathname();

    return (
        <ScrollableSubnav aria-label={t.navAria} className={className}>
            {LINKS.map((link) => {
                const active = link.match(pathname);
                const Icon = link.icon;
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                            active
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                        )}
                    >
                        <Icon className="size-3.5 shrink-0" />
                        {t[link.labelKey]}
                    </Link>
                );
            })}
        </ScrollableSubnav>
    );
}
