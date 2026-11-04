'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { acknowledgeFinopsAnomaly, fetchFinopsAnomalyContributors } from '@/app/actions/finops';
import { formatCurrency, priorityColor, priorityLabel } from '@/components/root/finops/overview/helpers';
import { formatResourceChange, shortResourceId } from '@/components/root/finops/overview/finops-resource-id';
import type { AnomalyResourceContributor, OrgOptimizeItem } from '@/components/root/finops/overview/types';
import { extractErrorMessage } from '@/lib/error-messages';
import { cn } from '@/lib/utils';

type FinopsOptimizePanelProps = {
    organizationId: string;
    items: OrgOptimizeItem[];
    accountAliases: Record<string, string>;
    isLoading?: boolean;
    onChanged?: () => void;
};

export function FinopsOptimizePanel({
    organizationId,
    items,
    accountAliases,
    isLoading = false,
    onChanged,
}: FinopsOptimizePanelProps) {
    const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [contributorsById, setContributorsById] = useState<Record<string, AnomalyResourceContributor[]>>({});
    const [loadingContributorsId, setLoadingContributorsId] = useState<string | null>(null);

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

    const toggleContributors = async (item: OrgOptimizeItem) => {
        if (item.kind !== 'anomaly') return;

        if (expandedId === item.id) {
            setExpandedId(null);
            return;
        }

        setExpandedId(item.id);

        if (contributorsById[item.id]) return;

        setLoadingContributorsId(item.id);
        try {
            const response = await fetchFinopsAnomalyContributors(organizationId, item.cloudAccountId, item.id, 10);
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                setContributorsById((prev) => ({ ...prev, [item.id]: [] }));
                return;
            }
            setContributorsById((prev) => ({
                ...prev,
                [item.id]: Array.isArray(payload) ? (payload as AnomalyResourceContributor[]) : [],
            }));
        } catch {
            toast.error('Não foi possível carregar os recursos da anomalia.');
            setContributorsById((prev) => ({ ...prev, [item.id]: [] }));
        } finally {
            setLoadingContributorsId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted" />
                ))}
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Fila de otimização</CardTitle>
                <CardDescription>Anomalias e recomendações ordenadas por impacto financeiro</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                        <CheckCircle2 className="size-8 text-emerald-500" />
                        <p className="text-sm font-medium">Nada pendente</p>
                        <p className="text-xs text-muted-foreground">
                            Sem anomalias ou recomendações abertas para os filtros atuais.
                        </p>
                    </div>
                ) : (
                    items.map((item) => {
                        const alias = accountAliases[item.cloudAccountId] ?? item.cloudAccountId.slice(0, 8);
                        const isAnomaly = item.kind === 'anomaly';
                        const expanded = expandedId === item.id;
                        const contributors = contributorsById[item.id];
                        const loadingContributors = loadingContributorsId === item.id;

                        return (
                            <div key={`${item.kind}-${item.id}`} className="rounded-xl border">
                                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
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
                                            <span
                                                className={cn(
                                                    'text-xs font-semibold uppercase',
                                                    priorityColor(item.severityOrPriority),
                                                )}
                                            >
                                                {priorityLabel(item.severityOrPriority)}
                                            </span>
                                            {isAnomaly && item.status === 'acknowledged' && (
                                                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600">
                                                    Reconhecida
                                                </span>
                                            )}
                                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                {alias}
                                            </span>
                                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] uppercase text-muted-foreground">
                                                {item.cloudProvider}
                                            </span>
                                        </div>
                                        <p className="truncate text-sm font-medium">{item.title}</p>
                                        <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                        <div className="text-right">
                                            <p className="text-sm font-semibold tabular-nums">
                                                {formatCurrency(item.impact, item.currency)}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">impacto</p>
                                        </div>
                                        {isAnomaly && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8"
                                                onClick={() => void toggleContributors(item)}
                                            >
                                                {expanded ? (
                                                    <ChevronDown className="size-4" />
                                                ) : (
                                                    <ChevronRight className="size-4" />
                                                )}
                                                Recursos
                                            </Button>
                                        )}
                                        {isAnomaly && item.status === 'open' && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8"
                                                isLoading={acknowledgingId === item.id}
                                                disabled={acknowledgingId !== null}
                                                onClick={() => void handleAcknowledge(item)}
                                            >
                                                OK
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {isAnomaly && expanded ? (
                                    <div className="border-t bg-muted/20 px-4 py-3">
                                        {loadingContributors ? (
                                            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                                                <Loader2 className="size-4 animate-spin" />
                                                Carregando recursos…
                                            </div>
                                        ) : !contributors || contributors.length === 0 ? (
                                            <p className="py-3 text-xs text-muted-foreground">
                                                Sem custo por recurso neste dia. A AWS só libera resource IDs nos
                                                últimos 14 dias — sincronize o FinOps nessa janela. Inventário só
                                                adiciona causas (resize etc.), não o custo.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                <p className="text-xs font-medium text-muted-foreground">
                                                    Recursos que mais contribuíram
                                                </p>
                                                {contributors.map((row) => (
                                                    <div
                                                        key={row.resourceId}
                                                        className="rounded-lg border bg-background px-3 py-2"
                                                    >
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <p
                                                                    className="truncate font-mono text-xs font-medium"
                                                                    title={row.resourceId}
                                                                >
                                                                    {shortResourceId(row.resourceId)}
                                                                </p>
                                                                <p className="text-[11px] text-muted-foreground">
                                                                    {row.region || 'global'} · delta{' '}
                                                                    {formatCurrency(row.delta, row.currency)}
                                                                </p>
                                                            </div>
                                                            <p className="text-xs font-semibold tabular-nums">
                                                                {formatCurrency(row.costOnAnomalyDate, row.currency)}
                                                            </p>
                                                        </div>
                                                        {row.causes.length > 0 ? (
                                                            <ul className="mt-1 space-y-0.5">
                                                                {row.causes.slice(0, 3).map((cause, idx) => (
                                                                    <li
                                                                        key={`${cause.field}-${idx}`}
                                                                        className="text-[11px] text-amber-700 dark:text-amber-400"
                                                                    >
                                                                        {formatResourceChange(
                                                                            cause.field,
                                                                            cause.previousValue,
                                                                            cause.newValue,
                                                                        )}{' '}
                                                                        ·{' '}
                                                                        {new Date(cause.detectedAt).toLocaleDateString(
                                                                            'pt-BR',
                                                                        )}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <p className="mt-1 text-[11px] text-muted-foreground">
                                                                Nenhuma mudança de configuração detectada no período
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })
                )}
            </CardContent>
        </Card>
    );
}
