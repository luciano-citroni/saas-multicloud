'use client';

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
        <div className={cn('flex min-w-0 flex-col gap-1', className)}>
            {shown.map(([key, value]) => (
                <div
                    key={`${key}:${value}`}
                    className="grid min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-baseline gap-2 text-xs"
                    title={`${key}: ${value}`}
                >
                    <span className="truncate text-muted-foreground">{key}</span>
                    <span className="truncate font-medium text-foreground">{value || '—'}</span>
                </div>
            ))}
            {remaining > 0 ? (
                <span className="text-[11px] text-muted-foreground">+{remaining}</span>
            ) : null}
        </div>
    );
}
