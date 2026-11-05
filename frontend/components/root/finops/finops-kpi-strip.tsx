'use client';

import Link from 'next/link';
import { AlertTriangle, Lightbulb, PiggyBank, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
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
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted" />
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

    return (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card>
                <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                        <Wallet className="size-3.5" />
                        {t.kpiCostPeriod}
                    </CardDescription>
                    <CardTitle className="text-xl sm:text-2xl">{formatCurrency(cost, currency)}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">{t.kpiCostPeriodHint}</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>{t.kpiVariation}</CardDescription>
                    <CardTitle
                        className={cn(
                            'flex items-center gap-1.5 text-xl sm:text-2xl',
                            growthPositive ? 'text-emerald-600' : 'text-destructive'
                        )}
                    >
                        {growthPositive ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
                        {momGrowth === 0 ? '0%' : `${momGrowth > 0 ? '+' : ''}${momGrowth.toFixed(1)}%`}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">
                        {growthPositive ? t.kpiVariationDown : t.kpiVariationUp}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>{t.kpiForecastTitle}</CardDescription>
                    <CardTitle className="text-xl sm:text-2xl">
                        {forecastedCost != null ? formatCurrency(forecastedCost, currency) : '—'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">{t.kpiForecastHint}</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                        <PiggyBank className="size-3.5" />
                        {t.potentialSavings}
                    </CardDescription>
                    <CardTitle className="text-xl text-emerald-600 sm:text-2xl">
                        {formatCurrency(potentialSavings, currency)}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                        {(openRecommendations === 1
                            ? t.kpiOpenRecommendationsOne
                            : t.kpiOpenRecommendationsMany
                        ).replace('{count}', String(openRecommendations))}
                    </p>
                    <Link href={savingsHref} className="text-xs font-medium text-primary hover:underline">
                        {t.kpiViewSavings}
                    </Link>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5" />
                        {t.subnavAnomalies}
                    </CardDescription>
                    <CardTitle className="text-xl sm:text-2xl">{openAnomalies}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Lightbulb className="size-3" />
                        {t.kpiAnomaliesHint}
                    </p>
                    <Link href={anomaliesHref} className="text-xs font-medium text-primary hover:underline">
                        {t.kpiViewAnomalies}
                    </Link>
                </CardContent>
            </Card>

            <Card
                className={cn(
                    riskState === 'near' && 'border-amber-500/50',
                    riskState === 'exceeded' && 'border-destructive/50'
                )}
            >
                <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                        <Target className="size-3.5" />
                        {t.kpiBudget}
                    </CardDescription>
                    <CardTitle
                        className={cn(
                            'text-xl sm:text-2xl',
                            riskState === 'near' && 'text-amber-600',
                            riskState === 'exceeded' && 'text-destructive'
                        )}
                    >
                        {primaryBudget ? `${primaryBudget.usagePercentage.toFixed(0)}%` : '—'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    {primaryBudget ? (
                        <>
                            <p className="truncate text-xs font-medium text-foreground" title={primaryBudget.budget.name}>
                                {primaryBudget.budget.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t.budgetsSpendOf
                                    .replace(
                                        '{spent}',
                                        formatCurrency(primaryBudget.currentSpend, primaryBudget.currency)
                                    )
                                    .replace('{limit}', formatCurrency(effectiveLimit, primaryBudget.currency))}
                            </p>
                            {totalBudgets > 1 ? (
                                <p className="text-xs text-muted-foreground">
                                    {t.budgetsAtRiskCount
                                        .replace('{atRisk}', String(atRiskCount))
                                        .replace('{total}', String(totalBudgets))}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">{riskSubtitle}</p>
                            )}
                        </>
                    ) : (
                        <p className="text-xs text-muted-foreground">{riskSubtitle}</p>
                    )}
                    {(riskState === 'near' || riskState === 'exceeded') && (
                        <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="size-3" />
                            {riskState === 'exceeded' ? t.kpiLimitExceeded : t.kpiThresholdReached}
                        </p>
                    )}
                    <Link href={budgetsHref} className="text-xs font-medium text-primary hover:underline">
                        {t.kpiManageBudgets}
                    </Link>
                </CardContent>
            </Card>
        </div>
    );
}
