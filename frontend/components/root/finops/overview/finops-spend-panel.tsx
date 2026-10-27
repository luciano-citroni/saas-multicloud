'use client';

import { useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CostTrendChart, type ChartType } from '@/components/root/finops/overview/cost-trend-chart';
import { ChartViewToggle } from '@/components/root/finops/overview/chart-view-toggle';
import {
    FINOPS_CHART_COLORS,
    FINOPS_CHART_GRID,
    FINOPS_CHART_PRIMARY,
    finopsChartSurfaceClassName,
    finopsChartTickProps,
    finopsChartTooltipStyles,
} from '@/components/root/finops/overview/finops-chart-theme';
import { formatCurrency, isTaxService } from '@/components/root/finops/overview/helpers';
import type { CostByServiceItem, OrgFinopsOverview, OrgOverviewAccount } from '@/components/root/finops/overview/types';
import { cn } from '@/lib/utils';

type FinopsSpendPanelProps = {
    overview: OrgFinopsOverview | null;
    accounts: OrgOverviewAccount[];
    costByService: CostByServiceItem[];
    isLoading?: boolean;
    onServiceClick?: (service: string) => void;
};

function serviceLabel(service: string): string {
    return service
        .replace(/^Amazon\s+/i, '')
        .replace(/^AWS\s+/i, '')
        .slice(0, 28);
}

export function FinopsSpendPanel({
    overview,
    accounts,
    costByService,
    isLoading = false,
    onServiceClick,
}: FinopsSpendPanelProps) {
    const [servicesChartType, setServicesChartType] = useState<ChartType>('bar');
    const [providerChartType, setProviderChartType] = useState<ChartType>('bar');

    if (isLoading || !overview) {
        return (
            <div className="grid gap-4">
                <div className="h-72 animate-pulse rounded-xl border bg-muted" />
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="h-72 animate-pulse rounded-xl border bg-muted" />
                    <div className="h-72 animate-pulse rounded-xl border bg-muted" />
                </div>
            </div>
        );
    }

    const { totals, costTrend } = overview;
    const topServices = costByService
        .filter((item) => !isTaxService(item.service))
        .slice(0, 8)
        .map((item) => ({
            name: serviceLabel(item.service),
            cost: Number(item.currentMonthCost),
            fullName: item.service,
            changePercentage: item.changePercentage,
        }));

    const byProviderMap = new Map<string, number>();
    for (const account of accounts) {
        const key = (account.provider || 'other').toUpperCase();
        byProviderMap.set(key, (byProviderMap.get(key) ?? 0) + Number(account.totalCost ?? 0));
    }
    const byProvider = Array.from(byProviderMap.entries())
        .map(([name, cost]) => ({ name, cost }))
        .sort((a, b) => b.cost - a.cost);

    const topAccounts = [...accounts]
        .sort((a, b) => Number(b.totalCost) - Number(a.totalCost))
        .slice(0, 8)
        .map((account) => ({
            name: account.alias.slice(0, 18),
            fullName: account.alias,
            cost: Number(account.totalCost),
            provider: account.provider.toUpperCase(),
        }));

    return (
        <div className="flex flex-col gap-6">
            <CostTrendChart
                data={costTrend.map((point) => ({ date: point.date, cost: point.cost }))}
                currency={totals.currency}
                title="Evolução dos gastos"
                description={`${overview.period.startDate} → ${overview.period.endDate}`}
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <CardTitle>Maiores serviços</CardTitle>
                            <CardDescription>Clique em um serviço para filtrar o dashboard</CardDescription>
                        </div>
                        <ChartViewToggle value={servicesChartType} onChange={setServicesChartType} />
                    </CardHeader>
                    <CardContent>
                        {topServices.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                Nenhum custo coletado ainda. Aceite os termos e sincronize.
                            </p>
                        ) : (
                            <div className={cn('h-72 w-full min-w-0', finopsChartSurfaceClassName)}>
                                <ResponsiveContainer width="100%" height="100%">
                                    {servicesChartType === 'bar' ? (
                                        <BarChart data={topServices} layout="vertical" margin={{ left: 8, right: 16 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={FINOPS_CHART_GRID} horizontal={false} />
                                            <XAxis
                                                type="number"
                                                tickFormatter={(value) => formatCurrency(Number(value), totals.currency)}
                                                hide
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                width={120}
                                                tick={finopsChartTickProps}
                                                axisLine={{ stroke: FINOPS_CHART_GRID }}
                                                tickLine={{ stroke: FINOPS_CHART_GRID }}
                                            />
                                            <Tooltip
                                                formatter={(value) => formatCurrency(Number(value), totals.currency)}
                                                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                                                contentStyle={finopsChartTooltipStyles.contentStyle}
                                                labelStyle={finopsChartTooltipStyles.labelStyle}
                                                itemStyle={finopsChartTooltipStyles.itemStyle}
                                                cursor={finopsChartTooltipStyles.cursor}
                                            />
                                            <Bar
                                                dataKey="cost"
                                                radius={[0, 4, 4, 0]}
                                                cursor={onServiceClick ? 'pointer' : 'default'}
                                                onClick={(data) => {
                                                    const fullName = (data as { fullName?: string })?.fullName;
                                                    if (fullName && onServiceClick) onServiceClick(fullName);
                                                }}
                                            >
                                                {topServices.map((_, index) => (
                                                    <Cell
                                                        key={index}
                                                        fill={FINOPS_CHART_COLORS[index % FINOPS_CHART_COLORS.length]}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    ) : (
                                        <LineChart data={topServices} margin={{ left: 8, right: 16, bottom: 48 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={FINOPS_CHART_GRID} vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                tick={{ ...finopsChartTickProps, fontSize: 11 }}
                                                interval={0}
                                                angle={-25}
                                                textAnchor="end"
                                                height={60}
                                                axisLine={{ stroke: FINOPS_CHART_GRID }}
                                                tickLine={{ stroke: FINOPS_CHART_GRID }}
                                            />
                                            <YAxis
                                                tick={finopsChartTickProps}
                                                tickFormatter={(value) => formatCurrency(Number(value), totals.currency)}
                                                width={80}
                                                axisLine={{ stroke: FINOPS_CHART_GRID }}
                                                tickLine={{ stroke: FINOPS_CHART_GRID }}
                                            />
                                            <Tooltip
                                                formatter={(value) => formatCurrency(Number(value), totals.currency)}
                                                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                                                contentStyle={finopsChartTooltipStyles.contentStyle}
                                                labelStyle={finopsChartTooltipStyles.labelStyle}
                                                itemStyle={finopsChartTooltipStyles.itemStyle}
                                                cursor={finopsChartTooltipStyles.cursor}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="cost"
                                                stroke={FINOPS_CHART_PRIMARY}
                                                strokeWidth={2}
                                                dot={{ r: 4, fill: FINOPS_CHART_PRIMARY, strokeWidth: 0 }}
                                                activeDot={{
                                                    r: 6,
                                                    fill: FINOPS_CHART_PRIMARY,
                                                    onClick: (_event, payload) => {
                                                        const fullName = (
                                                            payload as { payload?: { fullName?: string } }
                                                        )?.payload?.fullName;
                                                        if (fullName && onServiceClick) onServiceClick(fullName);
                                                    },
                                                }}
                                            />
                                        </LineChart>
                                    )}
                                </ResponsiveContainer>
                            </div>
                        )}
                        {topServices.length > 0 && onServiceClick && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {topServices.slice(0, 4).map((item) => (
                                    <Button
                                        key={item.fullName}
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onServiceClick(item.fullName)}
                                    >
                                        {item.name}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <CardTitle>Distribuição por provedor</CardTitle>
                            <CardDescription>Custo consolidado das contas no período</CardDescription>
                        </div>
                        <ChartViewToggle value={providerChartType} onChange={setProviderChartType} />
                    </CardHeader>
                    <CardContent>
                        {byProvider.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">Sem dados de provedor</p>
                        ) : (
                            <div className={cn('h-72 w-full min-w-0', finopsChartSurfaceClassName)}>
                                <ResponsiveContainer width="100%" height="100%">
                                    {providerChartType === 'bar' ? (
                                        <BarChart data={byProvider} margin={{ left: 8, right: 16, bottom: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={FINOPS_CHART_GRID} vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                tick={finopsChartTickProps}
                                                axisLine={{ stroke: FINOPS_CHART_GRID }}
                                                tickLine={{ stroke: FINOPS_CHART_GRID }}
                                            />
                                            <YAxis
                                                tick={finopsChartTickProps}
                                                tickFormatter={(value) => formatCurrency(Number(value), totals.currency)}
                                                width={80}
                                                axisLine={{ stroke: FINOPS_CHART_GRID }}
                                                tickLine={{ stroke: FINOPS_CHART_GRID }}
                                            />
                                            <Tooltip
                                                formatter={(value) => formatCurrency(Number(value), totals.currency)}
                                                contentStyle={finopsChartTooltipStyles.contentStyle}
                                                labelStyle={finopsChartTooltipStyles.labelStyle}
                                                itemStyle={finopsChartTooltipStyles.itemStyle}
                                                cursor={finopsChartTooltipStyles.cursor}
                                            />
                                            <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                                                {byProvider.map((_, index) => (
                                                    <Cell
                                                        key={index}
                                                        fill={FINOPS_CHART_COLORS[index % FINOPS_CHART_COLORS.length]}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    ) : (
                                        <LineChart data={byProvider} margin={{ left: 8, right: 16, bottom: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={FINOPS_CHART_GRID} vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                tick={finopsChartTickProps}
                                                axisLine={{ stroke: FINOPS_CHART_GRID }}
                                                tickLine={{ stroke: FINOPS_CHART_GRID }}
                                            />
                                            <YAxis
                                                tick={finopsChartTickProps}
                                                tickFormatter={(value) => formatCurrency(Number(value), totals.currency)}
                                                width={80}
                                                axisLine={{ stroke: FINOPS_CHART_GRID }}
                                                tickLine={{ stroke: FINOPS_CHART_GRID }}
                                            />
                                            <Tooltip
                                                formatter={(value) => formatCurrency(Number(value), totals.currency)}
                                                contentStyle={finopsChartTooltipStyles.contentStyle}
                                                labelStyle={finopsChartTooltipStyles.labelStyle}
                                                itemStyle={finopsChartTooltipStyles.itemStyle}
                                                cursor={finopsChartTooltipStyles.cursor}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="cost"
                                                stroke={FINOPS_CHART_PRIMARY}
                                                strokeWidth={2}
                                                dot={{ r: 4, fill: FINOPS_CHART_PRIMARY, strokeWidth: 0 }}
                                            />
                                        </LineChart>
                                    )}
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Maiores contas</CardTitle>
                    <CardDescription>Impacto financeiro por cloud account</CardDescription>
                </CardHeader>
                <CardContent>
                    {topAccounts.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma conta com custo no período</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] text-sm">
                                <thead>
                                    <tr className="border-b text-left text-muted-foreground">
                                        <th className="pb-2 font-medium">Conta</th>
                                        <th className="pb-2 font-medium">Provedor</th>
                                        <th className="pb-2 text-right font-medium">Custo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topAccounts.map((account) => (
                                        <tr key={account.fullName} className="border-b last:border-0">
                                            <td className="py-2.5 font-medium">{account.fullName}</td>
                                            <td className="py-2.5 text-muted-foreground">{account.provider}</td>
                                            <td className="py-2.5 text-right tabular-nums">
                                                {formatCurrency(account.cost, totals.currency)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
