'use client';

import { TrendingDown, AlertTriangle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CostEstimateResponse } from '@/app/actions/automation';
import { cn } from '@/lib/utils';

function formatCost(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

const TYPE_LABELS: Record<string, string> = {
    ec2: 'EC2',
    s3: 'S3',
    rds: 'RDS',
    lambda: 'Lambda',
};

type Props = {
    estimate: CostEstimateResponse;
};

export function CostEstimationPanel({ estimate }: Props) {
    const { resources, totals, savingsPercent } = estimate;
    const isHighCost = totals.onDemand > 500;

    return (
        <div className="space-y-4">
            {isHighCost && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-800 dark:bg-amber-950/30">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Custo elevado detectado</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                            Essa configuração pode gerar custos elevados ({formatCost(totals.onDemand)}/mês). Considere usar Savings Plan para reduzir até {savingsPercent}%.
                        </p>
                    </div>
                </div>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3.5 dark:border-green-800 dark:bg-green-950/30">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                        Você economiza {savingsPercent}% usando Savings Plan
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400">
                        {formatCost(totals.onDemand - totals.savings)}/mês de economia em relação ao On-Demand
                    </p>
                </div>
            </div>

            {/* Totals cards */}
            <div className="grid grid-cols-3 gap-3">
                <Card className="border-dashed">
                    <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-xs text-muted-foreground">On-Demand</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <p className="text-xl font-bold">{formatCost(totals.onDemand)}</p>
                        <p className="text-[10px] text-muted-foreground">por mês</p>
                    </CardContent>
                </Card>
                <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
                    <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400">
                            Reserved
                            <Badge variant="secondary" className="text-[10px] py-0">−30%</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatCost(totals.reserved)}</p>
                        <p className="text-[10px] text-muted-foreground">por mês</p>
                    </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20">
                    <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                            Savings Plan
                            <Badge variant="secondary" className="text-[10px] py-0">−{savingsPercent}%</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                        <p className="text-xl font-bold text-green-700 dark:text-green-300">{formatCost(totals.savings)}</p>
                        <p className="text-[10px] text-muted-foreground">por mês</p>
                    </CardContent>
                </Card>
            </div>

            {/* Per-resource breakdown */}
            <div className="rounded-xl border">
                <div className="border-b bg-muted/30 px-4 py-2.5">
                    <p className="text-xs font-semibold text-muted-foreground">Detalhamento por recurso</p>
                </div>
                <div className="divide-y">
                    {resources.map((r) => (
                        <div key={r.nodeId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3">
                            <div>
                                <p className="text-sm font-medium">{r.label}</p>
                                <p className="text-xs text-muted-foreground">
                                    <Badge variant="outline" className="mr-1 text-[10px] py-0">{TYPE_LABELS[r.type] ?? r.type}</Badge>
                                    {r.region}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">On-Demand</p>
                                <p className="text-sm font-medium">{formatCost(r.onDemand)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">Reserved</p>
                                <p className={cn('text-sm font-medium', 'text-blue-600 dark:text-blue-400')}>{formatCost(r.reserved)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">Savings</p>
                                <p className={cn('text-sm font-medium', 'text-green-600 dark:text-green-400')}>{formatCost(r.savings)}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-between border-t bg-muted/30 px-4 py-2.5">
                    <p className="text-sm font-semibold">Total mensal estimado</p>
                    <div className="flex gap-6 text-right">
                        <p className="text-sm font-bold">{formatCost(totals.onDemand)}</p>
                        <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCost(totals.reserved)}</p>
                        <p className="text-sm font-bold text-green-600 dark:text-green-400">{formatCost(totals.savings)}</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" />
                Valores estimados. Reserved aplica −30% e Savings Plan aplica −40% sobre o On-Demand.
            </div>
        </div>
    );
}
