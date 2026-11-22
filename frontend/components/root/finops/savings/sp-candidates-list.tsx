'use client';

import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import {
    candidateDisplayName,
    candidateSecondaryId,
    type CommitmentCandidate,
} from '@/lib/finops/commitment-candidates';
import { cn } from '@/lib/utils';
import type { Translations } from '@/lib/i18n';

type FinopsT = Record<keyof Translations['finops'], string>;

function reasonLabels(candidate: CommitmentCandidate, t: FinopsT): string[] {
    const labels: string[] = [];
    for (const code of candidate.reasonCodes ?? []) {
        if (code === 'stable_spend') labels.push(t.recommendSpReasonStable);
        else if (code === 'consistent_usage') labels.push(t.recommendSpReasonConsistent);
        else if (code === 'compute_eligible') labels.push(t.recommendSpReasonCompute);
        else if (code === 'long_running_instance') {
            labels.push(
                t.recommendSpReasonLongRunning.replace(
                    '{days}',
                    String(candidate.launchAgeDays ?? candidate.lookbackDays),
                ),
            );
        }
    }
    return labels;
}

type SpCandidatesListProps = {
    items: CommitmentCandidate[];
    accountAliases: Record<string, string>;
    t: FinopsT;
    isLoading?: boolean;
    empty?: boolean;
    className?: string;
    onUseResource?: (candidate: CommitmentCandidate) => void;
};

export function SpCandidatesList({
    items,
    accountAliases,
    t,
    isLoading = false,
    empty = false,
    className,
    onUseResource,
}: SpCandidatesListProps) {
    if (isLoading) {
        return (
            <div className={cn('space-y-2', className)}>
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-20 animate-pulse rounded-md bg-muted/50" />
                ))}
            </div>
        );
    }

    if (empty || items.length === 0) {
        return (
            <div className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}>
                <Sparkles className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium">{t.recommendSpCandidatesEmpty}</p>
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    {t.recommendSpCandidatesEmptyHint}
                </p>
            </div>
        );
    }

    return (
        <ul className={cn('flex flex-col divide-y rounded-lg border', className)}>
            {items.map((candidate) => {
                const alias =
                    accountAliases[candidate.cloudAccountId] ?? candidate.cloudAccountId.slice(0, 8);
                const title = candidateDisplayName(candidate);
                const secondaryId = candidateSecondaryId(candidate);
                const reasons = reasonLabels(candidate, t);
                const hasCost = (candidate.estimatedMonthlyCost ?? 0) > 0;
                const hasSpSavings = (candidate.estimatedSpMonthlySavings ?? 0) > 0;
                const metaParts = [
                    alias,
                    candidate.cloudProvider?.toUpperCase(),
                    candidate.instanceType
                        ? t.recommendSpInstanceType.replace('{type}', candidate.instanceType)
                        : null,
                    candidate.region || null,
                    candidate.launchAgeDays != null && candidate.launchAgeDays > 0
                        ? t.recommendSpAge.replace('{days}', String(candidate.launchAgeDays))
                        : null,
                ].filter(Boolean);

                return (
                    <li
                        key={`${candidate.cloudAccountId}-${candidate.service}-${candidate.resourceId}`}
                        className="bg-background px-3 py-3 sm:px-4"
                    >
                        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <p className="truncate text-sm font-medium" title={candidate.resourceId}>
                                        {title}
                                    </p>
                                    {secondaryId ? (
                                        <p
                                            className="truncate font-mono text-[11px] text-muted-foreground"
                                            title={candidate.resourceId}
                                        >
                                            {secondaryId}
                                        </p>
                                    ) : null}
                                </div>
                                <p className="truncate text-xs text-muted-foreground">{candidate.service}</p>
                                <p className="text-[11px] leading-relaxed text-muted-foreground">
                                    {metaParts.join(' · ')}
                                </p>
                                <div className="flex min-w-0 flex-wrap gap-1">
                                    {candidate.estimatedSpSavingsPercentage != null ? (
                                        <Badge variant="secondary" className="text-[10px] font-normal">
                                            {t.recommendSpSavingsPct.replace(
                                                '{pct}',
                                                String(candidate.estimatedSpSavingsPercentage),
                                            )}
                                        </Badge>
                                    ) : null}
                                    {candidate.costSource === 'service_apportioned' ? (
                                        <Badge variant="outline" className="text-[10px] font-normal">
                                            {t.recommendSpCostApportioned}
                                        </Badge>
                                    ) : null}
                                </div>
                                {reasons.length > 0 ? (
                                    <p className="line-clamp-2 text-[11px] text-muted-foreground">
                                        {reasons.join(' · ')}
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-end">
                                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:text-right">
                                    <div>
                                        <p className="text-[11px] text-muted-foreground">{t.recommendSpMonthly}</p>
                                        {hasCost ? (
                                            <p className="text-sm font-semibold tabular-nums">
                                                {formatCurrency(
                                                    candidate.estimatedMonthlyCost,
                                                    candidate.currency,
                                                )}
                                            </p>
                                        ) : (
                                            <p
                                                className="text-xs text-muted-foreground"
                                                title={t.recommendSpNoCostHint}
                                            >
                                                {t.recommendSpNoCost}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[11px] text-muted-foreground">
                                            {t.recommendSpSavingsMonthly}
                                        </p>
                                        {hasSpSavings ? (
                                            <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(
                                                    candidate.estimatedSpMonthlySavings,
                                                    candidate.currency,
                                                )}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">—</p>
                                        )}
                                    </div>
                                </div>
                                {onUseResource ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        className="h-8 w-full sm:w-auto"
                                        onClick={() => onUseResource(candidate)}
                                    >
                                        {t.recommendSpUseResource}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
