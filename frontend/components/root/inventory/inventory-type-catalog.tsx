'use client';

import { useMemo, useState } from 'react';
import { Boxes, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatNumber, useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type InventoryTypeCatalogProps = {
    byType: Record<string, number>;
    selectedType: string | null;
    onSelect: (resourceType: string) => void;
    isLoading?: boolean;
};

function matchesTypeQuery(resourceType: string, query: string): boolean {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    const haystack = resourceType.toLowerCase();
    if (haystack.includes(normalized)) return true;
    // Allow shortcuts like "ec2", "s3", "vm", "rds"
    const compact = haystack.replace(/[\s_-]+/g, '');
    const queryCompact = normalized.replace(/[\s_-]+/g, '');
    return compact.includes(queryCompact);
}

export function InventoryTypeCatalog({
    byType,
    selectedType,
    onSelect,
    isLoading = false,
}: InventoryTypeCatalogProps) {
    const t = useTranslations('inventory');
    const [query, setQuery] = useState('');

    const types = useMemo(() => {
        return Object.entries(byType)
            .map(([resourceType, count]) => ({ resourceType, count }))
            .filter((item) => matchesTypeQuery(item.resourceType, query))
            .sort((a, b) => b.count - a.count || a.resourceType.localeCompare(b.resourceType));
    }, [byType, query]);

    return (
        <div className="space-y-3">
            <div className="relative max-w-md">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t.browseSearchPlaceholder}
                    className="pl-9"
                    aria-label={t.browseSearchPlaceholder}
                />
            </div>

            {isLoading ? (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">{t.loading}</div>
            ) : types.length === 0 ? (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                    {query ? t.browseNoTypesMatch : t.browseEmpty}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {types.map((item) => {
                        const active = selectedType === item.resourceType;
                        return (
                            <button
                                key={item.resourceType}
                                type="button"
                                onClick={() => onSelect(item.resourceType)}
                                className={cn(
                                    'flex min-w-0 flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
                                    active
                                        ? 'border-primary bg-primary/5'
                                        : 'hover:bg-muted/40',
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    <Boxes className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 truncate text-sm font-medium">
                                        {item.resourceType}
                                    </span>
                                </div>
                                <p className="text-2xl font-semibold tracking-tight">
                                    {formatNumber(item.count)}
                                </p>
                                <p className="text-xs text-muted-foreground">{t.browseItemsLabel}</p>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
