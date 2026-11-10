'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import { acknowledgeFinopsAnomaly, fetchFinopsAnomalyContributors } from '@/app/actions/finops';
import { formatCurrency, priorityColor, priorityLabel } from '@/components/root/finops/overview/helpers';
import { formatResourceChange, shortResourceId } from '@/components/root/finops/overview/finops-resource-id';
import type { AnomalyResourceContributor, OrgOptimizeItem } from '@/components/root/finops/overview/types';
import { extractErrorMessage } from '@/lib/error-messages';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';
import { toIntlLocale } from '@/lib/i18n/format';

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
    const tf = useTranslations('finops');
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
            toast.error(tf.acknowledgeError);
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
            toast.error(tf.anomalyResourcesLoadError);
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
            <CardContent>
                {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                        <CheckCircle2 className="size-8 text-emerald-500" />
                        <p className="text-sm font-medium">Nada pendente</p>
                        <p className="text-xs text-muted-foreground">
                            Sem anomalias ou recomendações abertas para os filtros atuais.
                        </p>
                    </div>
                ) : (
                    <ItemGroup className="gap-2">
                        {items.map((item) => {
                            const alias = accountAliases[item.cloudAccountId] ?? item.cloudAccountId.slice(0, 8);
                            const isAnomaly = item.kind === 'anomaly';
                            const expanded = expandedId === item.id;
                            const contributors = contributorsById[item.id];
                            const loadingContributors = loadingContributorsId === item.id;

                            return (
                                <div
                                    key={`${item.kind}-${item.id}`}
                                    className="border-border overflow-hidden rounded-xl border"
                                >
                                    <Item size="sm" variant="default" className="items-start rounded-none border-0">
                                        <ItemMedia
                                            variant="icon"
                                            className={cn(
                                                'size-9 rounded-lg border',
                                                isAnomaly
                                                    ? 'border-amber-500/30 text-amber-500'
                                                    : 'border-sky-500/30 text-sky-500',
                                            )}
                                        >
                                            {isAnomaly ? (
                                                <AlertTriangle className="size-4" />
                                            ) : (
                                                <Lightbulb className="size-4" />
                                            )}
                                        </ItemMedia>
                                        <ItemContent className="min-w-0">
                                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                                <Badge variant="secondary" className="h-5 text-[10px] uppercase">
                                                    {isAnomaly ? 'Anomalia' : 'Recomendação'}
                                                </Badge>
                                                <span
                                                    className={cn(
                                                        'text-xs font-semibold uppercase',
                                                        priorityColor(item.severityOrPriority),
                                                    )}
                                                >
                                                    {priorityLabel(item.severityOrPriority)}
                                                </span>
                                                {isAnomaly && item.status === 'acknowledged' ? (
                                                    <Badge className="h-5 bg-emerald-500/10 text-[10px] text-emerald-600">
                                                        Reconhecida
                                                    </Badge>
                                                ) : null}
                                                <Badge variant="outline" className="h-5 text-[10px]">
                                                    {alias}
                                                </Badge>
                                                <Badge variant="outline" className="h-5 text-[10px] uppercase">
                                                    {item.cloudProvider}
                                                </Badge>
                                            </div>
                                            <ItemTitle className="w-full max-w-none truncate">
                                                {item.title}
                                            </ItemTitle>
                                            <ItemDescription className="line-clamp-2">
                                                {item.description}
                                            </ItemDescription>
                                        </ItemContent>
                                        <ItemActions className="flex-col items-end gap-2 self-start sm:flex-row sm:items-center">
                                            <div className="text-right">
                                                <p className="text-sm font-semibold tabular-nums">
                                                    {formatCurrency(item.impact, item.currency)}
                                                </p>
                                                <p className="text-muted-foreground text-[11px]">impacto</p>
                                            </div>
                                            {isAnomaly ? (
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
                                            ) : null}
                                            {isAnomaly && item.status === 'open' ? (
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
                                            ) : null}
                                        </ItemActions>
                                    </Item>

                                    {isAnomaly && expanded ? (
                                        <div className="border-border bg-muted/20 border-t px-4 py-3">
                                            {loadingContributors ? (
                                                <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
                                                    <Loader2 className="size-4 animate-spin" />
                                                    Carregando recursos…
                                                </div>
                                            ) : !contributors || contributors.length === 0 ? (
                                                <p className="text-muted-foreground py-3 text-xs">
                                                    Sem custo por recurso neste dia. A AWS só libera resource IDs
                                                    nos últimos 14 dias — sincronize o FinOps nessa janela.
                                                    Inventário só adiciona causas (resize etc.), não o custo.
                                                </p>
                                            ) : (
                                                <div className="space-y-2">
                                                    <p className="text-muted-foreground text-xs font-medium">
                                                        Recursos que mais contribuíram
                                                    </p>
                                                    <ItemGroup className="gap-1.5">
                                                        {contributors.map((row) => (
                                                            <Item
                                                                key={row.resourceId}
                                                                size="sm"
                                                                variant="outline"
                                                                className="bg-background"
                                                            >
                                                                <ItemContent className="min-w-0">
                                                                    <ItemTitle
                                                                        className="truncate font-mono text-xs"
                                                                        title={row.resourceId}
                                                                    >
                                                                        {shortResourceId(row.resourceId)}
                                                                    </ItemTitle>
                                                                    <ItemDescription className="text-[11px]">
                                                                        {row.region || 'global'} · delta{' '}
                                                                        {formatCurrency(row.delta, row.currency)}
                                                                    </ItemDescription>
                                                                    {row.causes.length > 0 ? (
                                                                        <ul className="mt-1 space-y-0.5">
                                                                            {row.causes
                                                                                .slice(0, 3)
                                                                                .map((cause, idx) => (
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
                                                                                        {new Date(
                                                                                            cause.detectedAt,
                                                                                        ).toLocaleDateString(
                                                                                            toIntlLocale(),
                                                                                        )}
                                                                                    </li>
                                                                                ))}
                                                                        </ul>
                                                                    ) : (
                                                                        <p className="text-muted-foreground mt-1 text-[11px]">
                                                                            {tf.noConfigChangeDetected}
                                                                        </p>
                                                                    )}
                                                                </ItemContent>
                                                                <ItemActions className="self-start">
                                                                    <span className="text-xs font-semibold tabular-nums">
                                                                        {formatCurrency(
                                                                            row.costOnAnomalyDate,
                                                                            row.currency,
                                                                        )}
                                                                    </span>
                                                                </ItemActions>
                                                            </Item>
                                                        ))}
                                                    </ItemGroup>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </ItemGroup>
                )}
            </CardContent>
        </Card>
    );
}
