'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, priorityColor, priorityLabel } from '@/components/root/finops/overview/helpers';
import type { FinopsRecommendation } from '@/components/root/finops/overview/types';

type FinopsRecommendationsProps = {
    recommendations: FinopsRecommendation[];
    previewLimit?: number;
    actionHref?: string;
    actionLabel?: string;
};

function RecRow({ rec }: { rec: FinopsRecommendation }) {
    return (
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
    );
}

const TABLE_HEAD = (
    <TableHeader className="bg-muted/50">
        <TableRow>
            <TableHead className="px-3">Prioridade</TableHead>
            <TableHead className="px-3">Recurso</TableHead>
            <TableHead className="hidden px-3 sm:table-cell">Resumo</TableHead>
            <TableHead className="hidden px-3 text-right sm:table-cell">Economia/mês</TableHead>
        </TableRow>
    </TableHeader>
);

export function FinopsRecommendations({ recommendations, previewLimit, actionHref, actionLabel }: FinopsRecommendationsProps) {
    const isPreview = typeof previewLimit === 'number';
    const open = recommendations.filter((r) => r.status === 'open');

    const [priorityFilter, setPriorityFilter] = useState('ALL');
    const [resourceFilter, setResourceFilter] = useState('');
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    const filteredRecs = useMemo(() => {
        if (isPreview) return open.slice(0, previewLimit);
        let result = open;
        if (priorityFilter !== 'ALL') result = result.filter((r) => r.priority === priorityFilter);
        const q = resourceFilter.trim().toLowerCase();
        if (q) result = result.filter((r) => r.resourceType.toLowerCase().includes(q) || r.resourceId.toLowerCase().includes(q));
        return result;
    }, [open, isPreview, previewLimit, priorityFilter, resourceFilter]);

    const totalPages = Math.ceil(filteredRecs.length / pageSize) || 1;
    const paginatedRecs = isPreview ? filteredRecs : filteredRecs.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

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

            {open.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                    Nenhuma recomendação de otimização disponível. Sincronize os dados para gerar análises.
                </div>
            ) : isPreview ? (
                <div className="px-4 py-4">
                    <Table>
                        {TABLE_HEAD}
                        <TableBody>
                            {paginatedRecs.map((rec) => <RecRow key={rec.id} rec={rec} />)}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="flex flex-col gap-4 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            value={resourceFilter}
                            onChange={(e) => { setResourceFilter(e.target.value); setPageIndex(0); }}
                            placeholder="Filtrar por recurso..."
                            className="h-8 w-50"
                        />
                        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPageIndex(0); }}>
                            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todas as prioridades</SelectItem>
                                <SelectItem value="critical">Crítica</SelectItem>
                                <SelectItem value="high">Alta</SelectItem>
                                <SelectItem value="medium">Média</SelectItem>
                                <SelectItem value="low">Baixa</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="rounded-lg border">
                        <Table>
                            {TABLE_HEAD}
                            <TableBody>
                                {paginatedRecs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            Nenhuma recomendação encontrada para os filtros aplicados.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedRecs.map((rec) => <RecRow key={rec.id} rec={rec} />)
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                            <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                            <Select value={`${pageSize}`} onValueChange={(v) => { setPageSize(Number(v)); setPageIndex(0); }}>
                                <SelectTrigger className="h-8 min-w-22"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {[5, 10, 20, 30].map((s) => <SelectItem key={s} value={`${s}`}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                            <span className="text-sm font-medium">Página {pageIndex + 1} de {totalPages}</span>
                            <div className="flex items-center gap-1 self-start sm:self-auto">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(0)} disabled={pageIndex === 0}>
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex((p) => Math.max(p - 1, 0))} disabled={pageIndex === 0}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex((p) => Math.min(p + 1, totalPages - 1))} disabled={pageIndex >= totalPages - 1}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(totalPages - 1)} disabled={pageIndex >= totalPages - 1}>
                                    <ChevronsRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
