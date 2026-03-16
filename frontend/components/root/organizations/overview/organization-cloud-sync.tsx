'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { canManageCloudAccounts, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import { enqueueGeneralSync, fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { CloudCog, Clock3, Edit, RefreshCw } from 'lucide-react';

const PAGE_SIZE = 8;

function formatProvider(provider: string) {
    const normalized = provider.toLowerCase();

    if (normalized === 'aws') {
        return 'AWS';
    }

    if (normalized === 'azure') {
        return 'Azure';
    }

    if (normalized === 'gcp') {
        return 'GCP';
    }

    return provider;
}

function formatDateTime(dateString?: string | null) {
    if (!dateString) {
        return 'Ainda não sincronizado';
    }

    const parsed = new Date(dateString);

    if (Number.isNaN(parsed.getTime())) {
        return 'Data inválida';
    }

    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(parsed);
}

type ApiErrorPayload = {
    message?: string | string[];
    statusCode?: number;
    error?: string;
    path?: string;
    timestamp?: string;
};

type SidebarContextPayload = {
    organizations?: Array<{
        id?: string;
        currentRole?: string | null;
    }>;
};

function normalizeCloudAccounts(payload: unknown): OrganizationCloudAccount[] {
    if (!Array.isArray(payload)) {
        return [];
    }

    return payload
        .filter((item): item is OrganizationCloudAccount => {
            return (
                typeof item === 'object' &&
                item !== null &&
                typeof (item as OrganizationCloudAccount).id === 'string' &&
                typeof (item as OrganizationCloudAccount).alias === 'string' &&
                typeof (item as OrganizationCloudAccount).provider === 'string'
            );
        })
        .map((item) => ({
            ...item,
            lastGeneralSyncAt:
                typeof item.lastGeneralSyncAt === 'string' || item.lastGeneralSyncAt === null ? item.lastGeneralSyncAt : (item.lastGeneralSyncAt ?? null),
        }));
}

export function OrganizationCloudSync() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [organizationRole, setOrganizationRole] = useState<OrganizationRole | null>(null);
    const [accounts, setAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [resolvingRole, setResolvingRole] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadAccounts = useCallback(async (orgId: string, nextRefreshing = false) => {
        if (nextRefreshing) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const response = await fetchOrganizationCloudAccounts(orgId);
            const payload = (await response.json().catch(() => null)) as unknown;

            if (!response.ok) {
                const message = extractErrorMessage((payload as ApiErrorPayload | null) ?? null);
                toast.error(message);
                setAccounts([]);
                return;
            }

            setAccounts(normalizeCloudAccounts(payload));
            setPage(1);
        } catch {
            toast.error('Não foi possível carregar as contas cloud da organização.');
            setAccounts([]);
            setPage(1);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const loadOrganizationRole = useCallback(async (orgId: string) => {
        setResolvingRole(true);

        try {
            const response = await fetch('/api/sidebar/context', { cache: 'no-store' });
            if (!response.ok) {
                setOrganizationRole(null);
                return;
            }

            const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
            const activeOrganization = payload?.organizations?.find((organization) => organization?.id === orgId);

            setOrganizationRole(normalizeOrganizationRole(activeOrganization?.currentRole ?? null));
        } catch {
            setOrganizationRole(null);
        } finally {
            setResolvingRole(false);
        }
    }, []);

    useEffect(() => {
        const activeOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        setOrganizationId(activeOrganizationId);

        if (!activeOrganizationId) {
            setLoading(false);
            setResolvingRole(false);
            return;
        }

        void loadAccounts(activeOrganizationId);
        void loadOrganizationRole(activeOrganizationId);
    }, [loadAccounts, loadOrganizationRole]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(accounts.length / PAGE_SIZE)), [accounts.length]);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const pagedAccounts = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return accounts.slice(start, start + PAGE_SIZE);
    }, [accounts, page]);

    const canManageAccounts = canManageCloudAccounts(organizationRole);

    const handleSyncAll = useCallback(async () => {
        if (!organizationId || !accounts.length || syncing || !canManageAccounts) {
            return;
        }

        setSyncing(true);

        try {
            const syncResults = await Promise.all(
                accounts.map(async (account) => {
                    const response = await enqueueGeneralSync(organizationId, account.id);
                    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

                    return {
                        account,
                        ok: response.ok,
                        status: response.status,
                        payload,
                    };
                })
            );

            const successCount = syncResults.filter((result) => result.ok).length;
            const alreadyRunningCount = syncResults.filter((result) => result.status === 409).length;
            const failed = syncResults.filter((result) => !result.ok && result.status !== 409);

            if (successCount > 0) {
                toast.success(`Sync geral enfileirado para ${successCount} conta(s).`);
            }

            if (alreadyRunningCount > 0) {
                toast.info(`${alreadyRunningCount} conta(s) já possuem sync em andamento.`);
            }

            if (failed.length > 0) {
                const firstFailure = failed[0];
                const message = extractErrorMessage(firstFailure.payload ?? null);
                toast.error(`Falha em ${failed.length} conta(s): ${message}`);
            }

            await loadAccounts(organizationId, true);
        } catch {
            toast.error('Não foi possível iniciar o sync geral da organização.');
        } finally {
            setSyncing(false);
        }
    }, [accounts, canManageAccounts, loadAccounts, organizationId, syncing]);

    const handleSyncAccount = useCallback(
        async (cloudAccountId: string) => {
            if (!organizationId || !canManageAccounts || syncingAccountId) {
                return;
            }

            setSyncingAccountId(cloudAccountId);

            try {
                const response = await enqueueGeneralSync(organizationId, cloudAccountId);
                const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

                if (!response.ok) {
                    const message = extractErrorMessage(payload ?? null);
                    toast.error(message);
                    return;
                }

                toast.success('Sync da conta enfileirado com sucesso.');
                await loadAccounts(organizationId, true);
            } catch {
                toast.error('Não foi possível enfileirar o sync da conta.');
            } finally {
                setSyncingAccountId(null);
            }
        },
        [canManageAccounts, loadAccounts, organizationId, syncingAccountId]
    );

    const handleEditAccount = useCallback(() => {
        if (!canManageAccounts) {
            return;
        }

        toast.info('Fluxo de edição de cloud account será disponibilizado em breve.');
    }, [canManageAccounts]);

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Organização</CardTitle>
                    <CardDescription>Selecione uma organização na sidebar para visualizar as contas cloud e sincronizações.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                            <CloudCog className="size-5" />
                            Organização
                        </CardTitle>
                        <CardDescription>Visualize suas contas cloud e dispare um sync geral.</CardDescription>
                    </div>
                    <Button onClick={handleSyncAll} isLoading={syncing} disabled={!accounts.length || loading || !canManageAccounts || resolvingRole}>
                        <RefreshCw className="size-4" />
                        Sync geral
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-xl border">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <p className="text-sm font-medium">Cloud accounts da organizacao</p>
                            <Button variant="outline" size="sm" onClick={() => void loadAccounts(organizationId, true)} isLoading={refreshing}>
                                Atualizar
                            </Button>
                        </div>

                        {loading || resolvingRole ? (
                            <div className="px-4 py-6 text-sm text-muted-foreground">Carregando contas cloud...</div>
                        ) : accounts.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-muted-foreground">
                                Nenhuma conta cloud conectada ainda. Conecte uma conta para habilitar o sync geral.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/20">
                                            <TableHead>Alias</TableHead>
                                            <TableHead>Provider</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Último sync geral</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pagedAccounts.map((account) => (
                                            <TableRow key={account.id}>
                                                <TableCell className="font-medium">{account.alias}</TableCell>
                                                <TableCell className="text-muted-foreground">{formatProvider(account.provider)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={account.isActive === false ? 'outline' : 'secondary'}>
                                                        {account.isActive === false ? 'Inativa' : 'Ativa'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    <span className="inline-flex items-center gap-1">
                                                        <Clock3 className="size-3.5" />
                                                        {formatDateTime(account.lastGeneralSyncAt)}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={handleEditAccount}
                                                            disabled={!canManageAccounts}
                                                            title={!canManageAccounts ? 'Apenas OWNER/ADMIN pode editar a conta.' : 'Editar conta'}
                                                        >
                                                            <Edit className="size-3.5" />
                                                            Editar
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => void handleSyncAccount(account.id)}
                                                            isLoading={syncingAccountId === account.id}
                                                            disabled={!canManageAccounts || Boolean(syncingAccountId)}
                                                            title={
                                                                !canManageAccounts ? 'Apenas OWNER/ADMIN pode sincronizar a conta.' : 'Sincronizar conta'
                                                            }
                                                        >
                                                            <RefreshCw className="size-3.5" />
                                                            Sync conta
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>

                                <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-xs text-muted-foreground">
                                        Exibindo {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, accounts.length)} de {accounts.length} contas
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page === 1}>
                                            Anterior
                                        </Button>
                                        <span className="text-xs text-muted-foreground">
                                            Página {page} de {totalPages}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                            disabled={page === totalPages}
                                        >
                                            Próxima
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
