'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { acknowledgeFinopsAnomaly } from '@/app/actions/finops';
import { formatCurrency, priorityColor, priorityLabel } from '@/components/root/finops/overview/helpers';
import type { OrgFinopsOptimize, OrgOptimizeItem } from '@/components/root/finops/overview/types';
import { extractErrorMessage } from '@/lib/error-messages';
import { cn } from '@/lib/utils';

type FinopsOptimizePanelProps = {
    organizationId: string;
    data: OrgFinopsOptimize | null;
    accountAliases: Record<string, string>;
    isLoading?: boolean;
    onChanged?: () => void;
};

export function FinopsOptimizePanel({ organizationId, data, accountAliases, isLoading = false, onChanged }: FinopsOptimizePanelProps) {
    const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

    const handleAcknowledge = async (item: OrgOptimizeItem) => {
        if (item.kind !== 'anomaly') return;

        setAcknowledgingId(item.id);
        try {
            const response = await acknowledgeFinopsAnomaly(organizationId, item.cloudAccountId, item.id);
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }
            toast.success('Anomalia reconhecida');
            onChanged?.();
        } catch {
            toast.error('Não foi possível reconhecer a anomalia.');
        } finally {
            setAcknowledgingId(null);
        }
    };

    if (isLoading || !data) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted" />
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Anomalias abertas</CardDescription>
                        <CardTitle className="text-2xl">{data.totals.openAnomalies}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Recomendações abertas</CardDescription>
                        <CardTitle className="text-2xl">{data.totals.openRecommendations}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Economia potencial</CardDescription>
                        <CardTitle className="text-2xl text-emerald-600">
                            {formatCurrency(data.totals.potentialSavings, data.totals.currency)}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Fila de otimização</CardTitle>
                    <CardDescription>Anomalias e recomendações ordenadas por impacto</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {data.items.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center">
                            <CheckCircle2 className="size-8 text-emerald-500" />
                            <p className="text-sm font-medium">Nada pendente</p>
                            <p className="text-xs text-muted-foreground">Sem anomalias ou recomendações abertas no momento.</p>
                        </div>
                    ) : (
                        data.items.map((item) => {
                            const alias = accountAliases[item.cloudAccountId] ?? item.cloudAccountId.slice(0, 8);
                            const isAnomaly = item.kind === 'anomaly';

                            return (
                                <div key={`${item.kind}-${item.id}`} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {isAnomaly ? (
                                                <AlertTriangle className="size-4 text-amber-500" />
                                            ) : (
                                                <Lightbulb className="size-4 text-sky-500" />
                                            )}
                                            <span className="text-xs font-medium uppercase text-muted-foreground">
                                                {isAnomaly ? 'Anomalia' : 'Recomendação'}
                                            </span>
                                            <span className={cn('text-xs font-semibold uppercase', priorityColor(item.severityOrPriority))}>
                                                {priorityLabel(item.severityOrPriority)}
                                            </span>
                                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{alias}</span>
                                        </div>
                                        <p className="truncate text-sm font-medium">{item.title}</p>
                                        <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-3">
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-emerald-600">
                                                {formatCurrency(item.impact, item.currency)}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">{isAnomaly ? 'impacto' : 'economia/mês'}</p>
                                        </div>
                                        {isAnomaly && item.status === 'open' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void handleAcknowledge(item)}
                                                disabled={acknowledgingId === item.id}
                                            >
                                                {acknowledgingId === item.id ? <Loader2 className="size-4 animate-spin" /> : 'Reconhecer'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
