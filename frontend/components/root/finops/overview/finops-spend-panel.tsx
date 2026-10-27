'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CostTrendChart } from '@/components/root/finops/overview/cost-trend-chart';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { OrgFinopsOverview } from '@/components/root/finops/overview/types';
import { cn } from '@/lib/utils';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#f97316'];

type FinopsSpendPanelProps = {
    overview: OrgFinopsOverview | null;
    isLoading?: boolean;
};

function serviceLabel(service: string): string {
    return service
        .replace(/^Amazon\s+/i, '')
        .replace(/^AWS\s+/i, '')
        .slice(0, 28);
}

export function FinopsSpendPanel({ overview, isLoading = false }: FinopsSpendPanelProps) {
    if (isLoading || !overview) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted" />
                ))}
                <div className="h-72 animate-pulse rounded-xl border bg-muted md:col-span-2 lg:col-span-4" />
            </div>
        );
    }

    const { totals, costByService, costTrend } = overview;
    const momGrowth = Number(totals.momGrowth);
    const growthPositive = momGrowth <= 0;
    const topServices = costByService.slice(0, 8).map((item) => ({
        name: serviceLabel(item.service),
        cost: Number(item.currentMonthCost),
        fullName: item.service,
    }));

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Custo no período</CardDescription>
                        <CardTitle className="text-2xl">{formatCurrency(totals.cost, totals.currency)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={cn('flex items-center gap-1 text-xs', growthPositive ? 'text-emerald-600' : 'text-destructive')}>
                            {growthPositive ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
                            {momGrowth === 0 ? 'sem variação' : `${Math.abs(momGrowth).toFixed(1)}% vs mês anterior`}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Previsão do mês</CardDescription>
                        <CardTitle className="text-2xl">
                            {totals.forecastedCost != null ? formatCurrency(totals.forecastedCost, totals.currency) : '—'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Projeção com base no ritmo diário atual</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Economia potencial</CardDescription>
                        <CardTitle className="text-2xl text-emerald-600">
                            {formatCurrency(totals.potentialSavings, totals.currency)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Com base em recomendações abertas</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Contas</CardDescription>
                        <CardTitle className="text-2xl">{overview.accounts.length}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            {overview.accounts.filter((a) => a.hasConsent).length} com coleta ativa
                        </p>
                    </CardContent>
                </Card>
            </div>

            <CostTrendChart
                data={costTrend.map((point) => ({ date: point.date, cost: point.cost }))}
                currency={totals.currency}
                title="Tendência de custo"
                description={`${overview.period.startDate} → ${overview.period.endDate}`}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Top serviços</CardTitle>
                    <CardDescription>Maiores custos no período selecionado</CardDescription>
                </CardHeader>
                <CardContent>
                    {topServices.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">Nenhum custo coletado ainda. Aceite os termos e sincronize.</p>
                    ) : (
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topServices} layout="vertical" margin={{ left: 8, right: 16 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis type="number" tickFormatter={(value) => formatCurrency(Number(value), totals.currency)} hide />
                                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        formatter={(value) => formatCurrency(Number(value), totals.currency)}
                                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                                    />
                                    <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                                        {topServices.map((_, index) => (
                                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
