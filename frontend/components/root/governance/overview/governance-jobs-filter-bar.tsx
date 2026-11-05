'use client';

import { Filter, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GovernanceJob } from '@/components/root/governance/overview/types';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const JOB_STATUS_FILTER_ALL = 'all' as const;

export type JobStatusFilter = typeof JOB_STATUS_FILTER_ALL | GovernanceJob['status'];

function useStatusOptions(): Array<{ value: JobStatusFilter; label: string }> {
    const tg = useTranslations('governance');

    return [
        { value: 'all', label: tg.statusAll },
        { value: 'completed', label: tg.statusCompleted },
        { value: 'running', label: tg.statusRunning },
        { value: 'pending', label: tg.statusPending },
        { value: 'failed', label: tg.statusFailed },
    ];
}

type GovernanceJobsFilterBarProps = {
    status: JobStatusFilter;
    onStatusChange: (status: JobStatusFilter) => void;
    onClear: () => void;
    className?: string;
};

export function GovernanceJobsFilterBar({ status, onStatusChange, onClear, className }: GovernanceJobsFilterBarProps) {
    const tg = useTranslations('governance');
    const tc = useTranslations('common');
    const statusOptions = useStatusOptions();
    const statusLabel = (value: JobStatusFilter) => statusOptions.find((option) => option.value === value)?.label ?? value;
    const hasActiveFilters = status !== JOB_STATUS_FILTER_ALL;

    return (
        <section className={cn('space-y-3 border-b px-4 py-3', className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Filter className="size-4 text-muted-foreground" />
                    {tg.filters}
                </div>

                {hasActiveFilters && (
                    <Button type="button" size="sm" variant="ghost" onClick={onClear}>
                        <RotateCcw className="size-3.5" />
                        {tg.clearFilters}
                    </Button>
                )}
            </div>

            <div className="grid gap-3 sm:max-w-xs">
                <div className="space-y-1.5">
                    <label htmlFor="governance-jobs-status" className="text-xs font-medium text-muted-foreground">
                        {tc.status}
                    </label>
                    <Select value={status} onValueChange={(value) => onStatusChange(value as JobStatusFilter)}>
                        <SelectTrigger id="governance-jobs-status" className="w-full">
                            <SelectValue placeholder={tg.statusAll} />
                        </SelectTrigger>
                        <SelectContent>
                            {statusOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {hasActiveFilters && (
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1 pr-1">
                        {tg.statusChip.replace('{status}', statusLabel(status))}
                        <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-muted"
                            onClick={() => onStatusChange(JOB_STATUS_FILTER_ALL)}
                            aria-label={tg.removeStatusFilter}
                        >
                            <X className="size-3" />
                        </button>
                    </Badge>
                </div>
            )}
        </section>
    );
}
