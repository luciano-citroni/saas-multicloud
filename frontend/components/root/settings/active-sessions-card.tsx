'use client';

import { Monitor, Trash2 } from 'lucide-react';
import { type ActiveSession } from '@/app/actions/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Monitor className="size-4" />
                    Sessões Ativas
                </CardTitle>
                <CardDescription>Gerencie dispositivos com sessão autenticada na sua conta.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="grid gap-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Identificação</TableHead>
                                <TableHead>Criada em</TableHead>
                                <TableHead>Expira em</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sessions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                                        Nenhuma sessão ativa encontrada.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sessions.map((session) => (
                                    <TableRow key={session.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs">{session.id.slice(0, 8)}...</span>
                                                {session.isCurrent ? <Badge variant="secondary">Atual</Badge> : null}
                                            </div>
                                        </TableCell>
                                        <TableCell>{toDateLabel(session.createdAt, dateFormatter)}</TableCell>
                                        <TableCell>{toDateLabel(session.expiresAt, dateFormatter)}</TableCell>
                                        <TableCell className="text-right">
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
                                                Remover sessão
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
