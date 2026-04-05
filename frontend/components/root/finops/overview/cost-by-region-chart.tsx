'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from './helpers';

export type RegionCostData = {
    region: string;
    cost: number;
    services?: number;
    resources?: number;
};

type CostByRegionChartProps = {
    data: RegionCostData[];
    currency?: string;
    isLoading?: boolean;
};

export function CostByRegionChart({ data, currency = 'USD', isLoading = false }: CostByRegionChartProps) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Custo por Região</CardTitle>
                    <CardDescription>Distribuição geográfica</CardDescription>
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
                    <CardTitle>Custo por Região</CardTitle>
                    <CardDescription>Distribuição geográfica</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Nenhum dado de região disponível</div>
                </CardContent>
            </Card>
        );
    }

    const chartData = data.sort((a, b) => b.cost - a.cost);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Custo por Região</CardTitle>
                <CardDescription>Distribuição geográfica dos gastos</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="region" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip formatter={(value) => (typeof value === 'number' ? formatCurrency(value, currency) : '')} />
                            <Legend />
                            <Bar dataKey="cost" fill="#8b5cf6" name="Custo" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Summary table */}
                <div className="mt-4 grid gap-2">
                    {chartData.map((item) => (
                        <div key={item.region} className="flex items-center justify-between border-b pb-2 last:border-b-0 text-sm">
                            <div>
                                <p className="font-medium">{item.region}</p>
                                {(item.services !== undefined || item.resources !== undefined) && (
                                    <p className="text-xs text-muted-foreground">
                                        {item.services} serviços • {item.resources} recursos
                                    </p>
                                )}
                            </div>
                            <span className="font-semibold">{formatCurrency(item.cost, currency)}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
