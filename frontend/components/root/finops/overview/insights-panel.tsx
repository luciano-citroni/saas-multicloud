'use client';

import { AlertCircle, TrendingDown, TrendingUp, Lightbulb, Target } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from './helpers';
import type { OptimizationInsight } from './types';

export type Insight = {
    type: 'positive' | 'warning' | 'opportunity' | 'info';
    title: string;
    description: string;
    metric?: string;
    icon?: React.ReactNode;
    impact?: number;
    currency?: string;
};

type InsightsPanelProps = {
    insights: Insight[];
    isLoading?: boolean;
};

export function InsightsPanel({ insights, isLoading = false }: InsightsPanelProps) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Insights Inteligentes</CardTitle>
                    <CardDescription>Análise automática dos seus dados</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!insights || insights.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Insights Inteligentes</CardTitle>
                    <CardDescription>Análise automática dos seus dados</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="py-8 text-center text-sm text-muted-foreground">Nenhum insight disponível no momento</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Insights Inteligentes</CardTitle>
                <CardDescription>Análise automática dos seus dados de FinOps</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {insights.map((insight, index) => {
                    const iconColor =
                        insight.type === 'positive'
                            ? 'text-emerald-500'
                            : insight.type === 'warning'
                              ? 'text-destructive'
                              : insight.type === 'opportunity'
                                ? 'text-blue-500'
                                : 'text-amber-500';

                    const bgColor =
                        insight.type === 'positive'
                            ? 'bg-emerald-50 dark:bg-emerald-950'
                            : insight.type === 'warning'
                              ? 'bg-destructive/5'
                              : insight.type === 'opportunity'
                                ? 'bg-blue-50 dark:bg-blue-950'
                                : 'bg-amber-50 dark:bg-amber-950';

                    return (
                        <div key={index} className={cn('rounded-lg border p-3', bgColor)}>
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 pt-0.5">
                                    {insight.type === 'positive' && <TrendingDown className={cn('h-4 w-4', iconColor)} />}
                                    {insight.type === 'warning' && <AlertCircle className={cn('h-4 w-4', iconColor)} />}
                                    {insight.type === 'opportunity' && <Lightbulb className={cn('h-4 w-4', iconColor)} />}
                                    {insight.type === 'info' && <Target className={cn('h-4 w-4', iconColor)} />}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-sm">{insight.title}</p>
                                            <p className="text-sm text-muted-foreground mt-0.5">{insight.description}</p>
                                        </div>

                                        {insight.metric && (
                                            <Badge
                                                variant={
                                                    insight.type === 'positive' ? 'secondary' : insight.type === 'warning' ? 'destructive' : 'default'
                                                }
                                                className="flex-shrink-0"
                                            >
                                                {insight.metric}
                                            </Badge>
                                        )}
                                    </div>

                                    {insight.impact !== undefined && insight.currency && (
                                        <div className="mt-2 text-sm">
                                            <span className="font-medium">Impacto: {formatCurrency(insight.impact, insight.currency)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
