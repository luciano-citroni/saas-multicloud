'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tone = 'ok' | 'near' | 'full';

export function usageTone(used: number, limit: number | null | undefined): Tone {
    if (limit == null || limit <= 0) return 'ok';
    if (used >= limit) return 'full';
    if (used / limit >= 0.8) return 'near';
    return 'ok';
}

export function usagePercent(used: number, limit: number | null | undefined): number | null {
    if (limit == null || limit <= 0) return null;
    return Math.min(100, Math.max(0, (used / limit) * 100));
}

export function UsageMeter({
    label,
    used,
    limit,
    unlimitedLabel,
    usedOfLabel,
    remainingLabel,
    percentLabel,
    nearLabel,
    atLimitLabel,
    formatValue,
}: {
    label: string;
    used: number;
    limit: number | null | undefined;
    unlimitedLabel: string;
    usedOfLabel: (used: string, limit: string) => string;
    remainingLabel: (remaining: string) => string;
    percentLabel: (percent: string) => string;
    nearLabel: string;
    atLimitLabel: string;
    formatValue: (value: number) => string;
}) {
    const tone = usageTone(used, limit);
    const percent = usagePercent(used, limit);
    const remaining = limit != null ? Math.max(0, limit - used) : null;

    return (
        <div className="space-y-2 rounded-lg border border-border/70 p-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs font-medium">{label}</p>
                {tone === 'full' ? <Badge variant="destructive">{atLimitLabel}</Badge> : null}
                {tone === 'near' ? (
                    <Badge className="border-transparent bg-warning text-warning-foreground">{nearLabel}</Badge>
                ) : null}
            </div>

            <div className="flex items-end justify-between gap-2">
                <p className="text-sm font-semibold tabular-nums">
                    {limit == null
                        ? `${formatValue(used)} · ${unlimitedLabel}`
                        : usedOfLabel(formatValue(used), formatValue(limit))}
                </p>
                {percent != null ? (
                    <p className="text-muted-foreground text-xs tabular-nums">
                        {percentLabel(percent.toFixed(0))}
                    </p>
                ) : null}
            </div>

            <div className="bg-muted h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
                <div
                    className={cn(
                        'h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none',
                        tone === 'ok' && 'bg-primary',
                        tone === 'near' && 'bg-warning',
                        tone === 'full' && 'bg-destructive',
                    )}
                    style={{ width: `${percent ?? 0}%` }}
                />
            </div>

            {remaining != null ? (
                <p className="text-muted-foreground text-xs">{remainingLabel(formatValue(remaining))}</p>
            ) : (
                <p className="text-muted-foreground text-xs">{unlimitedLabel}</p>
            )}
        </div>
    );
}
