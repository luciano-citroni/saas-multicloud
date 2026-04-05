'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowUpRight, BarChart2, DollarSign, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
    type KpiStatus,
    getAnomalyStatus,
    getForecastStatus,
    getGrowthStatus,
    getPortfolioHealth,
    getRecommendationStatus,
    getSavingsCoverageStatus,
} from '@/lib/finops-kpi-thresholds';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type {
    BillingRecord,
    CostByServiceItem,
    FinopsAnomaly,
    FinopsDashboard,
    FinopsRecommendation,
    ForecastResult,
    OptimizationInsight,
} from '@/components/root/finops/overview/types';

type DashboardPeriod = 'last7days' | 'last30days' | 'last90days' | 'currentmonth' | 'lastmonth' | 'ytd';

type FinopsDashboardPanelsProps = {
    dashboard: FinopsDashboard | null;
    costByService: CostByServiceItem[];
    anomalies: FinopsAnomaly[];
    recommendations: FinopsRecommendation[];
    forecast: ForecastResult | null;
    insights: OptimizationInsight | null;
    billingHistory: BillingRecord[];
    onPeriodChange?: (period: DashboardPeriod) => void;
};

function toItemList<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];

    const items = (payload as { items?: unknown })?.items;
    return Array.isArray(items) ? (items as T[]) : [];
}

function serviceLabel(service: string): string {
    return service
        .replace(/^Amazon\s+/i, '')
        .replace(/^AWS\s+/i, '')
        .slice(0, 28);
}

function periodLabel(period: DashboardPeriod): string {
    if (period === 'last7days') return '7 dias';
    if (period === 'last30days') return '30 dias';
    if (period === 'last90days') return '90 dias';
    if (period === 'currentmonth') return 'Mês atual';
    if (period === 'lastmonth') return 'Mês passado';
    return 'Ano até hoje';
}

function kpiStatusClasses(status: KpiStatus): string {
    if (status === 'critical') return 'border-destructive/30 bg-destructive/10 text-destructive';
    if (status === 'warning') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
}

function kpiStatusLabel(status: KpiStatus): string {
    if (status === 'critical') return 'critico';
    if (status === 'warning') return 'atencao';
    return 'saudavel';
}

export function FinopsDashboardPanels({
    dashboard,
    costByService,
    anomalies,
    recommendations,
    forecast,
    insights,
    billingHistory,
    onPeriodChange,
}: FinopsDashboardPanelsProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const selectedPeriod = (searchParams.get('period') as DashboardPeriod | null) ?? 'lastmonth';
    const selectedProvider = searchParams.get('provider') ?? 'all';
    const selectedService = searchParams.get('service') ?? 'all';
    const selectedAccount = searchParams.get('account');

    const setFilterParam = (key: 'period' | 'provider' | 'service', value: string) => {
        const params = new URLSearchParams(searchParams.toString());

        if (!value || value === 'all') {
            params.delete(key);
        } else {
            params.set(key, value);
        }

        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    };

    useEffect(() => {
        if (
            selectedPeriod === 'last7days' ||
            selectedPeriod === 'last30days' ||
            selectedPeriod === 'last90days' ||
            selectedPeriod === 'currentmonth' ||
            selectedPeriod === 'lastmonth' ||
            selectedPeriod === 'ytd'
        ) {
            onPeriodChange?.(selectedPeriod);
        }
    }, [onPeriodChange, selectedPeriod]);

    const providerOptions = useMemo(() => {
        const providers = new Set<string>();
        anomalies.forEach((anomaly) => providers.add(anomaly.cloudProvider));
        recommendations.forEach((recommendation) => providers.add(recommendation.cloudProvider));
        return ['all', ...Array.from(providers).sort()];
    }, [anomalies, recommendations]);

    const serviceOptions = useMemo(() => {
        const rankedServices = [...costByService]
            .sort((left, right) => Number(right.currentMonthCost) - Number(left.currentMonthCost))
            .map((item) => item.service);
        return ['all', ...Array.from(new Set(rankedServices))];
    }, [costByService]);

    const normalizedProvider = providerOptions.includes(selectedProvider) ? selectedProvider : 'all';
    const normalizedService = serviceOptions.includes(selectedService) ? selectedService : 'all';

    const clearFilters = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('period');
        params.delete('provider');
        params.delete('service');

        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    };

    const filteredCosts = useMemo(() => {
        if (normalizedService === 'all') return costByService;
        return costByService.filter((item) => item.service === normalizedService);
    }, [costByService, normalizedService]);

    const filteredAnomalies = useMemo(() => {
        if (normalizedProvider === 'all') return anomalies;
        return anomalies.filter((anomaly) => anomaly.cloudProvider === normalizedProvider);
    }, [anomalies, normalizedProvider]);

    const filteredRecommendations = useMemo(() => {
        if (normalizedProvider === 'all') return recommendations;
        return recommendations.filter((recommendation) => recommendation.cloudProvider === normalizedProvider);
    }, [recommendations, normalizedProvider]);

    const normalizedCosts = toItemList<CostByServiceItem>(filteredCosts)
        .filter((item) => Number(item.currentMonthCost) >= 0)
        .sort((left, right) => Number(right.currentMonthCost) - Number(left.currentMonthCost));

    const topCosts = normalizedCosts.slice(0, 5);
    const totalTopCost = topCosts.reduce((sum, item) => sum + Number(item.currentMonthCost), 0);

    const openAnomalies = filteredAnomalies.filter((anomaly) => anomaly.status === 'open');
    const criticalAnomalies = openAnomalies.filter((anomaly) => anomaly.severity === 'critical' || anomaly.severity === 'high').length;

    const recommendationSavings = filteredRecommendations
        .filter((recommendation) => recommendation.status === 'open' && recommendation.potentialSaving != null)
        .reduce((sum, recommendation) => sum + Number(recommendation.potentialSaving), 0);

    const openRecommendations = filteredRecommendations.filter((recommendation) => recommendation.status === 'open').length;
    const potentialSavings = Math.max(Number(insights?.totalWaste ?? 0), recommendationSavings);

    const currency = dashboard?.currency ?? forecast?.currency ?? billingHistory[0]?.currency ?? topCosts[0]?.currency ?? 'USD';
    const lastBilling = billingHistory[0] ?? null;
    const currentPeriodCost = Number(dashboard?.trend.currentPeriodCost ?? dashboard?.totalCost ?? 0);
    const previousPeriodCost = Number(dashboard?.trend.previousPeriodCost ?? 0);
    const growthPercentage = Number(dashboard?.trend.growthPercentage ?? 0);
    const topServiceShare = dashboard?.totalCost && topCosts[0] ? (Number(topCosts[0].currentMonthCost) / Number(dashboard.totalCost)) * 100 : 0;
    const savingsCoverage = currentPeriodCost > 0 ? (potentialSavings / currentPeriodCost) * 100 : 0;
    const forecastDelta = forecast ? Number(forecast.forecastedCost) - currentPeriodCost : null;
    const forecastDeltaPercentage = forecast && currentPeriodCost > 0 ? (forecastDelta! / currentPeriodCost) * 100 : null;

    const growthStatus = getGrowthStatus(growthPercentage);
    const anomalyStatus = getAnomalyStatus(criticalAnomalies);
    const recommendationStatus = getRecommendationStatus(openRecommendations);
    const savingsCoverageStatus = getSavingsCoverageStatus(savingsCoverage);
    const forecastStatus = getForecastStatus(forecastDeltaPercentage);
    const portfolioHealth = getPortfolioHealth([growthStatus, anomalyStatus, recommendationStatus, forecastStatus]);

    const sharedQuery = `${selectedAccount ? `account=${encodeURIComponent(selectedAccount)}&` : ''}period=${encodeURIComponent(selectedPeriod)}${
        normalizedProvider !== 'all' ? `&provider=${encodeURIComponent(normalizedProvider)}` : ''
    }${normalizedService !== 'all' ? `&service=${encodeURIComponent(normalizedService)}` : ''}`;
    const hasCustomFilters = selectedPeriod !== 'lastmonth' || normalizedProvider !== 'all' || normalizedService !== 'all';

    return (
        <div className="space-y-4">
            <div className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium">Filtros do dashboard</p>
                        <p className="text-xs text-muted-foreground">Ajuste período, cloud e serviço para refinar os indicadores abaixo</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={clearFilters} disabled={!hasCustomFilters}>
                        Limpar filtros
                    </Button>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <Select value={selectedPeriod} onValueChange={(value) => setFilterParam('period', value)}>
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

                    <Select value={normalizedProvider} onValueChange={(value) => setFilterParam('provider', value)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Cloud" />
                        </SelectTrigger>
                        <SelectContent>
                            {providerOptions.map((provider) => (
                                <SelectItem key={provider} value={provider}>
                                    {provider === 'all' ? 'Todas as clouds' : provider.toUpperCase()}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={normalizedService} onValueChange={(value) => setFilterParam('service', value)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Serviço" />
                        </SelectTrigger>
                        <SelectContent>
                            {serviceOptions.map((service) => (
                                <SelectItem key={service} value={service}>
                                    {service === 'all' ? 'Todos os serviços' : serviceLabel(service)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Período: {periodLabel(selectedPeriod)}</Badge>
                    <Badge variant="outline">Cloud: {normalizedProvider === 'all' ? 'todas' : normalizedProvider.toUpperCase()}</Badge>
                    <Badge variant="outline">Serviço: {normalizedService === 'all' ? 'todos' : serviceLabel(normalizedService)}</Badge>
                </div>
            </div>

            <div className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium">Saúde operacional FinOps</p>
                        <p className="text-xs text-muted-foreground">Classificação automática com base em tendência, anomalias, backlog e forecast</p>
                    </div>
                    <Badge variant="outline" className={kpiStatusClasses(portfolioHealth)}>
                        {kpiStatusLabel(portfolioHealth)}
                    </Badge>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Custo monitorado</p>
                        <Badge variant="outline" className="border-muted bg-muted/40 text-muted-foreground">
                            base
                        </Badge>
                    </div>
                    <p className="mt-1 text-lg font-bold">{formatCurrency(currentPeriodCost, currency)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">vs anterior: {formatCurrency(previousPeriodCost, currency)}</p>
                </div>

                <div className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Tendência</p>
                        <Badge variant="outline" className={kpiStatusClasses(growthStatus)}>
                            {kpiStatusLabel(growthStatus)}
                        </Badge>
                    </div>
                    <p
                        className={cn(
                            'mt-1 inline-flex items-center gap-1 text-lg font-bold',
                            growthPercentage > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                        )}
                    >
                        {growthPercentage > 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                        {growthPercentage > 0 ? '+' : ''}
                        {growthPercentage.toFixed(1)}%
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{periodLabel(selectedPeriod)}</p>
                </div>

                <div className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Anomalias críticas</p>
                        <Badge variant="outline" className={kpiStatusClasses(anomalyStatus)}>
                            {kpiStatusLabel(anomalyStatus)}
                        </Badge>
                    </div>
                    <p className="mt-1 text-lg font-bold">{criticalAnomalies}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{openAnomalies.length} abertas no total</p>
                </div>

                <div className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Recomendações abertas</p>
                        <Badge variant="outline" className={kpiStatusClasses(recommendationStatus)}>
                            {kpiStatusLabel(recommendationStatus)}
                        </Badge>
                    </div>
                    <p className="mt-1 text-lg font-bold">{openRecommendations}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">filtro cloud: {normalizedProvider === 'all' ? 'todas' : normalizedProvider}</p>
                </div>

                <div className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Economia potencial</p>
                        <Badge variant="outline" className={kpiStatusClasses(savingsCoverageStatus)}>
                            {kpiStatusLabel(savingsCoverageStatus)}
                        </Badge>
                    </div>
                    <p className="mt-1 text-lg font-bold">{formatCurrency(potentialSavings, currency)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{savingsCoverage.toFixed(1)}% do custo do período</p>
                </div>

                <div className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Desvio do forecast</p>
                        <Badge variant="outline" className={kpiStatusClasses(forecastStatus)}>
                            {kpiStatusLabel(forecastStatus)}
                        </Badge>
                    </div>
                    <p
                        className={cn(
                            'mt-1 text-lg font-bold',
                            forecastDelta != null && forecastDelta > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                        )}
                    >
                        {forecastDelta != null ? formatCurrency(forecastDelta, currency) : '--'}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        {forecastDeltaPercentage != null
                            ? `${forecastDeltaPercentage > 0 ? '+' : ''}${forecastDeltaPercentage.toFixed(1)}% sobre custo atual`
                            : 'aguardando dados de forecast'}
                    </p>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-xl border">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <div>
                            <p className="text-sm font-medium">Distribuição de custos</p>
                            <p className="text-xs text-muted-foreground">Top serviços no período selecionado</p>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href={`/finops/costs?${sharedQuery}`}>
                                <BarChart2 className="size-4" />
                                Detalhar
                            </Link>
                        </Button>
                    </div>

                    {topCosts.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">Sem dados para os filtros selecionados.</div>
                    ) : (
                        <div className="space-y-3 p-4">
                            {topCosts.map((item) => {
                                const amount = Number(item.currentMonthCost);
                                const percentage = totalTopCost > 0 ? (amount / totalTopCost) * 100 : 0;
                                const isIncrease = item.trend === 'up' && item.changePercentage > 0;

                                return (
                                    <div key={item.service} className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-medium">{serviceLabel(item.service)}</p>
                                                <p className="text-xs text-muted-foreground">{percentage.toFixed(1)}% do total monitorado</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold tabular-nums">{formatCurrency(amount, item.currency)}</p>
                                                <p
                                                    className={cn(
                                                        'inline-flex items-center gap-1 text-xs',
                                                        isIncrease ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                                                    )}
                                                >
                                                    {isIncrease ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                                                    {Math.abs(item.changePercentage).toFixed(1)}%
                                                </p>
                                            </div>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(percentage, 100)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary"
                                    style={{
                                        width: `${Math.min((totalTopCost / Math.max(Number(dashboard?.totalCost ?? 0), totalTopCost)) * 100, 100)}%`,
                                    }}
                                />
                            </div>
                            <p className="mt-1 text-right text-[11px] text-muted-foreground">
                                Top serviços representam {dashboard?.totalCost ? ((totalTopCost / Number(dashboard.totalCost)) * 100).toFixed(1) : '100.0'}
                                % do custo total monitorado
                            </p>
                            {topCosts[0] ? (
                                <p className="text-right text-[11px] text-muted-foreground">
                                    Concentração do maior serviço: {topServiceShare.toFixed(1)}%
                                </p>
                            ) : null}
                        </div>
                    )}
                </div>

                <div className="rounded-xl border">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <div>
                            <p className="text-sm font-medium">Riscos e oportunidades</p>
                            <p className="text-xs text-muted-foreground">Anomalias abertas e potencial de economia</p>
                        </div>
                        <AlertTriangle className="size-4 text-muted-foreground" />
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-4">
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Anomalias abertas</p>
                            <p className="mt-1 text-2xl font-bold">{openAnomalies.length}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{criticalAnomalies} crítica(s)/alta(s)</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                                <Badge variant="outline">{periodLabel(selectedPeriod)}</Badge>
                                <Badge variant="outline">Prioridade operacional</Badge>
                            </div>
                        </div>

                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Economia potencial</p>
                            <p className="mt-1 truncate text-lg font-bold">{formatCurrency(potentialSavings, currency)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">recomendações + insights</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                                <Badge variant="outline">Ações abertas</Badge>
                                <Badge variant="outline">Impacto mensal</Badge>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t px-4 py-3">
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/finops/anomalies?${sharedQuery}`}>
                                Ver anomalias
                                <ArrowUpRight className="size-4" />
                            </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/finops/insights?${sharedQuery}`}>
                                Ver insights
                                <Lightbulb className="size-4" />
                            </Link>
                        </Button>
                    </div>
                </div>

                <div className="rounded-xl border">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <div>
                            <p className="text-sm font-medium">Projeção financeira</p>
                            <p className="text-xs text-muted-foreground">Forecast atual + último billing calculado</p>
                        </div>
                        <DollarSign className="size-4 text-muted-foreground" />
                    </div>

                    <div className="space-y-3 p-4">
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Forecast do mês</p>
                            <p className="mt-1 truncate text-xl font-bold">
                                {forecast ? formatCurrency(forecast.forecastedCost, forecast.currency) : '--'}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {forecast ? `${forecast.daysElapsed}d decorridos · ${forecast.daysRemaining}d restantes` : 'Sem projeção disponível'}
                            </p>
                        </div>

                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Último billing</p>
                            <p className="mt-1 truncate text-xl font-bold">
                                {lastBilling ? formatCurrency(Number(lastBilling.finalPrice), lastBilling.currency) : '--'}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {lastBilling ? `margem ${Number(lastBilling.marginPercentage).toFixed(1)}%` : 'Calcule billing para acompanhar margem'}
                            </p>
                        </div>
                    </div>

                    <div className="border-t px-4 py-3">
                        <Button variant="outline" size="sm" className="w-full" asChild>
                            <Link href={`/finops/forecast?${sharedQuery}`}>Abrir forecast completo</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
