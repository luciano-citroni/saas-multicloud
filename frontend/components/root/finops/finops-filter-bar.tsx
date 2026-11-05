'use client';

import { useMemo, useState } from 'react';
import { Filter, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { OrganizationCloudAccount } from '@/app/actions/organization';
import type { DashboardPeriod } from '@/components/root/finops/overview/types';
import {
    ACCOUNT_FILTER_ALL,
    DASHBOARD_PERIODS,
    PROVIDER_FILTER_ALL,
    SERVICE_FILTER_ALL,
    periodLabel,
} from '@/components/root/finops/finops-filter-utils';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

type FinopsFilterBarProps = {
    period: DashboardPeriod;
    accountId: string | null;
    provider: string | null;
    service: string | null;
    cloudAccounts: OrganizationCloudAccount[];
    serviceOptions: string[];
    sidebarAccountId?: string | null;
    onPeriodChange: (period: DashboardPeriod) => void;
    onAccountChange: (accountId: string | null) => void;
    onProviderChange: (provider: string | null) => void;
    onServiceChange: (service: string | null) => void;
    onClear: () => void;
    className?: string;
};

function FilterFields({
    period,
    accountId,
    provider,
    service,
    cloudAccounts,
    serviceOptions,
    providers,
    onPeriodChange,
    onAccountChange,
    onProviderChange,
    onServiceChange,
}: {
    period: DashboardPeriod;
    accountId: string | null;
    provider: string | null;
    service: string | null;
    cloudAccounts: OrganizationCloudAccount[];
    serviceOptions: string[];
    providers: string[];
    onPeriodChange: (period: DashboardPeriod) => void;
    onAccountChange: (accountId: string | null) => void;
    onProviderChange: (provider: string | null) => void;
    onServiceChange: (service: string | null) => void;
}) {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t.budgetPeriod}</label>
                <Select value={period} onValueChange={(value) => onPeriodChange(value as DashboardPeriod)}>
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {DASHBOARD_PERIODS.map((item) => (
                            <SelectItem key={item} value={item}>
                                {periodLabel(item)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t.accountScope}</label>
                <Select
                    value={accountId ?? ACCOUNT_FILTER_ALL}
                    onValueChange={(value) => onAccountChange(value === ACCOUNT_FILTER_ALL ? null : value)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={t.allAccounts} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ACCOUNT_FILTER_ALL}>{t.allAccounts}</SelectItem>
                        {cloudAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                                {`${account.alias} (${account.provider.toUpperCase()})`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t.providerLabel}</label>
                <Select
                    value={provider ?? PROVIDER_FILTER_ALL}
                    onValueChange={(value) => onProviderChange(value === PROVIDER_FILTER_ALL ? null : value)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={tCommon.all} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={PROVIDER_FILTER_ALL}>{t.filterAllProviders}</SelectItem>
                        {providers.map((item) => (
                            <SelectItem key={item} value={item}>
                                {item.toUpperCase()}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t.filterService}</label>
                <Select
                    value={service ?? SERVICE_FILTER_ALL}
                    onValueChange={(value) => onServiceChange(value === SERVICE_FILTER_ALL ? null : value)}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={tCommon.all} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={SERVICE_FILTER_ALL}>{t.filterAllServices}</SelectItem>
                        {serviceOptions.map((item) => (
                            <SelectItem key={item} value={item}>
                                {item}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

export function FinopsFilterBar({
    period,
    accountId,
    provider,
    service,
    cloudAccounts,
    serviceOptions,
    sidebarAccountId,
    onPeriodChange,
    onAccountChange,
    onProviderChange,
    onServiceChange,
    onClear,
    className,
}: FinopsFilterBarProps) {
    const t = useTranslations('finops');
    const [sheetOpen, setSheetOpen] = useState(false);

    const providers = useMemo(() => {
        const set = new Set<string>();
        for (const account of cloudAccounts) {
            const value = (account.provider ?? '').trim().toLowerCase();
            if (value) set.add(value);
        }
        return Array.from(set).sort();
    }, [cloudAccounts]);

    const accountAlias = accountId
        ? (cloudAccounts.find((account) => account.id === accountId)?.alias ?? accountId.slice(0, 8))
        : null;

    const activeChips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (period !== 'lastmonth') {
        activeChips.push({ key: 'period', label: periodLabel(period), onClear: () => onPeriodChange('lastmonth') });
    }
    if (accountId) {
        activeChips.push({ key: 'account', label: t.filterChipAccount.replace('{value}', accountAlias ?? ''), onClear: () => onAccountChange(null) });
    }
    if (provider) {
        activeChips.push({
            key: 'provider',
            label: t.filterChipProvider.replace('{value}', provider.toUpperCase()),
            onClear: () => onProviderChange(null),
        });
    }
    if (service) {
        activeChips.push({ key: 'service', label: t.filterChipService.replace('{value}', service), onClear: () => onServiceChange(null) });
    }

    const hasActiveFilters = activeChips.length > 0;

    const sidebarAccount = sidebarAccountId
        ? cloudAccounts.find((account) => account.id === sidebarAccountId)
        : null;

    return (
        <section className={cn('space-y-3 rounded-xl border bg-card/60 p-3 sm:p-4', className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Filter className="size-4 text-muted-foreground" />
                    {t.filtersTitle}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {sidebarAccount && accountId !== sidebarAccount.id && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onAccountChange(sidebarAccount.id)}
                        >
                            {t.filterUseSidebarAccount}
                        </Button>
                    )}

                    {hasActiveFilters && (
                        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
                            <RotateCcw className="size-3.5" />
                            {t.clearFilters}
                        </Button>
                    )}

                    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                        <SheetTrigger asChild>
                            <Button type="button" size="sm" variant="outline" className="lg:hidden">
                                <Filter className="size-3.5" />
                                {t.filterAdjust}
                                {hasActiveFilters ? ` (${activeChips.length})` : ''}
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
                            <SheetHeader>
                                <SheetTitle>{t.filterSheetTitle}</SheetTitle>
                            </SheetHeader>
                            <div className="mt-4 space-y-4 pb-6">
                                <FilterFields
                                    period={period}
                                    accountId={accountId}
                                    provider={provider}
                                    service={service}
                                    cloudAccounts={cloudAccounts}
                                    serviceOptions={serviceOptions}
                                    providers={providers}
                                    onPeriodChange={(value) => {
                                        onPeriodChange(value);
                                    }}
                                    onAccountChange={onAccountChange}
                                    onProviderChange={onProviderChange}
                                    onServiceChange={onServiceChange}
                                />
                                <Button type="button" className="w-full" onClick={() => setSheetOpen(false)}>
                                    {t.filterApply}
                                </Button>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            <div className="hidden lg:block">
                <FilterFields
                    period={period}
                    accountId={accountId}
                    provider={provider}
                    service={service}
                    cloudAccounts={cloudAccounts}
                    serviceOptions={serviceOptions}
                    providers={providers}
                    onPeriodChange={onPeriodChange}
                    onAccountChange={onAccountChange}
                    onProviderChange={onProviderChange}
                    onServiceChange={onServiceChange}
                />
            </div>

            {hasActiveFilters && (
                <div className="flex flex-wrap gap-2">
                    {activeChips.map((chip) => (
                        <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
                            {chip.label}
                            <button
                                type="button"
                                className="rounded-full p-0.5 hover:bg-muted"
                                onClick={chip.onClear}
                                aria-label={t.filterRemove.replace('{label}', chip.label)}
                            >
                                <X className="size-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
        </section>
    );
}
