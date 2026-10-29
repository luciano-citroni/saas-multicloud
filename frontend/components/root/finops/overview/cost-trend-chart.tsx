'use client';

import { useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChartViewToggle } from '@/components/root/finops/overview/chart-view-toggle';
import {
    FINOPS_CHART_GRID,
    FINOPS_CHART_MUTED,
    FINOPS_CHART_PRIMARY,
    finopsChartInitialDimension,
    finopsChartSurfaceClassName,
    finopsChartTickProps,
    finopsChartTooltipStyles,
} from '@/components/root/finops/overview/finops-chart-theme';
import { cn } from '@/lib/utils';
import { formatCurrency } from './helpers';

export type CostTrendDataPoint = {
    date: string;
    cost: number;
    forecast?: number;
};

export type ChartType = 'line' | 'bar';
export type ChartGranularity = 'day' | 'week' | 'month' | 'year';

type CostTrendChartProps = {
    data: CostTrendDataPoint[];
    currency?: string;
    title?: string;
    description?: string;
    isLoading?: boolean;
    defaultChartType?: ChartType;
    defaultGranularity?: ChartGranularity;
};

function startOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day; // segunda como início
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
}

function toDateKey(date: Date, granularity: ChartGranularity): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (granularity === 'year') return String(year);
    if (granularity === 'month') return `${year}-${month}`;
    if (granularity === 'week') {
        const weekStart = startOfWeek(date);
        const wYear = weekStart.getFullYear();
        const wMonth = String(weekStart.getMonth() + 1).padStart(2, '0');
        const wDay = String(weekStart.getDate()).padStart(2, '0');
        return `${wYear}-${wMonth}-${wDay}`;
    }
    return `${year}-${month}-${day}`;
}

function formatBucketLabel(key: string, granularity: ChartGranularity): string {
    if (granularity === 'year') return key;

    if (granularity === 'month') {
        const [year, month] = key.split('-').map(Number);
        return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
            month: 'short',
            year: 'numeric',
        });
    }

    if (granularity === 'week') {
        const date = new Date(`${key}T00:00:00`);
        return `Sem ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
    }

    const date = new Date(`${key}T00:00:00`);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function aggregateTrendData(
    data: CostTrendDataPoint[],
    granularity: ChartGranularity
): Array<{ key: string; label: string; cost: number; forecast?: number }> {
    const buckets = new Map<string, { cost: number; forecastSum: number; forecastCount: number }>();

    for (const point of data) {
        const parsed = new Date(point.date.includes('T') ? point.date : `${point.date}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) continue;

        const key = toDateKey(parsed, granularity);
        const current = buckets.get(key) ?? { cost: 0, forecastSum: 0, forecastCount: 0 };
        current.cost += Number(point.cost ?? 0);
        if (point.forecast !== undefined && point.forecast !== null) {
            current.forecastSum += Number(point.forecast);
            current.forecastCount += 1;
        }
        buckets.set(key, current);
    }

    return Array.from(buckets.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({
            key,
            label: formatBucketLabel(key, granularity),
            cost: value.cost,
            forecast: value.forecastCount > 0 ? value.forecastSum / value.forecastCount : undefined,
        }));
}

const GRANULARITY_OPTIONS: Array<{ value: ChartGranularity; label: string }> = [
    { value: 'day', label: 'Dia' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mês' },
    { value: 'year', label: 'Ano' },
];

export function CostTrendChart({
    data,
    currency = 'USD',
    title = 'Custo ao longo do tempo',
    description = 'Últimos 30 dias',
    isLoading = false,
    defaultChartType = 'line',
    defaultGranularity = 'day',
}: CostTrendChartProps) {
    const [chartType, setChartType] = useState<ChartType>(defaultChartType);
    const [granularity, setGranularity] = useState<ChartGranularity>(defaultGranularity);

    const chartData = useMemo(() => aggregateTrendData(data ?? [], granularity), [data, granularity]);
    const hasForecast = chartData.some((point) => point.forecast !== undefined);

    const controls = (
        <div className="flex flex-wrap items-center gap-2">
            <ChartViewToggle value={chartType} onChange={setChartType} />

            <div
                className="inline-flex w-fit items-center rounded-lg border border-border p-0.5"
                role="group"
                aria-label="Granularidade"
            >
                {GRANULARITY_OPTIONS.map((option) => (
                    <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={cn(
                            'h-8 border-0 px-2.5 shadow-none',
                            granularity === option.value
                                ? 'bg-muted text-foreground hover:bg-muted'
                                : 'text-muted-foreground hover:bg-transparent hover:text-foreground'
                        )}
                        onClick={() => setGranularity(option.value)}
                        aria-pressed={granularity === option.value}
                    >
                        {option.label}
                    </Button>
                ))}
            </div>
        </div>
    );

    if (isLoading) {
        return (
            <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                    </div>
                    {controls}
                </CardHeader>
                <CardContent>
                    <div className="h-64 animate-pulse rounded-lg bg-muted" />
                </CardContent>
            </Card>
        );
    }

    if (!data || data.length === 0 || chartData.length === 0) {
        return (
            <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                    </div>
                    {controls}
                </CardHeader>
                <CardContent>
                    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                        Nenhum dado disponível
                    </div>
                </CardContent>
            </Card>
        );
    }

    const commonAxis = (
        <>
            <CartesianGrid strokeDasharray="3 3" stroke={FINOPS_CHART_GRID} vertical={false} />
            <XAxis
                dataKey="label"
                interval="preserveStartEnd"
                minTickGap={24}
                tick={finopsChartTickProps}
                axisLine={{ stroke: FINOPS_CHART_GRID }}
                tickLine={{ stroke: FINOPS_CHART_GRID }}
            />
            <YAxis
                tick={finopsChartTickProps}
                tickFormatter={(value) => formatCurrency(Number(value), currency)}
                width={80}
                axisLine={{ stroke: FINOPS_CHART_GRID }}
                tickLine={{ stroke: FINOPS_CHART_GRID }}
            />
            <Tooltip
                formatter={(value) => (typeof value === 'number' ? formatCurrency(value, currency) : '')}
                labelFormatter={(label) => `${granularity === 'week' ? 'Semana de' : 'Período'}: ${label}`}
                contentStyle={finopsChartTooltipStyles.contentStyle}
                labelStyle={finopsChartTooltipStyles.labelStyle}
                itemStyle={finopsChartTooltipStyles.itemStyle}
                cursor={finopsChartTooltipStyles.cursor}
            />
            <Legend wrapperStyle={{ color: 'var(--muted-foreground)' }} />
        </>
    );

    return (
        <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription className={cn('mt-1')}>
                        {description}
                        {' · '}
                        {GRANULARITY_OPTIONS.find((option) => option.value === granularity)?.label}
                    </CardDescription>
                </div>
                {controls}
            </CardHeader>
            <CardContent>
                <div className={cn('h-72 w-full min-w-0', finopsChartSurfaceClassName)}>
                    <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
                        {chartType === 'line' ? (
                            <LineChart data={chartData}>
                                {commonAxis}
                                <Line
                                    type="monotone"
                                    dataKey="cost"
                                    stroke={FINOPS_CHART_PRIMARY}
                                    name="Custo"
                                    strokeWidth={2}
                                    dot={chartData.length <= 31 ? { fill: FINOPS_CHART_PRIMARY, strokeWidth: 0 } : false}
                                    activeDot={{ r: 5, fill: FINOPS_CHART_PRIMARY }}
                                />
                                {hasForecast && (
                                    <Line
                                        type="monotone"
                                        dataKey="forecast"
                                        stroke={FINOPS_CHART_MUTED}
                                        name="Previsão"
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={false}
                                    />
                                )}
                            </LineChart>
                        ) : (
                            <BarChart data={chartData}>
                                {commonAxis}
                                <Bar dataKey="cost" fill={FINOPS_CHART_PRIMARY} name="Custo" radius={[4, 4, 0, 0]} />
                                {hasForecast && (
                                    <Bar
                                        dataKey="forecast"
                                        fill={FINOPS_CHART_MUTED}
                                        name="Previsão"
                                        radius={[4, 4, 0, 0]}
                                    />
                                )}
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
