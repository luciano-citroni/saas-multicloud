'use client';

import { useState } from 'react';
import { Filter, RotateCcw, X } from 'lucide-react';
import { MobileFiltersDrawer } from '@/components/root/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
    const [drawerOpen, setDrawerOpen] = useState(false);
    const statusLabel = (value: JobStatusFilter) => statusOptions.find((option) => option.value === value)?.label ?? value;
    const hasActiveFilters = status !== JOB_STATUS_FILTER_ALL;

    const statusField = (
        <SearchableSelect
            mode="single"
            id="governance-jobs-status"
            label={tc.status}
            value={status}
            options={statusOptions}
            searchPlaceholder={tc.search}
            clearLabel={tg.clearFilters}
            onValueChange={(value) => onStatusChange(value as JobStatusFilter)}
        />
    );

    return (
        <section className={cn('space-y-3 border-b px-4 py-3', className)}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <Filter className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{tg.filters}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {hasActiveFilters && (
                        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
                            <RotateCcw className="size-3.5" />
                            {tg.clearFilters}
                        </Button>
                    )}

                    <MobileFiltersDrawer
                        open={drawerOpen}
                        onOpenChange={setDrawerOpen}
                        title={tg.filters}
                        triggerLabel={tg.adjust}
                        applyLabel={tg.apply}
                        activeCount={hasActiveFilters ? 1 : 0}
                    >
                        {statusField}
                    </MobileFiltersDrawer>
                </div>
            </div>

            <div className="hidden max-w-xs lg:block">{statusField}</div>

            {hasActiveFilters && (
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="max-w-full gap-1 pr-1">
                        <span className="truncate">{tg.statusChip.replace('{status}', statusLabel(status))}</span>
                        <button
                            type="button"
                            className="shrink-0 rounded-full p-0.5 hover:bg-muted"
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
