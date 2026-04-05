'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from './helpers';

export type TagCostData = {
    tag: string;
    value: string;
    cost: number;
    percentage?: number;
};

type CostByTagChartProps = {
    data: TagCostData[];
    currency?: string;
    tagKey?: string;
    isLoading?: boolean;
};

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#f97316'];

export function CostByTagChart({ data, currency = 'USD', tagKey = 'Project', isLoading = false }: CostByTagChartProps) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Custo por {tagKey}</CardTitle>
                    <CardDescription>Chargeback e alocação de custos</CardDescription>
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
                    <CardTitle>Custo por {tagKey}</CardTitle>
                    <CardDescription>Chargeback e alocação de custos</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                        Nenhum dado de {tagKey.toLowerCase()} disponível
                    </div>
                </CardContent>
            </Card>
        );
    }

    const chartData = data
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10)
        .map((item) => ({
            ...item,
            label: `${item.tag}: ${item.value}`.substring(0, 20),
        }));

    const totalCost = chartData.reduce((sum, item) => sum + item.cost, 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Custo por {tagKey}</CardTitle>
                <CardDescription>Top 10 para chargeback e alocação</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" fontSize={12} interval={0} angle={-45} textAnchor="end" height={80} />
                            <YAxis fontSize={12} />
                            <Tooltip formatter={(value) => (typeof value === 'number' ? formatCurrency(value, currency) : '')} />
                            <Bar dataKey="cost" fill="#3b82f6" name="Custo">
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Detailed breakdown */}
                <div className="space-y-2">
                    <p className="text-sm font-medium">Detalhamento:</p>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                        {chartData.map((item, index) => {
                            const percentage = totalCost > 0 ? (item.cost / totalCost) * 100 : 0;
                            return (
                                <div key={item.tag} className="flex items-end justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                        <span className="font-medium truncate">
                                            {item.tag}: {item.value}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold tabular-nums">{formatCurrency(item.cost, currency)}</p>
                                        <p className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
