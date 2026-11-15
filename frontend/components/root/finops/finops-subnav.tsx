'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
    AlertTriangle,
    BarChart3,
    Bot,
    Cloud,
    FileText,
    Landmark,
    LayoutDashboard,
    PiggyBank,
    Target,
} from 'lucide-react';
import { ScrollableSubnav } from '@/components/root/layout';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

type SubnavLabelKey =
    | 'subnavOverview'
    | 'subnavAnomalies'
    | 'subnavSavings'
    | 'subnavCommitments'
    | 'subnavMulticloud'
    | 'subnavBudgets'
    | 'subnavReports'
    | 'subnavAiCosts';

const LINKS: ReadonlyArray<{
    href: string;
    labelKey: SubnavLabelKey;
    icon: typeof LayoutDashboard;
    match: (path: string) => boolean;
}> = [
    { href: '/finops', labelKey: 'subnavOverview', icon: LayoutDashboard, match: (path) => path === '/finops' },
    {
        href: '/finops/anomalies',
        labelKey: 'subnavAnomalies',
        icon: AlertTriangle,
        match: (path) => path.startsWith('/finops/anomalies'),
    },
    {
        href: '/finops/savings',
        labelKey: 'subnavSavings',
        icon: PiggyBank,
        match: (path) => path.startsWith('/finops/savings'),
    },
    {
        href: '/finops/commitments',
        labelKey: 'subnavCommitments',
        icon: Landmark,
        match: (path) => path.startsWith('/finops/commitments'),
    },
    {
        href: '/finops/multicloud',
        labelKey: 'subnavMulticloud',
        icon: Cloud,
        match: (path) => path.startsWith('/finops/multicloud'),
    },
    {
        href: '/finops/budgets',
        labelKey: 'subnavBudgets',
        icon: Target,
        match: (path) => path.startsWith('/finops/budgets'),
    },
    {
        href: '/finops/reports',
        labelKey: 'subnavReports',
        icon: FileText,
        match: (path) => path.startsWith('/finops/reports'),
    },
    {
        href: '/finops/ai',
        labelKey: 'subnavAiCosts',
        icon: Bot,
        match: (path) => path === '/finops/ai' || path.startsWith('/finops/ai/'),
    },
];

const linkClass = (active: boolean) =>
    cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors',
        active
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
    );

type FinopsSubnavProps = {
    className?: string;
};

export function FinopsSubnav({ className }: FinopsSubnavProps) {
    const t = useTranslations('finops');
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const preserveKeys = ['period', 'account', 'provider', 'service'] as const;
    const preserved = new URLSearchParams();
    for (const key of preserveKeys) {
        const value = searchParams.get(key);
        if (value) preserved.set(key, value);
    }

    const isAccountDetail = pathname.startsWith('/finops/accounts/');

    return (
        <ScrollableSubnav aria-label={t.subnavAria} className={className}>
            {LINKS.map((link) => {
                const active = link.match(pathname);
                const linkParams = new URLSearchParams(preserved);
                if (link.href !== '/finops/budgets' && linkParams.get('account') === 'organization') {
                    linkParams.delete('account');
                }
                const linkQuery = linkParams.toString();
                const href = linkQuery ? `${link.href}?${linkQuery}` : link.href;
                const Icon = link.icon;

                return (
                    <Link key={link.href} href={href} className={linkClass(active)}>
                        <Icon className="size-3.5 shrink-0" />
                        {t[link.labelKey]}
                    </Link>
                );
            })}

            {isAccountDetail && (
                <span className={linkClass(true)}>
                    <BarChart3 className="size-3.5 shrink-0" />
                    {t.subnavAccountDetail}
                </span>
            )}
        </ScrollableSubnav>
    );
}
