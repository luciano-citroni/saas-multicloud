'use client';

import { useMemo, useState } from 'react';
import { Filter, RotateCcw, X } from 'lucide-react';
import { MobileFiltersDrawer } from '@/components/root/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { InventoryPeriod } from '@/app/actions/cloud-inventory';
import { INVENTORY_PERIODS } from '@/components/root/inventory/inventory-filter-utils';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

type InventoryFilterBarProps = {
    period: InventoryPeriod;
    q: string;
    resourceType: string;
    region: string;
    resourceTypeOptions: string[];
    regionOptions: string[];
    onPeriodChange: (period: InventoryPeriod) => void;
    onQueryChange: (q: string) => void;
    onResourceTypeChange: (resourceType: string) => void;
    onRegionChange: (region: string) => void;
    onClear: () => void;
    className?: string;
};

function periodLabel(
    period: InventoryPeriod,
    labels: {
        last6months: string;
        last12months: string;
        ytd: string;
        all: string;
    },
) {
    return labels[period];
}

function FilterFields({
    period,
    q,
    resourceType,
    region,
    resourceTypeOptions,
    regionOptions,
    periodOptions,
    onPeriodChange,
    onQueryChange,
    onResourceTypeChange,
    onRegionChange,
    compact = false,
}: {
    period: InventoryPeriod;
    q: string;
    resourceType: string;
    region: string;
    resourceTypeOptions: string[];
    regionOptions: string[];
    periodOptions: Array<{ value: InventoryPeriod; label: string }>;
    onPeriodChange: (period: InventoryPeriod) => void;
    onQueryChange: (q: string) => void;
    onResourceTypeChange: (resourceType: string) => void;
    onRegionChange: (region: string) => void;
    compact?: boolean;
}) {
    const t = useTranslations('inventory');
    const tCommon = useTranslations('common');

    const typeOptions = [
        { value: '', label: t.allTypes },
        ...resourceTypeOptions.map((item) => ({ value: item, label: item })),
    ];
    const regionSelectOptions = [
        { value: '', label: t.allRegions },
        ...regionOptions.map((item) => ({ value: item, label: item })),
    ];

    return (
        <div
            className={cn(
                'grid grid-cols-1 items-end gap-3',
                compact ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-4',
            )}
        >
            <SearchableSelect
                mode="single"
                label={t.period}
                value={period}
                options={periodOptions}
                onValueChange={(value) => onPeriodChange((value as InventoryPeriod) || 'all')}
                searchPlaceholder={tCommon.search}
                placeholder={t.period}
            />
            <SearchableSelect
                mode="single"
                label={t.resourceType}
                value={resourceType}
                options={typeOptions}
                onValueChange={onResourceTypeChange}
                searchPlaceholder={tCommon.search}
                placeholder={t.allTypes}
            />
            <SearchableSelect
                mode="single"
                label={t.region}
                value={region}
                options={regionSelectOptions}
                onValueChange={onRegionChange}
                searchPlaceholder={tCommon.search}
                placeholder={t.allRegions}
            />
            <div className="space-y-1.5">
                <Label htmlFor="inventory-search">{t.search}</Label>
                <Input
                    id="inventory-search"
                    value={q}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="w-full"
                />
            </div>
        </div>
    );
}

export function InventoryFilterBar({
    period,
    q,
    resourceType,
    region,
    resourceTypeOptions,
    regionOptions,
    onPeriodChange,
    onQueryChange,
    onResourceTypeChange,
    onRegionChange,
    onClear,
    className,
}: InventoryFilterBarProps) {
    const t = useTranslations('inventory');
    const [drawerOpen, setDrawerOpen] = useState(false);

    const periodOptions = useMemo(
        () =>
            INVENTORY_PERIODS.map((item) => ({
                value: item,
                label: periodLabel(item, {
                    last6months: t.periodLast6Months,
                    last12months: t.periodLast12Months,
                    ytd: t.periodYtd,
                    all: t.periodAll,
                }),
            })),
        [t],
    );

    const activeChips = useMemo(() => {
        const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
        if (period !== 'all') {
            chips.push({
                key: 'period',
                label: `${t.period}: ${periodLabel(period, {
                    last6months: t.periodLast6Months,
                    last12months: t.periodLast12Months,
                    ytd: t.periodYtd,
                    all: t.periodAll,
                })}`,
                onClear: () => onPeriodChange('all'),
            });
        }
        if (resourceType) {
            chips.push({
                key: 'type',
                label: `${t.resourceType}: ${resourceType}`,
                onClear: () => onResourceTypeChange(''),
            });
        }
        if (region) {
            chips.push({
                key: 'region',
                label: `${t.region}: ${region}`,
                onClear: () => onRegionChange(''),
            });
        }
        if (q) {
            chips.push({
                key: 'q',
                label: `${t.search}: ${q}`,
                onClear: () => onQueryChange(''),
            });
        }
        return chips;
    }, [onPeriodChange, onQueryChange, onRegionChange, onResourceTypeChange, period, q, region, resourceType, t]);

    const hasActiveFilters = activeChips.length > 0;

    return (
        <div className={cn('space-y-3', className)}>
            <div className="hidden lg:block">
                <div className="rounded-lg border p-4">
                    <FilterFields
                        period={period}
                        q={q}
                        resourceType={resourceType}
                        region={region}
                        resourceTypeOptions={resourceTypeOptions}
                        regionOptions={regionOptions}
                        periodOptions={periodOptions}
                        onPeriodChange={onPeriodChange}
                        onQueryChange={onQueryChange}
                        onResourceTypeChange={onResourceTypeChange}
                        onRegionChange={onRegionChange}
                    />
                    {hasActiveFilters ? (
                        <div className="mt-3 flex justify-end">
                            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                                <RotateCcw className="size-4" />
                                {t.clearFilters}
                            </Button>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-col gap-2 lg:hidden">
                <MobileFiltersDrawer
                    open={drawerOpen}
                    onOpenChange={setDrawerOpen}
                    title={t.filters}
                    description={t.filtersDescription}
                    triggerLabel={t.filters}
                    applyLabel={t.applyFilters}
                    activeCount={activeChips.length}
                >
                    <FilterFields
                        period={period}
                        q={q}
                        resourceType={resourceType}
                        region={region}
                        resourceTypeOptions={resourceTypeOptions}
                        regionOptions={regionOptions}
                        periodOptions={periodOptions}
                        onPeriodChange={onPeriodChange}
                        onQueryChange={onQueryChange}
                        onResourceTypeChange={onResourceTypeChange}
                        onRegionChange={onRegionChange}
                        compact
                    />
                </MobileFiltersDrawer>

                {hasActiveFilters ? (
                    <div className="flex flex-wrap items-center gap-2">
                        {activeChips.map((chip) => (
                            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
                                <Filter className="size-3" />
                                <span className="max-w-40 truncate">{chip.label}</span>
                                <button
                                    type="button"
                                    className="rounded-sm p-0.5 hover:bg-muted"
                                    onClick={chip.onClear}
                                    aria-label={t.clearFilters}
                                >
                                    <X className="size-3" />
                                </button>
                            </Badge>
                        ))}
                        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                            <RotateCcw className="size-4" />
                            {t.clearFilters}
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
