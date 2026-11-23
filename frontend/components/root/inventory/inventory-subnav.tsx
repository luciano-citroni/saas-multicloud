'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, CalendarPlus, LayoutList } from 'lucide-react';
import { ScrollableSubnav } from '@/components/root/layout';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

const LINKS = [
    {
        href: '/inventory',
        labelKey: 'subnavOverview' as const,
        icon: LayoutList,
        match: (path: string) => path === '/inventory',
    },
    {
        href: '/inventory/browse',
        labelKey: 'subnavBrowse' as const,
        icon: Boxes,
        match: (path: string) => path.startsWith('/inventory/browse'),
    },
    {
        href: '/inventory/new-this-month',
        labelKey: 'subnavNewThisMonth' as const,
        icon: CalendarPlus,
        match: (path: string) => path.startsWith('/inventory/new-this-month'),
    },
] as const;

const linkClass = (active: boolean) =>
    cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors',
        active
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
    );

export function InventorySubnav({ className }: { className?: string }) {
    const t = useTranslations('inventory');
    const pathname = usePathname();

    return (
        <ScrollableSubnav aria-label={t.subnavAria} className={className}>
            {LINKS.map((link) => {
                const Icon = link.icon;
                const active = link.match(pathname);
                return (
                    <Link key={link.href} href={link.href} className={linkClass(active)}>
                        <Icon className="size-3.5 shrink-0" />
                        {t[link.labelKey]}
                    </Link>
                );
            })}
        </ScrollableSubnav>
    );
}
