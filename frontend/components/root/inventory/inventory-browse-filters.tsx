'use client';

import { useState } from 'react';
import { Filter, RotateCcw, X } from 'lucide-react';
import { MobileFiltersDrawer } from '@/components/root/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

type InventoryBrowseFiltersProps = {
    name: string;
    resourceType: string;
    region: string;
    tag: string;
    resourceTypeOptions: string[];
    regionOptions: string[];
    tagOptions: string[];
    onNameChange: (name: string) => void;
    onResourceTypeChange: (resourceType: string) => void;
    onRegionChange: (region: string) => void;
    onTagChange: (tag: string) => void;
    onClear: () => void;
    className?: string;
};

function FilterFields({
    name,
    resourceType,
    region,
    tag,
    resourceTypeOptions,
    regionOptions,
    tagOptions,
    onNameChange,
    onResourceTypeChange,
    onRegionChange,
    onTagChange,
    compact = false,
}: {
    name: string;
    resourceType: string;
    region: string;
    tag: string;
    resourceTypeOptions: string[];
    regionOptions: string[];
    tagOptions: string[];
    onNameChange: (name: string) => void;
    onResourceTypeChange: (resourceType: string) => void;
    onRegionChange: (region: string) => void;
    onTagChange: (tag: string) => void;
    compact?: boolean;
}) {
    const t = useTranslations('inventory');
    const tCommon = useTranslations('common');

    return (
        <div
            className={cn(
                'grid grid-cols-1 items-end gap-3',
                compact ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-4',
            )}
        >
            <SearchableSelect
                mode="single"
                label={t.resourceType}
                value={resourceType}
                options={[
                    { value: '', label: t.allTypes },
                    ...resourceTypeOptions.map((item) => ({ value: item, label: item })),
                ]}
                onValueChange={onResourceTypeChange}
                searchPlaceholder={t.browseSearchPlaceholder}
                placeholder={t.allTypes}
            />
            <SearchableSelect
                mode="single"
                label={t.region}
                value={region}
                options={[
                    { value: '', label: t.allRegions },
                    ...regionOptions.map((item) => ({ value: item, label: item })),
                ]}
                onValueChange={onRegionChange}
                searchPlaceholder={tCommon.search}
                placeholder={t.allRegions}
            />
            <SearchableSelect
                mode="single"
                label={t.filterTag}
                value={tag}
                options={[
                    { value: '', label: t.allTags },
                    ...tagOptions.map((item) => ({ value: item, label: item })),
                ]}
                onValueChange={onTagChange}
                searchPlaceholder={tCommon.search}
                placeholder={t.allTags}
            />
            <div className="space-y-1.5">
                <Label htmlFor="inventory-browse-name">{t.filterName}</Label>
                <Input
                    id="inventory-browse-name"
                    value={name}
                    onChange={(event) => onNameChange(event.target.value)}
                    placeholder={t.filterNamePlaceholder}
                    className="w-full"
                />
            </div>
        </div>
    );
}

export function InventoryBrowseFilters({
    name,
    resourceType,
    region,
    tag,
    resourceTypeOptions,
    regionOptions,
    tagOptions,
    onNameChange,
    onResourceTypeChange,
    onRegionChange,
    onTagChange,
    onClear,
    className,
}: InventoryBrowseFiltersProps) {
    const t = useTranslations('inventory');
    const [drawerOpen, setDrawerOpen] = useState(false);

    const chips = [
        resourceType
            ? {
                  key: 'type',
                  label: `${t.resourceType}: ${resourceType}`,
                  onClear: () => onResourceTypeChange(''),
              }
            : null,
        region
            ? {
                  key: 'region',
                  label: `${t.region}: ${region}`,
                  onClear: () => onRegionChange(''),
              }
            : null,
        tag
            ? {
                  key: 'tag',
                  label: `${t.filterTag}: ${tag}`,
                  onClear: () => onTagChange(''),
              }
            : null,
        name
            ? {
                  key: 'name',
                  label: `${t.filterName}: ${name}`,
                  onClear: () => onNameChange(''),
              }
            : null,
    ].filter(Boolean) as Array<{ key: string; label: string; onClear: () => void }>;

    const hasActiveFilters = chips.length > 0;

    return (
        <div className={cn('space-y-3', className)}>
            <div className="hidden lg:block">
                <div className="rounded-lg border p-4">
                    <FilterFields
                        name={name}
                        resourceType={resourceType}
                        region={region}
                        tag={tag}
                        resourceTypeOptions={resourceTypeOptions}
                        regionOptions={regionOptions}
                        tagOptions={tagOptions}
                        onNameChange={onNameChange}
                        onResourceTypeChange={onResourceTypeChange}
                        onRegionChange={onRegionChange}
                        onTagChange={onTagChange}
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
                    description={t.browseFiltersDescription}
                    triggerLabel={t.filters}
                    applyLabel={t.applyFilters}
                    activeCount={chips.length}
                >
                    <FilterFields
                        name={name}
                        resourceType={resourceType}
                        region={region}
                        tag={tag}
                        resourceTypeOptions={resourceTypeOptions}
                        regionOptions={regionOptions}
                        tagOptions={tagOptions}
                        onNameChange={onNameChange}
                        onResourceTypeChange={onResourceTypeChange}
                        onRegionChange={onRegionChange}
                        onTagChange={onTagChange}
                        compact
                    />
                </MobileFiltersDrawer>

                {hasActiveFilters ? (
                    <div className="flex flex-wrap items-center gap-2">
                        {chips.map((chip) => (
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
