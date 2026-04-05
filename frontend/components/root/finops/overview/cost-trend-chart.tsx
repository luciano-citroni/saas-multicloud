'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from './helpers';

export type CostTrendDataPoint = {
    date: string;
    cost: number;
    forecast?: number;
};

type CostTrendChartProps = {
    data: CostTrendDataPoint[];
    currency?: string;
    title?: string;
    description?: string;
    isLoading?: boolean;
};

export function CostTrendChart({
    data,
    currency = 'USD',
    title = 'Custo ao longo do tempo',
    description = 'Últimos 30 dias',
    isLoading = false,
}: CostTrendChartProps) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-64 bg-muted rounded-lg animate-pulse" />
                </CardContent>
            </Card>
        );
    }

    if (!data || data.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Nenhum dado disponível</div>
                </CardContent>
            </Card>
        );
    }

    const chartData = data.map((item) => ({
        ...item,
        date: new Date(item.date).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }),
    }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip
                                formatter={(value) => (typeof value === 'number' ? formatCurrency(value, currency) : '')}
                                labelFormatter={(label) => `Data: ${label}`}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="cost" stroke="#3b82f6" name="Custo Real" strokeWidth={2} dot={false} />
                            {chartData.some((d) => d.forecast !== undefined) && (
                                <Line
                                    type="monotone"
                                    dataKey="forecast"
                                    stroke="#9ca3af"
                                    name="Previsão"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
