import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { JOBS_LIMIT_OPTIONS, formatDate, scoreColor } from '@/components/root/governance/overview/helpers';
import { JobStatusBadge, JobStatusIcon } from '@/components/root/governance/overview/job-status';
import type { GovernanceJob, PaginationMeta } from '@/components/root/governance/overview/types';

type GovernanceJobsTableProps = {
    jobs: GovernanceJob[];
    jobsPage: number;
    jobsLimit: number;
    jobsPagination: PaginationMeta | null;
    onOpenAnalysis: (job: GovernanceJob) => void;
    onChangeLimit: (limit: number) => void;
    onGoFirst: () => void;
    onGoPrevious: () => void;
    onGoNext: () => void;
    onGoLast: () => void;
};

export function GovernanceJobsTable({
    jobs,
    jobsPage,
    jobsLimit,
    jobsPagination,
    onOpenAnalysis,
    onChangeLimit,
    onGoFirst,
    onGoPrevious,
    onGoNext,
    onGoLast,
}: GovernanceJobsTableProps) {
    return (
        <div className="rounded-xl border">
            <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">Histórico de Varreduras</p>
                <p className="text-xs text-muted-foreground">Clique em uma varredura concluída para abrir a análise detalhada</p>
            </div>

            {jobs.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">Nenhuma varredura executada ainda para esta conta.</div>
            ) : (
                <>
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="px-4">Varredura</TableHead>
                                <TableHead className="px-4">Status</TableHead>
                                <TableHead className="px-4">Score</TableHead>
                                <TableHead className="px-4">Achados</TableHead>
                                <TableHead className="px-4">Verificações</TableHead>
                                <TableHead className="px-4">Concluído em</TableHead>
                                <TableHead className="px-4 text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {jobs.map((job) => (
                                <TableRow key={job.id}>
                                    <TableCell className="px-4">
                                        <div className="flex items-center gap-2">
                                            <JobStatusIcon status={job.status} />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{formatDate(job.createdAt)}</p>
                                                {job.status === 'failed' && job.error && <p className="truncate text-xs text-destructive">{job.error}</p>}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4">
                                        <JobStatusBadge status={job.status} />
                                    </TableCell>
                                    <TableCell className="px-4">
                                        {job.score !== null ? (
                                            <span className={`text-sm font-semibold ${scoreColor(job.score)}`}>{job.score}</span>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="px-4">{job.totalFindings ?? '-'}</TableCell>
                                    <TableCell className="px-4">{job.totalChecks ?? '-'}</TableCell>
                                    <TableCell className="px-4">{formatDate(job.completedAt)}</TableCell>
                                    <TableCell className="px-4 text-right">
                                        <Button size="sm" variant="outline" onClick={() => onOpenAnalysis(job)} disabled={job.status !== 'completed'}>
                                            Ver análise
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    <div className="flex flex-col gap-4 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                            <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                            <Select value={`${jobsLimit}`} onValueChange={(value) => onChangeLimit(Number(value))}>
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
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onGoFirst} disabled={!jobsPagination?.hasPreviousPage}>
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={onGoPrevious}
                                    disabled={!jobsPagination?.hasPreviousPage}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onGoNext} disabled={!jobsPagination?.hasNextPage}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={onGoLast} disabled={!jobsPagination?.hasNextPage}>
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
