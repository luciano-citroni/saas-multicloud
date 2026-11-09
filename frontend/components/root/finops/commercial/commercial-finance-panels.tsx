'use client';

import Link from 'next/link';
import { Info, Landmark, PiggyBank, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Credits = {
    hasCredits: boolean;
    granted: number;
    consumed: number;
    remaining: number;
};

type Commitments = {
    hasData: boolean;
    avgUtilizationPercent: number | null;
    avgCoveragePercent: number | null;
    unusedCommitment: number | null;
    potentialMonthlySavings: number | null;
    savingsPlanCount: number;
    reservationCount: number;
    cudCount: number;
};

function Meter({
    label,
    value,
    tone = 'neutral',
}: {
    label: string;
    value: number | null;
    tone?: 'neutral' | 'good' | 'warn';
}) {
    const pct = value != null && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <span className="text-sm font-semibold tabular-nums">{pct != null ? `${pct.toFixed(1)}%` : '—'}</span>
            </div>
            <Progress
                value={pct ?? 0}
                className={cn(
                    'h-2',
                    tone === 'good' && '[&_[data-slot=progress-indicator]]:bg-emerald-600',
                    tone === 'warn' && '[&_[data-slot=progress-indicator]]:bg-amber-500',
                )}
            />
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="truncate text-lg font-semibold tracking-tight tabular-nums">{value}</p>
        </div>
    );
}

export function CommercialFinancePanels({
    credits,
    commitments,
    money,
}: {
    credits: Credits;
    commitments?: Commitments | null;
    money: (value: number) => string;
}) {
    const t = useTranslations('finops');
    const consumedShare =
        credits.granted > 0 ? Math.max(0, Math.min(100, (credits.consumed / credits.granted) * 100)) : null;
    const inventory = [
        commitments?.savingsPlanCount
            ? { label: t.commercialCommitmentsSp, count: commitments.savingsPlanCount }
            : null,
        commitments?.reservationCount
            ? { label: t.commercialCommitmentsReservation, count: commitments.reservationCount }
            : null,
        commitments?.cudCount ? { label: t.commercialCommitmentsCud, count: commitments.cudCount } : null,
    ].filter((item): item is { label: string; count: number } => item != null);

    const utilizationTone =
        commitments?.avgUtilizationPercent == null
            ? 'neutral'
            : commitments.avgUtilizationPercent >= 80
              ? 'good'
              : commitments.avgUtilizationPercent < 60
                ? 'warn'
                : 'neutral';
    const coverageTone =
        commitments?.avgCoveragePercent == null
            ? 'neutral'
            : commitments.avgCoveragePercent >= 50
              ? 'good'
              : 'warn';

    return (
        <div className="flex flex-col gap-4">
            <div className="flex gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
                <Info className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden />
                <p className="text-sm leading-5 text-foreground/90 text-pretty">{t.commercialTotalNote}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="gap-0 overflow-hidden">
                    <CardHeader className="border-b pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <PiggyBank className="size-4 text-muted-foreground" aria-hidden />
                            {t.commercialCreditsTitle}
                        </CardTitle>
                        <CardDescription>{t.commercialCreditsNote}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5 pt-4">
                        {credits.hasCredits ? (
                            <>
                                <div className="grid grid-cols-3 gap-3">
                                    <Stat label={t.commercialCreditsGranted} value={money(credits.granted)} />
                                    <Stat label={t.commercialCreditsConsumed} value={money(credits.consumed)} />
                                    <Stat label={t.commercialCreditsRemaining} value={money(credits.remaining)} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-xs font-medium text-muted-foreground">
                                            {t.commercialCreditsConsumed}
                                        </span>
                                        <span className="text-sm font-semibold tabular-nums">
                                            {consumedShare != null ? `${consumedShare.toFixed(0)}%` : '—'}
                                        </span>
                                    </div>
                                    <Progress value={consumedShare ?? 0} className="h-2" />
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">{t.commercialCreditsNone}</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="gap-0 overflow-hidden">
                    <CardHeader className="border-b pb-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                                    {t.commercialCommitmentsTitle}
                                </CardTitle>
                                <CardDescription>{t.commercialCommitmentsSectionDesc}</CardDescription>
                            </div>
                            <Link
                                href="/finops/commitments"
                                className="shrink-0 text-xs font-medium text-primary hover:underline"
                            >
                                {t.commercialCommitmentsOpen}
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5 pt-4">
                        {commitments?.hasData ? (
                            <>
                                <div className="flex flex-wrap gap-1.5">
                                    {inventory.length > 0 ? (
                                        inventory.map((item) => (
                                            <Badge key={item.label} variant="secondary">
                                                {item.count} {item.label}
                                            </Badge>
                                        ))
                                    ) : (
                                        <Badge variant="outline">{t.commercialCommitmentsInventory}: —</Badge>
                                    )}
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Meter
                                        label={t.commercialCommitmentsUtilization}
                                        value={commitments.avgUtilizationPercent}
                                        tone={utilizationTone}
                                    />
                                    <Meter
                                        label={t.commercialCommitmentsCoverage}
                                        value={commitments.avgCoveragePercent}
                                        tone={coverageTone}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3 border-t pt-4">
                                    <Stat
                                        label={t.commercialCommitmentsUnused}
                                        value={
                                            commitments.unusedCommitment != null
                                                ? money(commitments.unusedCommitment)
                                                : '—'
                                        }
                                    />
                                    <Stat
                                        label={t.commercialCommitmentsPotential}
                                        value={
                                            commitments.potentialMonthlySavings != null
                                                ? money(commitments.potentialMonthlySavings)
                                                : '—'
                                        }
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                                <Landmark className="mt-0.5 size-4 shrink-0" aria-hidden />
                                <p>{t.commercialCommitmentsNone}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
