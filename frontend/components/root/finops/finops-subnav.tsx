'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { BarChart3, Cloud, FileText, LayoutDashboard, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
    { href: '/finops', label: 'Visão geral', icon: LayoutDashboard, match: (path: string) => path === '/finops' },
    {
        href: '/finops/multicloud',
        label: 'Multicloud',
        icon: Cloud,
        match: (path: string) => path.startsWith('/finops/multicloud'),
    },
    {
        href: '/finops/budgets',
        label: 'Orçamentos',
        icon: Target,
        match: (path: string) => path.startsWith('/finops/budgets'),
    },
    {
        href: '/finops/reports',
        label: 'Relatórios',
        icon: FileText,
        match: (path: string) => path.startsWith('/finops/reports'),
    },
] as const;

type FinopsSubnavProps = {
    className?: string;
};

export function FinopsSubnav({ className }: FinopsSubnavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const preserveKeys = ['period', 'account', 'provider', 'service'] as const;
    const preserved = new URLSearchParams();
    for (const key of preserveKeys) {
        const value = searchParams.get(key);
        if (value) preserved.set(key, value);
    }
    const query = preserved.toString();

    const isAccountDetail = pathname.startsWith('/finops/accounts/');

    return (
        <nav
            aria-label="Navegação FinOps"
            className={cn(
                'inline-flex w-fit max-w-full flex-wrap items-center rounded-lg border border-border p-0.5',
                className
            )}
        >
            {LINKS.map((link) => {
                const active = link.match(pathname);
                const linkParams = new URLSearchParams(preserved);
                // Sentinel de escopo org só faz sentido na listagem de orçamentos.
                if (link.href !== '/finops/budgets' && linkParams.get('account') === 'organization') {
                    linkParams.delete('account');
                }
                const linkQuery = linkParams.toString();
                const href = linkQuery ? `${link.href}?${linkQuery}` : link.href;
                const Icon = link.icon;

                return (
                    <Link
                        key={link.href}
                        href={href}
                        className={cn(
                            'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                            active
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:bg-transparent hover:text-foreground'
                        )}
                    >
                        <Icon className="size-3.5 shrink-0" />
                        {link.label}
                    </Link>
                );
            })}

            {isAccountDetail && (
                <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2.5 text-sm font-medium text-foreground">
                    <BarChart3 className="size-3.5 shrink-0" />
                    Análise por conta
                </span>
            )}
        </nav>
    );
}
