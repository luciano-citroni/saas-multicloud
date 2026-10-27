'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { OrgOverviewAccount } from '@/components/root/finops/overview/types';
import { Button } from '@/components/ui/button';

type FinopsAccountsStripProps = {
    accounts: OrgOverviewAccount[];
    currency: string;
    isLoading?: boolean;
};

function statusLabel(account: OrgOverviewAccount): string {
    if (account.finopsSupported === false) return 'Não suportado';
    if (account.isActive === false) return 'Inativa';
    if (account.hasConsent) return 'Ativa';
    return 'Sem consentimento';
}

export function FinopsAccountsStrip({ accounts, currency, isLoading = false }: FinopsAccountsStripProps) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-semibold">Contas</h3>
                    <p className="text-xs text-muted-foreground">Carregando contas do tenant…</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="h-36 animate-pulse rounded-xl border bg-muted" />
                    ))}
                </div>
            </div>
        );
    }

    if (accounts.length === 0) {
        return (
            <div className="rounded-xl border p-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma cloud account neste tenant</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-semibold">Contas ({accounts.length})</h3>
                <p className="text-xs text-muted-foreground">Todas as cloud accounts do tenant selecionado</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.map((account) => {
                    const supported = account.finopsSupported !== false;
                    const health =
                        !supported || account.isActive === false
                            ? 'neutral'
                            : account.openAnomalies > 0
                              ? 'attention'
                              : account.openRecs > 0
                                ? 'opportunity'
                                : 'ok';

                    return (
                        <div key={account.id} className="flex flex-col gap-3 rounded-xl border p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={cn(
                                                'size-2 shrink-0 rounded-full',
                                                health === 'attention' && 'bg-amber-500',
                                                health === 'opportunity' && 'bg-sky-500',
                                                health === 'ok' && 'bg-emerald-500',
                                                health === 'neutral' && 'bg-muted-foreground',
                                                !account.hasConsent && supported && account.isActive !== false && 'bg-muted-foreground'
                                            )}
                                        />
                                        <p className="truncate text-sm font-semibold">{account.alias}</p>
                                    </div>
                                    <p className="mt-0.5 text-[11px] uppercase text-muted-foreground">{account.provider}</p>
                                </div>
                                <span
                                    className={cn(
                                        'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                                        account.hasConsent && supported
                                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                            : 'bg-muted text-muted-foreground'
                                    )}
                                >
                                    {statusLabel(account)}
                                </span>
                            </div>

                            <div>
                                <p className="text-lg font-semibold">
                                    {supported ? formatCurrency(account.totalCost, currency) : '—'}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {supported
                                        ? `${account.openAnomalies} anomalias · ${account.openRecs} recomendações`
                                        : 'FinOps disponível para AWS, Azure e GCP'}
                                </p>
                            </div>

                            {supported ? (
                                <Button asChild size="sm" variant="outline" className="w-full justify-between">
                                    <Link href={`/finops/accounts/${encodeURIComponent(account.id)}`}>
                                        Abrir conta
                                        <ArrowRight className="size-4" />
                                    </Link>
                                </Button>
                            ) : (
                                <Button size="sm" variant="outline" className="w-full justify-between" disabled>
                                    Indisponível
                                    <ArrowRight className="size-4" />
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
