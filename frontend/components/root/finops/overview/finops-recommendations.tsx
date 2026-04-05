import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, priorityColor, priorityLabel } from '@/components/root/finops/overview/helpers';
import type { FinopsRecommendation } from '@/components/root/finops/overview/types';

type FinopsRecommendationsProps = {
    recommendations: FinopsRecommendation[];
    previewLimit?: number;
    actionHref?: string;
    actionLabel?: string;
};

export function FinopsRecommendations({ recommendations, previewLimit, actionHref, actionLabel }: FinopsRecommendationsProps) {
    const open = recommendations.filter((r) => r.status === 'open');
    const displayRecommendations = typeof previewLimit === 'number' ? open.slice(0, previewLimit) : open;

    return (
        <div className="rounded-xl border">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                    <p className="text-sm font-medium">Recomendações de Otimização</p>
                    <p className="text-xs text-muted-foreground">
                        {open.length > 0
                            ? `${open.length} oportunidade${open.length > 1 ? 's' : ''} de economia identificada${open.length > 1 ? 's' : ''}`
                            : 'Nenhuma recomendação aberta'}
                    </p>
                </div>
                {actionHref && actionLabel ? (
                    <Button variant="outline" size="sm" asChild>
                        <Link href={actionHref}>{actionLabel}</Link>
                    </Button>
                ) : null}
            </div>

            {displayRecommendations.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                    Nenhuma recomendação de otimização disponível. Sincronize os dados para gerar análises.
                </div>
            ) : (
                <div className="px-4 py-4">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="px-3">Prioridade</TableHead>
                                <TableHead className="px-3">Recurso</TableHead>
                                <TableHead className="hidden px-3 sm:table-cell">Resumo</TableHead>
                                <TableHead className="hidden px-3 text-right sm:table-cell">Economia/mês</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displayRecommendations.map((rec) => (
                                <TableRow key={rec.id}>
                                    <TableCell className="px-3">
                                        <span className={cn('text-xs font-semibold uppercase', priorityColor(rec.priority))}>
                                            {priorityLabel(rec.priority)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="px-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{rec.resourceType}</p>
                                            <p className="truncate text-xs text-muted-foreground">{rec.resourceId}</p>
                                            <details className="mt-1 sm:hidden">
                                                <summary className="cursor-pointer text-[11px] text-muted-foreground">Ver detalhes</summary>
                                                <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                                                    <p className="truncate">{rec.description}</p>
                                                    <p className="truncate">{rec.recommendation}</p>
                                                    <p>
                                                        Economia/mês:{' '}
                                                        {rec.potentialSaving != null
                                                            ? formatCurrency(rec.potentialSaving, rec.currency)
                                                            : 'sem estimativa'}
                                                    </p>
                                                </div>
                                            </details>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden px-3 sm:table-cell">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm">{rec.description}</p>
                                            <p className="truncate text-xs text-muted-foreground">{rec.recommendation}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden px-3 text-right sm:table-cell">
                                        {rec.potentialSaving != null ? (
                                            <p className="text-sm font-bold text-green-600">{formatCurrency(rec.potentialSaving, rec.currency)}/mês</p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">sem estimativa</p>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
