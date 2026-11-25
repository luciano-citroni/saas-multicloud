'use client';

import { formatTagLabel } from '@/components/root/inventory/inventory-tag-utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type InventoryTagListProps = {
    tags?: Record<string, string>;
    max?: number;
    className?: string;
    /** Compact single-line preview (e.g. under name on mobile). */
    compact?: boolean;
};

function TagChip({ tagKey, value }: { tagKey: string; value: string }) {
    const label = formatTagLabel(tagKey, value);
    const displayValue = value.trim() || '—';

    return (
        <span
            title={label}
            className="inline-flex max-w-[14rem] min-w-0 items-stretch overflow-hidden rounded-md border border-border/80 bg-background text-[11px] leading-none shadow-xs"
        >
            <span className="max-w-[6.5rem] truncate bg-muted/60 px-1.5 py-1 font-medium text-muted-foreground">
                {tagKey.trim()}
            </span>
            <span className="max-w-[8rem] truncate px-1.5 py-1 font-medium text-foreground">{displayValue}</span>
        </span>
    );
}

function TagRows({ entries }: { entries: [string, string][] }) {
    return (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-0.5">
            {entries.map(([key, value]) => (
                <li
                    key={`${key}:${value}`}
                    className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-2 rounded-md border border-border/70 bg-muted/30 px-2 py-1.5"
                >
                    <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground" title={key}>
                        {key}
                    </span>
                    <span className="min-w-0 break-all text-[11px] font-medium text-foreground" title={value || '—'}>
                        {value.trim() || '—'}
                    </span>
                </li>
            ))}
        </ul>
    );
}

export function InventoryTagList({ tags, max = 2, className, compact = false }: InventoryTagListProps) {
    const t = useTranslations('inventory');
    const entries = Object.entries(tags ?? {}).filter(([key]) => key.trim().length > 0);

    if (entries.length === 0) {
        return <span className="text-muted-foreground">—</span>;
    }

    const shown = entries.slice(0, max);
    const remaining = entries.length - shown.length;

    if (compact) {
        const preview = shown.map(([key, value]) => formatTagLabel(key, value)).join(' · ');
        return (
            <div className={cn('min-w-0', className)}>
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="max-w-full truncate text-left text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            title={entries.map(([k, v]) => formatTagLabel(k, v)).join(', ')}
                        >
                            {preview}
                            {remaining > 0 ? ` · +${remaining}` : ''}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-3">
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                            <p className="text-xs font-medium">{t.colTags}</p>
                            <p className="text-[11px] text-muted-foreground">
                                {entries.length} {t.tagsCountLabel}
                            </p>
                        </div>
                        <TagRows entries={entries} />
                    </PopoverContent>
                </Popover>
            </div>
        );
    }

    return (
        <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}>
            {shown.map(([key, value]) => (
                <TagChip key={`${key}:${value}`} tagKey={key} value={value} />
            ))}
            {remaining > 0 ? (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground"
                            aria-label={t.tagsMoreAria.replace('{count}', String(remaining))}
                        >
                            +{remaining}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-3">
                        <div className="mb-2 flex items-baseline justify-between gap-2">
                            <p className="text-xs font-medium">{t.colTags}</p>
                            <p className="text-[11px] text-muted-foreground">
                                {entries.length} {t.tagsCountLabel}
                            </p>
                        </div>
                        <TagRows entries={entries} />
                    </PopoverContent>
                </Popover>
            ) : null}
        </div>
    );
}
