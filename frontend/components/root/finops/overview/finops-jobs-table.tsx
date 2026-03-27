import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { JOBS_LIMIT_OPTIONS, formatDate, granularityLabel } from '@/components/root/finops/overview/helpers';
import { cn } from '@/lib/utils';
import type { FinopsJob, PaginationMeta } from '@/components/root/finops/overview/types';

type FinopsJobsTableProps = {
    jobs: FinopsJob[];
    jobsPage: number;
    jobsLimit: number;
    jobsPagination: PaginationMeta | null;
    loadingTable?: boolean;
    onChangeLimit: (limit: number) => void;
    onGoFirst: () => void;
    onGoPrevious: () => void;
    onGoNext: () => void;
    onGoLast: () => void;
};

function JobStatusBadge({ status }: { status: FinopsJob['status'] }) {
    const map: Record<FinopsJob['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
        pending: { label: 'Pendente', variant: 'secondary' },
        running: { label: 'Executando', variant: 'default' },
        completed: { label: 'Concluído', variant: 'outline' },
        failed: { label: 'Falhou', variant: 'destructive' },
    };
    const { label, variant } = map[status] ?? { label: status, variant: 'secondary' };
    return <Badge variant={variant}>{label}</Badge>;
}

export function FinopsJobsTable({
    jobs,
    jobsPage,
    jobsLimit,
    jobsPagination,
    loadingTable = false,
    onChangeLimit,
    onGoFirst,
    onGoPrevious,
    onGoNext,
    onGoLast,
}: FinopsJobsTableProps) {
    return (
        <div className="rounded-xl border">
            <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">Histórico de Sincronizações</p>
                <p className="text-xs text-muted-foreground">Registro de coletas de custo realizadas para esta conta</p>
            </div>

            {jobs.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">Nenhuma sincronização executada ainda para esta conta.</div>
            ) : (
                <>
                    <div className={cn('relative transition-opacity duration-150', loadingTable && 'pointer-events-none opacity-50')}>
                        {loadingTable && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        )}
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="px-4">Iniciado em</TableHead>
                                    <TableHead className="px-4">Status</TableHead>
                                    <TableHead className="px-4">Provider</TableHead>
                                    <TableHead className="px-4">Granularidade</TableHead>
                                    <TableHead className="px-4">Período</TableHead>
                                    <TableHead className="px-4">Registros</TableHead>
                                    <TableHead className="px-4">Concluído em</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobs.map((job) => (
                                    <TableRow key={job.id}>
                                        <TableCell className="px-4">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{formatDate(job.createdAt)}</p>
                                                {job.status === 'failed' && job.error && (
                                                    <p className="truncate text-xs text-destructive">{job.error}</p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4">
                                            <JobStatusBadge status={job.status} />
                                        </TableCell>
                                        <TableCell className="px-4 uppercase">{job.cloudProvider}</TableCell>
                                        <TableCell className="px-4">{granularityLabel(job.granularity)}</TableCell>
                                        <TableCell className="px-4 text-xs text-muted-foreground">
                                            {job.startDate} → {job.endDate}
                                        </TableCell>
                                        <TableCell className="px-4">{job.recordsCollected ?? '-'}</TableCell>
                                        <TableCell className="px-4">{formatDate(job.completedAt)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex flex-col gap-4 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                            <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                            <Select value={`${jobsLimit}`} onValueChange={(value) => onChangeLimit(Number(value))} disabled={loadingTable}>
                                <SelectTrigger className="h-8 min-w-22">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {JOBS_LIMIT_OPTIONS.map((size) => (
                                        <SelectItem key={size} value={`${size}`}>
                                            {size}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                            <span className="text-sm font-medium">
                                Página {jobsPagination?.page ?? jobsPage} de {jobsPagination?.totalPages || 1}
                            </span>

                            <div className="flex items-center gap-1 self-start sm:self-auto">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onGoFirst} disabled={loadingTable || !jobsPagination?.hasPreviousPage}>
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onGoPrevious} disabled={loadingTable || !jobsPagination?.hasPreviousPage}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onGoNext} disabled={loadingTable || !jobsPagination?.hasNextPage}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onGoLast} disabled={loadingTable || !jobsPagination?.hasNextPage}>
                                    <ChevronsRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
