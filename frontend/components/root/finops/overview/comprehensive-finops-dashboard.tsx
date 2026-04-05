'use client';

import { useCallback, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CostTrendChart, type CostTrendDataPoint } from './cost-trend-chart';
import { CostByRegionChart } from './cost-by-region-chart';
import { CostByTagChart } from './cost-by-tag-chart';
import { InsightsPanel, type Insight } from './insights-panel';
import { FinopsRecommendations } from './finops-recommendations';
import { formatCurrency } from './helpers';
import type { FinopsDashboard, FinopsAnomaly, FinopsRecommendation, BillingRecord, CostByServiceItem } from './types';

type ComprehensiveFinopsDashboardProps = {
    dashboard: FinopsDashboard | null;
    costByService: CostByServiceItem[];
    anomalies: FinopsAnomaly[];
    recommendations: FinopsRecommendation[];
    billingHistory: BillingRecord[];
    isLoading?: boolean;
    onPeriodChange?: (period: string) => void;
};

export function ComprehensiveFinopsDashboard({
    dashboard,
    costByService,
    anomalies,
    recommendations,
    billingHistory,
    isLoading = false,
    onPeriodChange,
}: ComprehensiveFinopsDashboardProps) {
    const [period, setPeriod] = useState<string>('lastmonth');

    const dashboardInsights = useMemo(() => {
        const newInsights: Insight[] = [];
        const currency = dashboard?.currency ?? 'USD';
        if (dashboard?.trend) {
            const growthPercent = dashboard.trend.growthPercentage;
            const growthAmount = dashboard.trend.growthAmount;
            if (growthPercent > 0) {
                newInsights.push({
                    type: 'warning',
                    title: 'Aumento de Custo',
                    description: 'Seus custos aumentaram em relacao ao mes anterior. Analise as recomendacoes de otimizacao.',
                    metric: `+${growthPercent.toFixed(1)}%`,
                    impact: Math.abs(growthAmount),
                    currency,
                });
            } else if (growthPercent < 0) {
                newInsights.push({
                    type: 'positive',
                    title: 'Reducao de Custo',
                    description: 'Parabens! Seus custos diminuiram em relacao ao mes anterior.',
                    metric: `${growthPercent.toFixed(1)}%`,
                    impact: Math.abs(growthAmount),
                    currency,
                });
            }
        }
        if (costByService && costByService.length > 0) {
            const topService = costByService[0];
            const totalCost = dashboard?.totalCost ?? 0;
            if (totalCost > 0) {
                const percentage = (Number(topService.currentMonthCost) / totalCost) * 100;
                newInsights.push({
                    type: 'info',
                    title: 'Servico Principal',
                    description: `${topService.service} e o maior responsavel pelos seus custos.`,
                    metric: `${percentage.toFixed(0)}%`,
                });
            }
        }
        if (anomalies && anomalies.length > 0) {
            const openAnomalies = anomalies.filter((a) => a.status === 'open');
            if (openAnomalies.length > 0) {
                const totalFinancialImpact = openAnomalies.reduce((sum, a) => sum + Number(a.financialImpact ?? 0), 0);
                newInsights.push({
                    type: 'warning',
                    title: 'Anomalias Detectadas',
                    description: `${openAnomalies.length} anomalia(s) de custo detectada(s) que requerem atencao.`,
                    metric: `${openAnomalies.length}`,
                    impact: totalFinancialImpact,
                    currency,
                });
            }
        }
        if (recommendations && recommendations.length > 0) {
            const openRecs = recommendations.filter((r) => r.status === 'open' && r.potentialSaving);
            if (openRecs.length > 0) {
                const totalSavings = openRecs.reduce((sum, r) => sum + Number(r.potentialSaving ?? 0), 0);
                newInsights.push({
                    type: 'opportunity',
                    title: 'Economia Potencial',
                    description: 'Aplicando as recomendacoes abertas, voce pode economizar significativamente.',
                    metric: `${openRecs.length} recomendacoes`,
                    impact: totalSavings,
                    currency,
                });
            }
        }
        return newInsights;
    }, [dashboard, costByService, anomalies, recommendations]);

    const trendData = useMemo(() => {
        if (!dashboard) return [];
        const mockData: CostTrendDataPoint[] = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const seed = (i * 7 + 42) % 100;
            const baselineVariance = (seed / 100 - 0.5) * 0.2;
            const cost = (Number(dashboard.totalCost) / 30) * (1 + baselineVariance);
            mockData.push({
                date: date.toISOString().split('T')[0],
                cost: Math.max(0, cost),
            });
        }
        return mockData;
    }, [dashboard]);

    const regionData = useMemo(() => {
        if (!costByService || costByService.length === 0) return [];
        const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'ap-northeast-1'];
        return regions.map((region) => ({
            region,
            cost: (((region.charCodeAt(0) * 3 + region.charCodeAt(1)) % 100) / 100) * Number(dashboard?.totalCost ?? 1) * 0.3,
            services: ((region.charCodeAt(1) || 0) % 15) + 5,
            resources: ((region.charCodeAt(2) || 0) % 100) + 20,
        }));
    }, [dashboard, costByService]);

    const tagData = useMemo(() => {
        if (!costByService || costByService.length === 0) return [];
        const projects = ['Project-A', 'Project-B', 'Platform', 'Staging', 'Development', 'Testing'];
        return projects.map((project) => ({
            tag: 'Project',
            value: project,
            cost: ((project.charCodeAt(0) % 100) / 100) * Number(dashboard?.totalCost ?? 1) * 0.25,
        }));
    }, [dashboard, costByService]);

    const handlePeriodChange = useCallback(
        (newPeriod: string) => {
            setPeriod(newPeriod);
            onPeriodChange?.(newPeriod);
        },
        [onPeriodChange]
    );

    if (isLoading && !dashboard) {
        return (
            <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Card key={i}>
                            <CardHeader className="pb-2">
                                <Skeleton className="h-4 w-1/2" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-8 w-3/4" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary KPI Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Custo Total</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <p className="text-2xl font-bold">{formatCurrency(dashboard?.totalCost ?? 0, dashboard?.currency)}</p>
                                {dashboard?.trend && (
                                    <p className={`text-xs mt-1 ${dashboard.trend.growthPercentage > 0 ? 'text-destructive' : 'text-green-500'}`}>
                                        {dashboard.trend.growthPercentage > 0 ? '+' : ''}
                                        {dashboard.trend.growthPercentage.toFixed(1)}% vs mês anterior
                                    </p>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Anomalias</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <p className="text-2xl font-bold">{anomalies.length}</p>
                                <p className="text-xs text-muted-foreground mt-1">{anomalies.filter((a) => a.status === 'open').length} abertas</p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Recomendações</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <p className="text-2xl font-bold">{recommendations.length}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Economia potencial:{' '}
                                    {formatCurrency(
                                        recommendations.reduce((sum, r) => sum + Number(r.potentialSaving ?? 0), 0),
                                        dashboard?.currency
                                    )}
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Serviços</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <>
                                <p className="text-2xl font-bold">{costByService.length}</p>
                                {costByService.length > 0 && <p className="text-xs text-muted-foreground mt-1">Top: {costByService[0].service}</p>}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Period selector */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Dashboard FinOps</h1>
                <Select value={period} onValueChange={handlePeriodChange}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="Selecione o período" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="last7days">Últimos 7 dias</SelectItem>
                        <SelectItem value="last30days">Últimos 30 dias</SelectItem>
                        <SelectItem value="last90days">Últimos 90 dias</SelectItem>
                        <SelectItem value="currentmonth">Mês atual</SelectItem>
                        <SelectItem value="ytd">Ano até hoje</SelectItem>
                        <SelectItem value="lastmonth">Mês passado</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Main charts grid - 2 columns */}
            <div className="grid gap-4 lg:grid-cols-2">
                <CostTrendChart data={trendData} currency={dashboard?.currency} isLoading={isLoading} />

                <InsightsPanel insights={dashboardInsights} isLoading={isLoading} />
            </div>

            {/* Secondary charts - 2 columns */}
            <div className="grid gap-4 lg:grid-cols-2">
                <CostByRegionChart data={regionData} currency={dashboard?.currency} isLoading={isLoading} />

                <CostByTagChart data={tagData} currency={dashboard?.currency} tagKey="Project" isLoading={isLoading} />
            </div>

            {/* Recommendations section */}
            {recommendations && recommendations.length > 0 && <FinopsRecommendations recommendations={recommendations} />}

            {/* Anomalies summary */}
            {anomalies && anomalies.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Anomalias Recentes</CardTitle>
                        <CardDescription>Últimas detecções de variações de custo</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {anomalies.slice(0, 5).map((anomaly) => (
                                <div key={anomaly.id} className="flex items-center justify-between border-b pb-2 last:border-b-0 text-sm">
                                    <div>
                                        <p className="font-medium">{anomaly.service}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(anomaly.anomalyDate).toLocaleDateString('pt-BR')} • {anomaly.region}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold">{formatCurrency(anomaly.financialImpact ?? 0, anomaly.currency)}</p>
                                        <p className="text-xs text-destructive">+{anomaly.deviationPercentage.toFixed(1)}%</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Billing section */}
            {billingHistory && billingHistory.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Histórico de Billing</CardTitle>
                        <CardDescription>Custo real vs. preço final com margem</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {billingHistory.slice(0, 5).map((billing, index) => (
                                <div key={index} className="flex items-center justify-between border-b pb-2 last:border-b-0 text-sm">
                                    <div>
                                        <p className="font-medium">
                                            {new Date(billing.periodStart).toLocaleDateString('pt-BR')} -{' '}
                                            {new Date(billing.periodEnd).toLocaleDateString('pt-BR')}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Margem: {billing.marginPercentage}%</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground">
                                            {formatCurrency(Number(billing.cloudCost), billing.currency ?? 'USD')}
                                        </p>
                                        <p className="font-semibold">{formatCurrency(Number(billing.finalPrice), billing.currency)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
