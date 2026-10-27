'use client';

import { AlertTriangle, Lightbulb, PiggyBank, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import { cn } from '@/lib/utils';

export type FinopsBudgetStatusItem = {
    budget: { id: string; name: string; amount: number };
    currentSpend: number;
    remainingAmount: number;
    usagePercentage: number;
    currency: string;
};

type FinopsKpiStripProps = {
    cost: number;
    currency: string;
    momGrowth: number;
    forecastedCost: number | null;
    potentialSavings: number;
    openAnomalies: number;
    openRecommendations: number;
    budgetStatuses?: FinopsBudgetStatusItem[];
    singleAccountMode?: boolean;
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
    singleAccountMode = false,
    isLoading = false,
}: FinopsKpiStripProps) {
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
    const primaryBudget = budgetStatuses[0] ?? null;

    return (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card>
                <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                        <Wallet className="size-3.5" />
                        Custo no período
                    </CardDescription>
                    <CardTitle className="text-xl sm:text-2xl">{formatCurrency(cost, currency)}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">Valor acumulado no filtro atual</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>Variação vs período anterior</CardDescription>
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
                        {growthPositive ? 'Redução ou estabilidade' : 'Aumento — investigar drivers'}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>Previsão do mês</CardDescription>
                    <CardTitle className="text-xl sm:text-2xl">
                        {forecastedCost != null ? formatCurrency(forecastedCost, currency) : '—'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">Estimativa com base no ritmo atual</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                        <PiggyBank className="size-3.5" />
                        Economia potencial
                    </CardDescription>
                    <CardTitle className="text-xl text-emerald-600 sm:text-2xl">
                        {formatCurrency(potentialSavings, currency)}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">Recomendações abertas</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5" />
                        Anomalias
                    </CardDescription>
                    <CardTitle className="text-xl sm:text-2xl">{openAnomalies}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Lightbulb className="size-3" />
                        {openRecommendations} recomendações abertas
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                        <Target className="size-3.5" />
                        Orçamento
                    </CardDescription>
                    <CardTitle className="text-xl sm:text-2xl">
                        {singleAccountMode && primaryBudget
                            ? `${primaryBudget.usagePercentage.toFixed(0)}%`
                            : '—'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">
                        {singleAccountMode && primaryBudget
                            ? `${formatCurrency(primaryBudget.currentSpend, primaryBudget.currency)} de ${formatCurrency(primaryBudget.budget.amount, primaryBudget.currency)}`
                            : singleAccountMode
                              ? 'Nenhum orçamento ativo nesta conta'
                              : 'Disponível ao filtrar uma conta'}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
