'use client';

import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { InventoryMonthlyPoint } from '@/app/actions/cloud-inventory';
import {
    FINOPS_CHART_GRID,
    FINOPS_CHART_PRIMARY,
    finopsChartInitialDimension,
    finopsChartSurfaceClassName,
    finopsChartTickProps,
    finopsChartTooltipStyles,
} from '@/components/root/finops/overview/finops-chart-theme';
import { cn } from '@/lib/utils';
import { formatNumber, toIntlLocale, useTranslations } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';

type InventoryMonthlyChartProps = {
    data: InventoryMonthlyPoint[];
    isLoading?: boolean;
};

function formatMonthLabel(month: string): string {
    const [year, monthPart] = month.split('-');
    if (!year || !monthPart) return month;
    const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1));
    return new Intl.DateTimeFormat(toIntlLocale(getLocale()), {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
    }).format(date);
}

export function InventoryMonthlyChart({ data, isLoading = false }: InventoryMonthlyChartProps) {
    const t = useTranslations('inventory');
    const chartData = data.map((point) => ({
        ...point,
        label: formatMonthLabel(point.month),
    }));

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{t.chartTitle}</CardTitle>
                <CardDescription>{t.chartDescription}</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                        {t.loading}
                    </div>
                ) : chartData.length === 0 ? (
                    <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                        {t.chartEmpty}
                    </div>
                ) : (
                    <div className={cn('h-72 w-full min-w-0', finopsChartSurfaceClassName)}>
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                            initialDimension={finopsChartInitialDimension}
                        >
                            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke={FINOPS_CHART_GRID} vertical={false} />
                                <XAxis dataKey="label" tick={finopsChartTickProps} axisLine={false} tickLine={false} />
                                <YAxis
                                    allowDecimals={false}
                                    tick={finopsChartTickProps}
                                    axisLine={false}
                                    tickLine={false}
                                    width={40}
                                />
                                <Tooltip
                                    {...finopsChartTooltipStyles}
                                    formatter={(value) => [
                                        formatNumber(typeof value === 'number' ? value : Number(value) || 0),
                                        t.chartSeries,
                                    ]}
                                    labelFormatter={(label) => String(label)}
                                />
                                <Bar dataKey="count" fill={FINOPS_CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
