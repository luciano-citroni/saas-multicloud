'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Monitor, Trash2 } from 'lucide-react';
import { type ActiveSession } from '@/app/actions/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslations } from '@/lib/i18n';

type ActiveSessionsCardProps = {
    sessions: ActiveSession[];
    isLoading: boolean;
    removingSessionId: string | null;
    dateFormatter: Intl.DateTimeFormat;
    onRemoveSession: (sessionId: string) => Promise<void>;
};

function toDateLabel(value: string, formatter: Intl.DateTimeFormat): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return formatter.format(date);
}

export function ActiveSessionsCard({ sessions, isLoading, removingSessionId, dateFormatter, onRemoveSession }: ActiveSessionsCardProps) {
    const t = useTranslations('sessions');
    const tc = useTranslations('common');

    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    const totalPages = Math.ceil(sessions.length / pageSize) || 1;
    const paginatedSessions = sessions.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

    return (
        <div className="rounded-xl border">
            <div className="flex items-center gap-2 border-b px-4 py-3">
                <Monitor className="size-4 shrink-0" />
                <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
            </div>
            {isLoading ? (
                <div className="grid gap-2 px-4 py-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ) : (
                <>
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="px-4 font-medium">{t.identification}</TableHead>
                                <TableHead className="px-4 font-medium">{t.createdAt}</TableHead>
                                <TableHead className="px-4 font-medium">{t.expiresAt}</TableHead>
                                <TableHead className="px-4 font-medium text-right">{tc.actions}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sessions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        {t.noSessions}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedSessions.map((session) => (
                                    <TableRow key={session.id}>
                                        <TableCell className="px-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs">{session.id.slice(0, 8)}...</span>
                                                {session.isCurrent ? <Badge variant="secondary">{t.current}</Badge> : null}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4">{toDateLabel(session.createdAt, dateFormatter)}</TableCell>
                                        <TableCell className="px-4">{toDateLabel(session.expiresAt, dateFormatter)}</TableCell>
                                        <TableCell className="px-4 text-right">
                                            <Button
                                                type="button"
                                                variant={session.isCurrent ? 'destructive' : 'outline'}
                                                size="sm"
                                                isLoading={removingSessionId === session.id}
                                                onClick={() => {
                                                    void onRemoveSession(session.id);
                                                }}
                                            >
                                                <Trash2 className="size-4" />
                                                {t.removeSession}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    {sessions.length > 0 && (
                        <div className="flex flex-col gap-4 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                                <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                                <Select
                                    value={`${pageSize}`}
                                    onValueChange={(v) => {
                                        setPageSize(Number(v));
                                        setPageIndex(0);
                                    }}
                                >
                                    <SelectTrigger className="h-8 min-w-22">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[5, 10, 20].map((s) => (
                                            <SelectItem key={s} value={`${s}`}>
                                                {s}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                <span className="text-sm font-medium">
                                    Página {pageIndex + 1} de {totalPages}
                                </span>
                                <div className="flex items-center gap-1 self-start sm:self-auto">
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(0)} disabled={pageIndex === 0}>
                                        <ChevronsLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPageIndex((p) => Math.max(p - 1, 0))}
                                        disabled={pageIndex === 0}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPageIndex((p) => Math.min(p + 1, totalPages - 1))}
                                        disabled={pageIndex >= totalPages - 1}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPageIndex(totalPages - 1)}
                                        disabled={pageIndex >= totalPages - 1}
                                    >
                                        <ChevronsRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
