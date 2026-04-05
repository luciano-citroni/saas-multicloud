'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    BarChart2,
    DollarSign,
    AlertTriangle,
    ArrowUpRight,
    PieChart as PieChartIcon,
    TrendingUp,
    Gauge,
    ShieldAlert,
    Layers3,
    Target,
} from 'lucide-react';
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { AggregatedFinopsData } from './finops-aggregator';

type DashboardPeriod = 'last7days' | 'last30days' | 'last90days' | 'currentmonth' | 'lastmonth' | 'ytd';

type FinopsAggregatedDashboardProps = {
    data: AggregatedFinopsData | null;
    isLoading?: boolean;
    onPeriodChange?: (period: DashboardPeriod) => void;
};

function serviceLabel(service: string): string {
    return service
        .replace(/^Amazon\s+/i, '')
        .replace(/^AWS\s+/i, '')
        .slice(0, 28);
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#f97316'];

type DecisionStatus = 'healthy' | 'warning' | 'critical';

function decisionStatusLabel(status: DecisionStatus): string {
    if (status === 'critical') return 'Crítico';
    if (status === 'warning') return 'Atenção';
    return 'Saudável';
}

function decisionStatusClass(status: DecisionStatus): string {
    if (status === 'critical') return 'border-destructive/30 bg-destructive/10 text-destructive';
    if (status === 'warning') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
}

function periodLabel(period: DashboardPeriod): string {
    if (period === 'last7days') return 'Últimos 7 dias';
    if (period === 'last30days') return 'Últimos 30 dias';
    if (period === 'last90days') return 'Últimos 90 dias';
    if (period === 'currentmonth') return 'Mês atual';
    if (period === 'lastmonth') return 'Mês passado';
    return 'Ano até hoje';
}

function isDashboardPeriod(value: string | null): value is DashboardPeriod {
    return (
        value === 'last7days' || value === 'last30days' || value === 'last90days' || value === 'currentmonth' || value === 'lastmonth' || value === 'ytd'
    );
}

export function FinopsAggregatedDashboard({ data, isLoading = false, onPeriodChange }: FinopsAggregatedDashboardProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const periodParam = searchParams.get('period');
    const selectedPeriod: DashboardPeriod = isDashboardPeriod(periodParam) ? periodParam : 'lastmonth';

    useEffect(() => {
        onPeriodChange?.(selectedPeriod);
    }, [onPeriodChange, selectedPeriod]);

    const setPeriodFilter = (period: DashboardPeriod) => {
        const params = new URLSearchParams(searchParams.toString());

        if (period === 'lastmonth') {
            params.delete('period');
        } else {
            params.set('period', period);
        }

        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Card key={i}>
                            <CardHeader className="pb-2">
                                <div className="h-4 bg-muted rounded animate-pulse" />
                            </CardHeader>
                            <CardContent>
                                <div className="h-8 bg-muted rounded animate-pulse" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                        </CardHeader>
                        <CardContent>
                            <div className="h-64 bg-muted rounded animate-pulse" />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                        </CardHeader>
                        <CardContent>
                            <div className="h-64 bg-muted rounded animate-pulse" />
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Dashboard Agregado</CardTitle>
                    <CardDescription>Visão consolidada de todas as contas cloud</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">Carregando dados agregados...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Prepare chart data
    const pieData = data.topCosts.map((item, index) => ({
        name: serviceLabel(item.service),
        value: Number(item.currentMonthCost),
        color: COLORS[index % COLORS.length],
    }));

    const barData = data.topCosts
        .map((item) => ({
            service: serviceLabel(item.service),
            current: Number(item.currentMonthCost),
            previous: Number(item.previousMonthCost ?? 0),
        }))
        .slice(0, 5);

    const totalCost = Number(data.totalCost);
    const forecastedCost = data.forecastedCost ? Number(data.forecastedCost) : null;
    const openRecommendations = data.recommendations.filter((item) => item.status === 'open').length;

    const topThreeCost = data.topCosts.slice(0, 3).reduce((sum, item) => sum + Number(item.currentMonthCost), 0);
    const concentrationShare = totalCost > 0 ? (topThreeCost / totalCost) * 100 : 0;
    const savingsCoverage = totalCost > 0 ? (Number(data.potentialSavings) / totalCost) * 100 : 0;
    const forecastDelta = forecastedCost !== null ? forecastedCost - totalCost : null;
    const forecastDeltaPct = forecastDelta !== null && totalCost > 0 ? (forecastDelta / totalCost) * 100 : null;

    const riskStatus: DecisionStatus = data.criticalAnomalies >= 3 ? 'critical' : data.criticalAnomalies >= 1 ? 'warning' : 'healthy';
    const concentrationStatus: DecisionStatus = concentrationShare >= 70 ? 'critical' : concentrationShare >= 50 ? 'warning' : 'healthy';
    const savingsStatus: DecisionStatus = savingsCoverage < 5 ? 'critical' : savingsCoverage < 12 ? 'warning' : 'healthy';
    const forecastStatus: DecisionStatus =
        forecastDeltaPct == null ? 'warning' : forecastDeltaPct > 12 ? 'critical' : forecastDeltaPct > 5 ? 'warning' : 'healthy';

    const globalPenalty =
        (riskStatus === 'critical' ? 2 : riskStatus === 'warning' ? 1 : 0) +
        (concentrationStatus === 'critical' ? 2 : concentrationStatus === 'warning' ? 1 : 0) +
        (savingsStatus === 'critical' ? 2 : savingsStatus === 'warning' ? 1 : 0) +
        (forecastStatus === 'critical' ? 2 : forecastStatus === 'warning' ? 1 : 0);

    const globalStatus: DecisionStatus = globalPenalty >= 6 ? 'critical' : globalPenalty >= 3 ? 'warning' : 'healthy';

    // Show empty state only if truly no data
    const hasNoData = totalCost === 0 && data.topCosts.length === 0 && data.openAnomalies.length === 0 && data.potentialSavings === 0;

    if (hasNoData) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Dashboard Agregado</CardTitle>
                    <CardDescription>Visão consolidada de todas as contas cloud</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">
                            Nenhum dado disponível. Sincronize suas contas cloud para visualizar o dashboard agregado.
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Card className="border-primary/20 bg-linear-to-br from-primary/10 via-background to-background">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Gauge className="h-4 w-4" />
                                Panorama Global FinOps
                            </CardTitle>
                            <CardDescription>Visão executiva consolidada para priorização de ações</CardDescription>
                        </div>
                        <div className={cn('rounded-full border px-3 py-1 text-xs font-medium', decisionStatusClass(globalStatus))}>
                            Saúde global: {decisionStatusLabel(globalStatus)}
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="w-full sm:w-56">
                            <Select value={selectedPeriod} onValueChange={(value) => setPeriodFilter(value as DashboardPeriod)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Período" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="last7days">Últimos 7 dias</SelectItem>
                                    <SelectItem value="last30days">Últimos 30 dias</SelectItem>
                                    <SelectItem value="last90days">Últimos 90 dias</SelectItem>
                                    <SelectItem value="currentmonth">Mês atual</SelectItem>
                                    <SelectItem value="lastmonth">Mês passado</SelectItem>
                                    <SelectItem value="ytd">Ano até hoje</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                            Período: {periodLabel(selectedPeriod)}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border bg-background/80 p-3">
                        <p className="text-xs text-muted-foreground">Custo consolidado</p>
                        <p className="mt-1 text-xl font-bold">{formatCurrency(totalCost, data.currency)}</p>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-3">
                        <p className="text-xs text-muted-foreground">Economia endereçável</p>
                        <p className="mt-1 text-xl font-bold">{formatCurrency(data.potentialSavings, data.currency)}</p>
                    </div>
                    <div className="rounded-lg border bg-background/80 p-3">
                        <p className="text-xs text-muted-foreground">Ações abertas</p>
                        <p className="mt-1 text-xl font-bold">{data.openAnomalies.length + openRecommendations}</p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Risco operacional</CardTitle>
                        <ShieldAlert
                            className={cn(
                                'h-4 w-4',
                                riskStatus === 'critical' ? 'text-destructive' : riskStatus === 'warning' ? 'text-amber-500' : 'text-emerald-500'
                            )}
                        />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.criticalAnomalies}</div>
                        <p className="text-xs text-muted-foreground mt-1">anomalias críticas/altas</p>
                        <div className={cn('mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', decisionStatusClass(riskStatus))}>
                            {decisionStatusLabel(riskStatus)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Concentração</CardTitle>
                        <Layers3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{concentrationShare.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground mt-1">top 3 serviços</p>
                        <div
                            className={cn(
                                'mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                decisionStatusClass(concentrationStatus)
                            )}
                        >
                            {decisionStatusLabel(concentrationStatus)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cobertura de economia</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{savingsCoverage.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground mt-1">sobre custo total</p>
                        <div
                            className={cn('mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', decisionStatusClass(savingsStatus))}
                        >
                            {decisionStatusLabel(savingsStatus)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Desvio forecast</CardTitle>
                        <TrendingUp className={cn('h-4 w-4', forecastDelta !== null && forecastDelta > 0 ? 'text-destructive' : 'text-emerald-500')} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {forecastDeltaPct !== null ? `${forecastDeltaPct > 0 ? '+' : ''}${forecastDeltaPct.toFixed(1)}%` : '--'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {forecastDelta !== null ? formatCurrency(forecastDelta, data.currency) : 'sem forecast'}
                        </p>
                        <div
                            className={cn('mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', decisionStatusClass(forecastStatus))}
                        >
                            {decisionStatusLabel(forecastStatus)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Backlog de ações</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.openAnomalies.length + openRecommendations}</div>
                        <p className="text-xs text-muted-foreground mt-1">anomalias + recomendações abertas</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Margem do billing</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.billingMargin !== null ? `${Number(data.billingMargin).toFixed(1)}%` : '--'}</div>
                        <p className="text-xs text-muted-foreground mt-1">último billing calculado</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Distribution Pie Chart */}
                {data.topCosts.length > 0 && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <PieChartIcon className="h-4 w-4" />
                                        Distribuição de Custos
                                    </CardTitle>
                                    <CardDescription>Top 5 serviços por custo</CardDescription>
                                </div>
                                <Button variant="ghost" size="sm" asChild>
                                    <Link href="/finops/costs">
                                        <BarChart2 className="h-4 w-4" />
                                        Detalhar
                                    </Link>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-center">
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => (percent ? `${name} ${(percent * 100).toFixed(0)}%` : '')}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value) => (typeof value === 'number' ? formatCurrency(value, data.currency) : '')} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="space-y-2">
                                {data.topCosts.map((item, index) => {
                                    const amount = Number(item.currentMonthCost);
                                    const isIncrease = item.trend === 'up' && item.changePercentage > 0;

                                    return (
                                        <div key={item.service} className="flex items-center justify-between gap-3 text-sm">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                                <span className="truncate font-medium">{serviceLabel(item.service)}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">{formatCurrency(amount, item.currency)}</p>
                                                <p className={cn('text-xs', isIncrease ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                                                    {isIncrease ? '+' : ''}
                                                    {item.changePercentage.toFixed(1)}%
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Trend Chart */}
                {barData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Comparativo: Mês Atual vs. Anterior</CardTitle>
                            <CardDescription>{periodLabel(selectedPeriod)} comparado ao período anterior</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={barData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="service" fontSize={12} />
                                        <YAxis fontSize={12} />
                                        <Tooltip formatter={(value) => (typeof value === 'number' ? formatCurrency(value, data.currency) : '')} />
                                        <Legend />
                                        <Bar dataKey="current" fill="#3b82f6" name="Mês Atual" />
                                        <Bar dataKey="previous" fill="#9ca3af" name="Mês Anterior" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className={cn('h-4 w-4', data.criticalAnomalies > 0 ? 'text-destructive' : 'text-yellow-500')} />
                        Prioridades Globais
                    </CardTitle>
                    <CardDescription>Resumo simplificado para decidir onde agir primeiro</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg bg-muted/60 p-3">
                            <p className="text-xs text-muted-foreground">Anomalias abertas</p>
                            <p className="mt-1 text-xl font-bold">{data.openAnomalies.length}</p>
                        </div>
                        <div className="rounded-lg bg-muted/60 p-3">
                            <p className="text-xs text-muted-foreground">Críticas / Altas</p>
                            <p className="mt-1 text-xl font-bold">{data.criticalAnomalies}</p>
                        </div>
                        <div className="rounded-lg bg-muted/60 p-3">
                            <p className="text-xs text-muted-foreground">Economia potencial</p>
                            <p className="mt-1 text-xl font-bold">{formatCurrency(data.potentialSavings, data.currency)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/60 p-3">
                            <p className="text-xs text-muted-foreground">Recomendações abertas</p>
                            <p className="mt-1 text-xl font-bold">{openRecommendations}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/finops/anomalies">
                                Ver anomalias
                                <ArrowUpRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/finops/insights">
                                Ver insights
                                <ArrowUpRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/finops/forecast">
                                Abrir forecast
                                <ArrowUpRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
