'use client';

import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    FINOPS_CHART_GRID,
    FINOPS_CHART_PRIMARY,
    finopsChartInitialDimension,
    finopsChartSurfaceClassName,
    finopsChartTickProps,
    finopsChartTooltipStyles,
} from '@/components/root/finops/overview/finops-chart-theme';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import { useTranslations } from '@/lib/i18n';
import { toIntlLocale } from '@/lib/i18n/format';
import { getLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';

export type SavingsProjectionPoint = {
    month: string;
    withoutSavings: number;
    withSavings: number;
    realizedSavings: number;
    openPotential: number;
    phase: 'historical' | 'forecast';
};

type Props = {
    points: SavingsProjectionPoint[];
    currency: string;
    isLoading?: boolean;
    className?: string;
};

function formatMonthLabel(month: string): string {
    const [year, m] = month.split('-').map(Number);
    if (!year || !m) return month;
    return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(toIntlLocale(getLocale()), {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
    });
}

export function SavingsProjectionChart({ points, currency, isLoading, className }: Props) {
    const t = useTranslations('finops');

    const chartData = useMemo(
        () =>
            points
                .filter((point) => point.phase === 'historical')
                .map((point) => ({
                    month: point.month,
                    label: formatMonthLabel(point.month),
                    saved: Number(point.realizedSavings) || 0,
                })),
        [points],
    );

    const hasSavings = chartData.some((point) => point.saved > 0);

    return (
        <Card className={cn('min-w-0', className)}>
            <CardHeader className="gap-1 pb-2">
                <CardTitle className="text-base">{t.savingsProjectionTitle}</CardTitle>
                <CardDescription>{t.savingsProjectionDesc}</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 px-2 pb-4 sm:px-6">
                {isLoading ? (
                    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground sm:h-64">
                        …
                    </div>
                ) : chartData.length === 0 || !hasSavings ? (
                    <div className="flex h-52 items-center justify-center px-4 text-center text-sm text-muted-foreground sm:h-64">
                        {t.realizedListEmpty}
                    </div>
                ) : (
                    <div className={cn(finopsChartSurfaceClassName, 'h-52 w-full min-w-0 sm:h-64')}>
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                            initialDimension={finopsChartInitialDimension}
                        >
                            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={FINOPS_CHART_GRID} />
                                <XAxis dataKey="label" tick={finopsChartTickProps} minTickGap={16} />
                                <YAxis
                                    tick={finopsChartTickProps}
                                    width={52}
                                    tickFormatter={(value: number) =>
                                        formatCurrency(value, currency)
                                            .replace(/[^\d.,kKmMB\-]/g, '')
                                            .slice(0, 7)
                                    }
                                />
                                <Tooltip
                                    {...finopsChartTooltipStyles}
                                    formatter={(value) => [
                                        formatCurrency(Number(value ?? 0), currency),
                                        t.totalSaved,
                                    ]}
                                    labelFormatter={(label) => String(label)}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="saved"
                                    stroke={FINOPS_CHART_PRIMARY}
                                    strokeWidth={2}
                                    dot={{ r: 3, strokeWidth: 0, fill: FINOPS_CHART_PRIMARY }}
                                    activeDot={{ r: 5 }}
                                    name="saved"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
