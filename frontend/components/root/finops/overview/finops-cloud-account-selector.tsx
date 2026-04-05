'use client';

import { Check, ChevronLeft, ChevronRight, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OrganizationCloudAccount } from '@/app/actions/organization';

const SELECTED_ACCOUNT_STORAGE_KEY = 'smc_finops_selected_account';

type FinopsCloudAccountSelectorProps = {
    cloudAccounts: OrganizationCloudAccount[];
    selectedAccountId: string | null;
    onAccountChange: (accountId: string) => void;
};

function providerStyles(provider: string) {
    const normalizedProvider = provider.trim().toLowerCase();

    if (normalizedProvider === 'aws') {
        return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    }

    if (normalizedProvider === 'azure') {
        return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    }

    return 'border-muted bg-muted/40 text-muted-foreground';
}

export function FinopsCloudAccountSelector({ cloudAccounts, selectedAccountId, onAccountChange }: FinopsCloudAccountSelectorProps) {
    if (cloudAccounts.length === 0) {
        return null;
    }

    const isMultipleAccounts = cloudAccounts.length > 1;
    const selectedAccount = cloudAccounts.find((account) => account.id === selectedAccountId) ?? cloudAccounts[0];
    const selectedIndex = Math.max(
        0,
        cloudAccounts.findIndex((account) => account.id === selectedAccount.id)
    );

    const handleAccountChange = (accountId: string) => {
        onAccountChange(accountId);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(SELECTED_ACCOUNT_STORAGE_KEY, accountId);
        }
    };

    const handleStep = (direction: 'previous' | 'next') => {
        if (!isMultipleAccounts) return;

        const offset = direction === 'next' ? 1 : -1;
        const nextIndex = (selectedIndex + offset + cloudAccounts.length) % cloudAccounts.length;
        const nextAccount = cloudAccounts[nextIndex];

        if (!nextAccount) return;
        handleAccountChange(nextAccount.id);
    };

    return (
        <section className="rounded-2xl border bg-card/70 p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        <Cloud className="size-3.5" />
                        Conta do dashboard
                    </div>
                    <p className="text-sm text-muted-foreground">Selecione qual conta será usada para métricas, anomalias e recomendações.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('border', providerStyles(selectedAccount.provider))}>
                        {selectedAccount.provider.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">{cloudAccounts.length} contas</Badge>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="shrink-0 rounded-xl"
                    disabled={!isMultipleAccounts}
                    onClick={() => handleStep('previous')}
                    aria-label="Conta anterior"
                >
                    <ChevronLeft className="size-4" />
                </Button>

                <Select value={selectedAccount.id} onValueChange={handleAccountChange}>
                    <SelectTrigger className="h-12 flex-1 rounded-xl">
                        <SelectValue placeholder="Selecionar conta" />
                    </SelectTrigger>
                    <SelectContent>
                        {cloudAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                                <div className="flex min-w-0 items-center gap-2">
                                    <span
                                        className={cn('inline-block size-2 rounded-full', account.isActive ? 'bg-emerald-500' : 'bg-muted-foreground')}
                                    />
                                    <span className="truncate font-medium">{account.alias}</span>
                                    <span className="text-xs text-muted-foreground">{account.provider.toUpperCase()}</span>
                                    {account.id === selectedAccount.id ? <Check className="size-3.5 text-primary" /> : null}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="shrink-0 rounded-xl"
                    disabled={!isMultipleAccounts}
                    onClick={() => handleStep('next')}
                    aria-label="Próxima conta"
                >
                    <ChevronRight className="size-4" />
                </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline" className="max-w-full truncate">
                    Conta ativa: {selectedAccount.alias}
                </Badge>
                <Badge variant="outline" className={cn('border', providerStyles(selectedAccount.provider))}>
                    Provider: {selectedAccount.provider.toUpperCase()}
                </Badge>
                <Badge variant="outline">Status: {selectedAccount.isActive ? 'ativa' : 'inativa'}</Badge>
            </div>
        </section>
    );
}
