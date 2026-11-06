'use client';

import Link from 'next/link';
import { AlertTriangle, CalendarClock, Landmark, PiggyBank, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import {
    countBudgetsAtRisk,
    getBudgetEffectiveLimit,
    getBudgetRiskState,
    pickHighestRiskBudget,
    type FinopsBudgetStatusItem,
} from '@/components/root/finops/finops-budget-types';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

export type { FinopsBudgetStatusItem };

function MetricCard({
    label,
    value,
    hint,
    href,
    linkLabel,
    icon,
    valueClassName,
    className,
}: {
    label: string;
    value: string;
    hint: string;
    href?: string;
    linkLabel?: string;
    icon?: ReactNode;
    valueClassName?: string;
    className?: string;
}) {
    return (
        <Card className={cn('h-full justify-between gap-3', className)}>
            <CardHeader className="pb-0">
                <CardDescription className="flex h-5 items-center gap-1.5">
                    {icon}
                    <span className="truncate">{label}</span>
                </CardDescription>
                <CardTitle className={cn('truncate text-xl tabular-nums sm:text-2xl', valueClassName)}>{value}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
                <p className="line-clamp-2 h-8 text-xs leading-4 text-muted-foreground">{hint}</p>
                {href && linkLabel ? (
                    <Link href={href} className="h-4 truncate text-xs leading-4 font-medium text-primary hover:underline">
                        {linkLabel}
                    </Link>
                ) : (
                    <span className="h-4 text-xs" aria-hidden="true" />
                )}
            </CardContent>
        </Card>
    );
}

type FinopsKpiStripProps = {
    cost: number;
    currency: string;
    momGrowth: number;
    forecastedCost: number | null;
    potentialSavings: number;
    openAnomalies: number;
    openRecommendations: number;
    budgetStatuses?: FinopsBudgetStatusItem[];
    budgetsHref?: string;
    savingsHref?: string;
    anomaliesHref?: string;
    isLoading?: boolean;
};

export function FinopsKpiStrip({
    cost,
    currency,
    momGrowth,
    forecastedCost,
    potentialSavings,
    openAnomalies,
    openRecommendations,
    budgetStatuses = [],
    budgetsHref = '/finops/budgets',
    savingsHref = '/finops/savings',
    anomaliesHref = '/finops/anomalies',
    isLoading = false,
}: FinopsKpiStripProps) {
    const t = useTranslations('finops');

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-32 animate-pulse rounded-xl border bg-muted" />
                ))}
            </div>
        );
    }

    const growthPositive = momGrowth <= 0;
    const primaryBudget = pickHighestRiskBudget(budgetStatuses);
    const riskState = getBudgetRiskState(primaryBudget);
    const atRiskCount = countBudgetsAtRisk(budgetStatuses);
    const totalBudgets = budgetStatuses.length;
    const effectiveLimit = primaryBudget ? getBudgetEffectiveLimit(primaryBudget.budget) : 0;

    const riskSubtitle =
        riskState === 'empty'
            ? t.kpiNoActiveBudget
            : riskState === 'exceeded'
              ? t.kpiLimitExceeded
              : riskState === 'near'
                ? t.kpiNearThreshold
                : t.budgetsWithinLimit;

    const budgetHint = primaryBudget
        ? `${primaryBudget.budget.name} · ${t.budgetsSpendOf
              .replace('{spent}', formatCurrency(primaryBudget.currentSpend, primaryBudget.currency))
              .replace('{limit}', formatCurrency(effectiveLimit, primaryBudget.currency))}${
              totalBudgets > 1
                  ? ` · ${t.budgetsAtRiskCount.replace('{atRisk}', String(atRiskCount)).replace('{total}', String(totalBudgets))}`
                  : ''
          }`
        : riskSubtitle;

    return (
        <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
                label={t.kpiCostPeriod}
                value={formatCurrency(cost, currency)}
                hint={t.kpiCostPeriodHint}
                icon={<Wallet className="size-3.5 shrink-0" />}
            />
            <MetricCard
                label={t.kpiVariation}
                value={momGrowth === 0 ? '0%' : `${momGrowth > 0 ? '+' : ''}${momGrowth.toFixed(1)}%`}
                hint={growthPositive ? t.kpiVariationDown : t.kpiVariationUp}
                valueClassName={growthPositive ? 'text-emerald-600' : 'text-destructive'}
                icon={
                    growthPositive ? (
                        <TrendingDown className="size-3.5 shrink-0" />
                    ) : (
                        <TrendingUp className="size-3.5 shrink-0" />
                    )
                }
            />
            <MetricCard
                label={t.kpiForecastTitle}
                value={forecastedCost != null ? formatCurrency(forecastedCost, currency) : '—'}
                hint={t.kpiForecastHint}
            />
            <MetricCard
                label={t.potentialSavings}
                value={formatCurrency(potentialSavings, currency)}
                hint={(openRecommendations === 1 ? t.kpiOpenRecommendationsOne : t.kpiOpenRecommendationsMany).replace(
                    '{count}',
                    String(openRecommendations),
                )}
                href={savingsHref}
                linkLabel={t.kpiViewSavings}
                valueClassName="text-emerald-600"
                icon={<PiggyBank className="size-3.5 shrink-0" />}
            />
            <MetricCard
                label={t.subnavAnomalies}
                value={String(openAnomalies)}
                hint={t.kpiAnomaliesHint}
                href={anomaliesHref}
                linkLabel={t.kpiViewAnomalies}
                icon={<AlertTriangle className="size-3.5 shrink-0" />}
            />
            <MetricCard
                label={t.kpiBudget}
                value={primaryBudget ? `${primaryBudget.usagePercentage.toFixed(0)}%` : '—'}
                hint={
                    riskState === 'near' || riskState === 'exceeded'
                        ? `${riskState === 'exceeded' ? t.kpiLimitExceeded : t.kpiThresholdReached}. ${budgetHint}`
                        : budgetHint
                }
                href={budgetsHref}
                linkLabel={t.kpiManageBudgets}
                valueClassName={cn(riskState === 'near' && 'text-amber-600', riskState === 'exceeded' && 'text-destructive')}
                icon={<Target className="size-3.5 shrink-0" />}
                className={cn(riskState === 'near' && 'border-amber-500/50', riskState === 'exceeded' && 'border-destructive/50')}
            />
        </div>
    );
}

export type FinopsPortfolioSnapshot = {
    credits: {
        totalGranted: number;
        totalRemaining: number;
        consumedInPeriod: number;
        expiringSoon: number;
        currency: string;
    };
    commitments: {
        avgUtilizationPercent: number | null;
        avgCoveragePercent: number | null;
        unusedCommitment: number;
        currency: string;
    };
};

type FinopsPortfolioStripProps = {
    portfolio: FinopsPortfolioSnapshot | null;
    href?: string;
    isLoading?: boolean;
};

export function FinopsPortfolioStrip({ portfolio, href = '/finops/commitments', isLoading = false }: FinopsPortfolioStripProps) {
    const t = useTranslations('finops');

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-32 animate-pulse rounded-xl border bg-muted" />
                ))}
            </div>
        );
    }

    if (!portfolio) return null;

    const creditCurrency = portfolio.credits.currency || 'USD';

    return (
        <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
            <MetricCard
                label={t.creditsRemaining}
                value={formatCurrency(portfolio.credits.totalRemaining, creditCurrency)}
                hint={t.kpiCreditsRemainingHint}
                href={href}
                linkLabel={t.kpiViewCommitments}
                icon={<Landmark className="size-3.5 shrink-0" />}
            />
            <MetricCard
                label={t.creditsConsumedPeriod}
                value={formatCurrency(portfolio.credits.consumedInPeriod, creditCurrency)}
                hint={t.kpiCreditsConsumedHint}
            />
            <MetricCard
                label={t.creditsTotalGranted}
                value={formatCurrency(portfolio.credits.totalGranted, creditCurrency)}
                hint={t.kpiCreditsGrantedHint}
            />
            <MetricCard
                label={t.creditsExpiringSoon}
                value={String(portfolio.credits.expiringSoon)}
                hint={t.kpiCreditsExpiringHint}
                icon={<CalendarClock className="size-3.5 shrink-0" />}
            />
        </div>
    );
}
