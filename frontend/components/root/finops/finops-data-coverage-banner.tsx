'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OrgFinopsDataCoverage } from '@/components/root/finops/overview/types';
import { useTranslations } from '@/lib/i18n';

type FinopsDataCoverageBannerProps = {
    coverage: OrgFinopsDataCoverage | null | undefined;
    onSyncClick?: () => void;
    syncDisabled?: boolean;
};

export function FinopsDataCoverageBanner({
    coverage,
    onSyncClick,
    syncDisabled,
}: FinopsDataCoverageBannerProps) {
    const tf = useTranslations('finops');

    if (!coverage?.incomplete) return null;

    const requested = `${coverage.requestedStart} → ${coverage.requestedEnd}`;
    const hasAvailable = Boolean(coverage.availableStart && coverage.availableEnd);
    const available = hasAvailable
        ? `${coverage.availableStart} → ${coverage.availableEnd}`
        : '';

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-1">
                    <p className="font-medium">
                        {hasAvailable ? tf.dataCoveragePartialTitle : tf.dataCoverageMissingTitle}
                    </p>
                    <p className="text-amber-900/90 dark:text-amber-100/90">
                        {hasAvailable
                            ? tf.dataCoveragePartialDesc
                                  .replace('{requested}', requested)
                                  .replace('{available}', available)
                            : tf.dataCoverageMissingDesc.replace('{requested}', requested)}
                    </p>
                </div>
            </div>
            {onSyncClick ? (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-amber-500/40 bg-background/60"
                    onClick={onSyncClick}
                    disabled={syncDisabled}
                >
                    {tf.dataCoverageSyncCta}
                </Button>
            ) : null}
        </div>
    );
}
