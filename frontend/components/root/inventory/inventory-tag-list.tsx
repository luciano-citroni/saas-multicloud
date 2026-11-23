'use client';

import { formatTagLabel } from '@/components/root/inventory/inventory-tag-utils';
import { cn } from '@/lib/utils';

type InventoryTagListProps = {
    tags?: Record<string, string>;
    max?: number;
    className?: string;
};

export function InventoryTagList({ tags, max = 3, className }: InventoryTagListProps) {
    const entries = Object.entries(tags ?? {}).filter(([key]) => key.trim().length > 0);
    if (entries.length === 0) {
        return <span className="text-muted-foreground">—</span>;
    }

    const shown = entries.slice(0, max);
    const remaining = entries.length - shown.length;

    return (
        <div className={cn('flex min-w-0 flex-wrap gap-1.5', className)}>
            {shown.map(([key, value]) => {
                const label = formatTagLabel(key, value);
                return (
                    <span
                        key={`${key}:${value}`}
                        title={label}
                        className="inline-flex max-w-full items-center truncate rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px] leading-tight text-foreground"
                    >
                        <span className="truncate text-muted-foreground">{key.trim()}</span>
                        <span className="shrink-0 px-1 text-muted-foreground">:</span>
                        <span className="truncate font-medium">{value.trim() || '—'}</span>
                    </span>
                );
            })}
            {remaining > 0 ? (
                <span className="text-[11px] text-muted-foreground">+{remaining}</span>
            ) : null}
        </div>
    );
}
