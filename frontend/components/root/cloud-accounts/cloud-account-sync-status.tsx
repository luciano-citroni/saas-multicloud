'use client';

import { AlertCircle, AlertTriangle, Clock3, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AppLocale } from '@/lib/locale';

export type CloudAccountSyncStatusData = {
    isSyncInProgress?: boolean;
    lastGeneralSyncAt?: string | null;
    lastGeneralSyncError?: string | null;
    lastGeneralSyncWarning?: string | null;
};

type CloudAccountSyncStatusProps = {
    account: CloudAccountSyncStatusData;
    locale: AppLocale;
    variant?: 'inline' | 'banner';
    labels: {
        notSynced: string;
        invalidDate: string;
        processing: string;
        syncFailedLabel: string;
        syncWarningLabel: string;
        lastSyncLabel: string;
    };
};

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function formatDateTime(dateString: string | undefined | null, locale: AppLocale, notSynced: string, invalidDate: string) {
    if (!dateString) return notSynced;

    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return invalidDate;

    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: SAO_PAULO_TIME_ZONE,
    }).format(parsed);
}

export function CloudAccountSyncStatus({ account, locale, variant = 'inline', labels }: CloudAccountSyncStatusProps) {
    const isSyncInProgress = account.isSyncInProgress === true;
    const syncError = account.lastGeneralSyncError?.trim();
    const syncWarning = account.lastGeneralSyncWarning?.trim();
    const lastSyncLabel = formatDateTime(account.lastGeneralSyncAt, locale, labels.notSynced, labels.invalidDate);

    if (variant === 'banner') {
        if (isSyncInProgress) {
            return (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-start gap-3">
                        <RefreshCw className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{labels.processing}</p>
                            <p className="text-xs text-muted-foreground">{labels.lastSyncLabel}: {lastSyncLabel}</p>
                        </div>
                    </div>
                </div>
            );
        }

        if (syncError) {
            return (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-destructive">{labels.syncFailedLabel}</p>
                            <p className="text-xs leading-relaxed text-destructive/90">{syncError}</p>
                            <p className="text-xs text-muted-foreground">{labels.lastSyncLabel}: {lastSyncLabel}</p>
                        </div>
                    </div>
                </div>
            );
        }

        if (syncWarning) {
            return (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{labels.syncWarningLabel}</p>
                            <p className="text-xs leading-relaxed text-amber-700/90 dark:text-amber-200/90">{syncWarning}</p>
                            <p className="text-xs text-muted-foreground">{labels.lastSyncLabel}: {lastSyncLabel}</p>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="size-4 shrink-0" />
                    <span>
                        {labels.lastSyncLabel}: {lastSyncLabel}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex max-w-80 flex-col gap-1">
            {isSyncInProgress ? (
                <Badge variant="default" className="inline-flex w-fit items-center gap-1">
                    <RefreshCw className="size-3 animate-spin" />
                    {labels.processing}
                </Badge>
            ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock3 className="size-3.5 shrink-0" />
                    {lastSyncLabel}
                </span>
            )}

            {!isSyncInProgress && syncError ? (
                <span className={cn('line-clamp-3 text-xs leading-relaxed text-destructive')} title={syncError}>
                    {labels.syncFailedLabel}: {syncError}
                </span>
            ) : null}

            {!isSyncInProgress && !syncError && syncWarning ? (
                <span
                    className={cn('line-clamp-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300')}
                    title={syncWarning}
                >
                    {labels.syncWarningLabel}: {syncWarning}
                </span>
            ) : null}
        </div>
    );
}
