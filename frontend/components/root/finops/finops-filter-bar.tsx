'use client';

import { useMemo, useState } from 'react';
import { Filter, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { OrganizationCloudAccount } from '@/app/actions/organization';
import type { DashboardPeriod } from '@/components/root/finops/overview/types';
import {
    DASHBOARD_PERIODS,
    periodLabel,
} from '@/components/root/finops/finops-filter-utils';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

type FinopsFilterBarProps = {
    period: DashboardPeriod;
    accountIds: string[];
    providers: string[];
    services: string[];
    cloudAccounts: OrganizationCloudAccount[];
    serviceOptions: string[];
    sidebarAccountId?: string | null;
    /** Quando false, esconde o filtro de serviço (ex.: commitments). */
    showServiceFilter?: boolean;
    onPeriodChange: (period: DashboardPeriod) => void;
    onAccountsChange: (accountIds: string[]) => void;
    onProvidersChange: (providers: string[]) => void;
    onServicesChange: (services: string[]) => void;
    onClear: () => void;
    className?: string;
};

function FilterFields({
    period,
    accountIds,
    providers,
    services,
    cloudAccounts,
    serviceOptions,
    providerOptions,
    showServiceFilter,
    onPeriodChange,
    onAccountsChange,
    onProvidersChange,
    onServicesChange,
}: {
    period: DashboardPeriod;
    accountIds: string[];
    providers: string[];
    services: string[];
    cloudAccounts: OrganizationCloudAccount[];
    serviceOptions: string[];
    providerOptions: string[];
    showServiceFilter: boolean;
    onPeriodChange: (period: DashboardPeriod) => void;
    onAccountsChange: (accountIds: string[]) => void;
    onProvidersChange: (providers: string[]) => void;
    onServicesChange: (services: string[]) => void;
}) {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');

    const periodOptions = DASHBOARD_PERIODS.map((item) => ({
        value: item,
        label: periodLabel(item),
    }));

    const accountOptions = cloudAccounts.map((account) => ({
        value: account.id,
        label: `${account.alias} (${account.provider.toUpperCase()})`,
    }));

    const providerSelectOptions = providerOptions.map((item) => ({
        value: item,
        label: item.toUpperCase(),
    }));

    const serviceSelectOptions = serviceOptions.map((item) => ({
        value: item,
        label: item,
    }));

    return (
        <div
            className={cn(
                'grid grid-cols-1 items-end gap-3 sm:grid-cols-2',
                showServiceFilter ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
            )}
        >
            <SearchableSelect
                mode="single"
                label={t.budgetPeriod}
                value={period}
                options={periodOptions}
                searchPlaceholder={tCommon.search}
                emptyText={t.filterSearchEmpty}
                clearLabel={t.clearFilters}
                onValueChange={(value) => onPeriodChange(value as DashboardPeriod)}
            />

            <SearchableSelect
                label={t.accountScope}
                allLabel={t.allAccounts}
                value={accountIds}
                options={accountOptions}
                searchPlaceholder={tCommon.search}
                emptyText={t.filterSearchEmpty}
                clearLabel={t.clearFilters}
                selectedCountLabel={t.filterSelectedCount}
                onValueChange={onAccountsChange}
            />

            <SearchableSelect
                label={t.providerLabel}
                allLabel={t.filterAllProviders}
                value={providers}
                options={providerSelectOptions}
                searchPlaceholder={tCommon.search}
                emptyText={t.filterSearchEmpty}
                clearLabel={t.clearFilters}
                selectedCountLabel={t.filterSelectedCount}
                onValueChange={onProvidersChange}
            />

            {showServiceFilter ? (
                <SearchableSelect
                    label={t.filterService}
                    allLabel={t.filterAllServices}
                    value={services}
                    options={serviceSelectOptions}
                    searchPlaceholder={tCommon.search}
                    emptyText={t.filterSearchEmpty}
                    clearLabel={t.clearFilters}
                    selectedCountLabel={t.filterSelectedCount}
                    onValueChange={onServicesChange}
                />
            ) : null}
        </div>
    );
}

export function FinopsFilterBar({
    period,
    accountIds,
    providers,
    services,
    cloudAccounts,
    serviceOptions,
    sidebarAccountId,
    showServiceFilter = true,
    onPeriodChange,
    onAccountsChange,
    onProvidersChange,
    onServicesChange,
    onClear,
    className,
}: FinopsFilterBarProps) {
    const t = useTranslations('finops');
    const [sheetOpen, setSheetOpen] = useState(false);

    const providerOptions = useMemo(() => {
        const set = new Set<string>();
        for (const account of cloudAccounts) {
            const value = (account.provider ?? '').trim().toLowerCase();
            if (value) set.add(value);
        }
        return Array.from(set).sort();
    }, [cloudAccounts]);

    const accountLabel = (id: string) =>
        cloudAccounts.find((account) => account.id === id)?.alias ?? id.slice(0, 8);

    const activeChips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (period !== 'lastmonth') {
        activeChips.push({ key: 'period', label: periodLabel(period), onClear: () => onPeriodChange('lastmonth') });
    }
    for (const id of accountIds) {
        activeChips.push({
            key: `account-${id}`,
            label: t.filterChipAccount.replace('{value}', accountLabel(id)),
            onClear: () => onAccountsChange(accountIds.filter((item) => item !== id)),
        });
    }
    for (const provider of providers) {
        activeChips.push({
            key: `provider-${provider}`,
            label: t.filterChipProvider.replace('{value}', provider.toUpperCase()),
            onClear: () => onProvidersChange(providers.filter((item) => item !== provider)),
        });
    }
    for (const service of services) {
        activeChips.push({
            key: `service-${service}`,
            label: t.filterChipService.replace('{value}', service),
            onClear: () => onServicesChange(services.filter((item) => item !== service)),
        });
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
                    {sidebarAccount && !accountIds.includes(sidebarAccount.id) && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onAccountsChange([...accountIds, sidebarAccount.id])}
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
                                    accountIds={accountIds}
                                    providers={providers}
                                    services={services}
                                    cloudAccounts={cloudAccounts}
                                    serviceOptions={serviceOptions}
                                    providerOptions={providerOptions}
                                    showServiceFilter={showServiceFilter}
                                    onPeriodChange={onPeriodChange}
                                    onAccountsChange={onAccountsChange}
                                    onProvidersChange={onProvidersChange}
                                    onServicesChange={onServicesChange}
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
                    accountIds={accountIds}
                    providers={providers}
                    services={services}
                    cloudAccounts={cloudAccounts}
                    serviceOptions={serviceOptions}
                    providerOptions={providerOptions}
                    showServiceFilter={showServiceFilter}
                    onPeriodChange={onPeriodChange}
                    onAccountsChange={onAccountsChange}
                    onProvidersChange={onProvidersChange}
                    onServicesChange={onServicesChange}
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
