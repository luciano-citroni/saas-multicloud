'use client';

import { AlertCircle, TrendingDown, Lightbulb, Target } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import { cn } from '@/lib/utils';
import { formatCurrency } from './helpers';
import { useTranslations } from '@/lib/i18n';

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
    const tf = useTranslations('finops');

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
                    <div className="py-8 text-center text-sm text-muted-foreground">{tf.noInsightsNow}</div>
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
            <CardContent>
                <ItemGroup className="gap-2">
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
                            <Item
                                key={index}
                                size="sm"
                                variant="outline"
                                className={cn(bgColor)}
                            >
                                <ItemMedia variant="icon" className={cn(iconColor)}>
                                    {insight.type === 'positive' && <TrendingDown className="size-4" />}
                                    {insight.type === 'warning' && <AlertCircle className="size-4" />}
                                    {insight.type === 'opportunity' && <Lightbulb className="size-4" />}
                                    {insight.type === 'info' && <Target className="size-4" />}
                                </ItemMedia>
                                <ItemContent className="min-w-0">
                                    <ItemTitle className="w-full max-w-none whitespace-normal">
                                        {insight.title}
                                    </ItemTitle>
                                    <ItemDescription>{insight.description}</ItemDescription>
                                    {insight.impact !== undefined && insight.currency ? (
                                        <p className="mt-1 text-sm font-medium">
                                            Impacto: {formatCurrency(insight.impact, insight.currency)}
                                        </p>
                                    ) : null}
                                </ItemContent>
                                {insight.metric ? (
                                    <ItemActions className="self-start">
                                        <Badge
                                            variant={
                                                insight.type === 'positive'
                                                    ? 'secondary'
                                                    : insight.type === 'warning'
                                                      ? 'destructive'
                                                      : 'default'
                                            }
                                        >
                                            {insight.metric}
                                        </Badge>
                                    </ItemActions>
                                ) : null}
                            </Item>
                        );
                    })}
                </ItemGroup>
            </CardContent>
        </Card>
    );
}
