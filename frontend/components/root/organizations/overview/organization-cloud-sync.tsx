'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ACTIVE_ORG_CHANGED_EVENT, ACTIVE_ORG_STORAGE_KEY, SIDEBAR_CONTEXT_UPDATED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { canManageCloudAccounts, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import { enqueueGeneralSync, fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { CloudCog, RefreshCw } from 'lucide-react';
import { OrganizationCloudTable } from './organiztion-cloud-table';

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

type CloudAccountApiItem = OrganizationCloudAccount & {
    is_sync_in_progress?: boolean;
    last_general_sync_at?: string | null;
};

type CloudAccountsApiPayload =
    | CloudAccountApiItem[]
    | {
          items?: CloudAccountApiItem[];
      };

function normalizeDateValue(value: unknown): string | null {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null) {
        return null;
    }

    return null;
}

function normalizeCloudAccounts(payload: unknown): OrganizationCloudAccount[] {
    const normalizedPayload = payload as CloudAccountsApiPayload;
    const items = Array.isArray(normalizedPayload)
        ? normalizedPayload
        : Array.isArray(normalizedPayload?.items)
          ? normalizedPayload.items
          : [];

    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .filter((item): item is OrganizationCloudAccount => {
            return (
                typeof item === 'object' &&
                item !== null &&
                typeof (item as OrganizationCloudAccount).id === 'string' &&
                typeof (item as OrganizationCloudAccount).alias === 'string' &&
                typeof (item as OrganizationCloudAccount).provider === 'string'
            );
        })
        .map((item) => {
            const apiItem = item as CloudAccountApiItem;

            return {
                ...item,
                isSyncInProgress: apiItem.isSyncInProgress === true || apiItem.is_sync_in_progress === true,
                lastGeneralSyncAt: normalizeDateValue(apiItem.lastGeneralSyncAt ?? apiItem.last_general_sync_at ?? null),
            };
        });
}

export function OrganizationCloudSync() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [organizationRole, setOrganizationRole] = useState<OrganizationRole | null>(null);
    const [accounts, setAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [resolvingRole, setResolvingRole] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadAccounts = useCallback(
        async (
            orgId: string,
            options: {
                nextRefreshing?: boolean;
                background?: boolean;
                silentErrors?: boolean;
            } = {}
        ) => {
            const { nextRefreshing = false, background = false, silentErrors = false } = options;

            if (nextRefreshing) {
                setRefreshing(true);
            } else if (!background) {
                setLoading(true);
            }

            try {
                const response = await fetchOrganizationCloudAccounts(orgId);
                const payload = (await response.json().catch(() => null)) as unknown;

                if (!response.ok) {
                    if (!silentErrors) {
                        const message = extractErrorMessage((payload as ApiErrorPayload | null) ?? null);
                        toast.error(message);
                    }

                    if (!background) {
                        setAccounts([]);
                    }

                    return;
                }

                const cloudAccountsList = normalizeCloudAccounts(payload);
                setAccounts(cloudAccountsList);
            } catch {
                if (!silentErrors) {
                    toast.error('Não foi possível carregar as contas cloud da organização.');
                }

                if (!background) {
                    setAccounts([]);
                }
            } finally {
                if (!background) {
                    setLoading(false);
                }

                setRefreshing(false);
            }
        },
        []
    );

    const hasSyncInProgress = accounts.some((account) => account.isSyncInProgress === true);

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

        void loadOrganizationRole(activeOrganizationId);
    }, [loadOrganizationRole]);

    useEffect(() => {
        const syncActiveOrganization = () => {
            const nextOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);

            setOrganizationId(nextOrganizationId);

            if (!nextOrganizationId) {
                setAccounts([]);
                setOrganizationRole(null);
                setLoading(false);
                setResolvingRole(false);
                return;
            }

            void loadOrganizationRole(nextOrganizationId);
        };

        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, syncActiveOrganization);
        window.addEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, syncActiveOrganization);
        window.addEventListener('storage', syncActiveOrganization);

        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, syncActiveOrganization);
            window.removeEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, syncActiveOrganization);
            window.removeEventListener('storage', syncActiveOrganization);
        };
    }, [loadOrganizationRole]);

    useEffect(() => {
        if (organizationId) {
            void loadAccounts(organizationId, { nextRefreshing: true });
        }
    }, [loadAccounts, organizationId]);

    useEffect(() => {
        if (!organizationId || !hasSyncInProgress) {
            return;
        }

        const intervalId = window.setInterval(() => {
            void loadAccounts(organizationId, { background: true, silentErrors: true });
        }, 10000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [hasSyncInProgress, loadAccounts, organizationId]);

    const canManageAccounts = canManageCloudAccounts(organizationRole);

    const handleSyncAll = useCallback(async () => {
        if (!organizationId || !accounts.length || syncing || !canManageAccounts) {
            return;
        }

        const syncableAccounts = accounts.filter((account) => account.isSyncInProgress !== true);

        if (syncableAccounts.length === 0) {
            toast.info('Todas as contas já possuem sync em andamento.');
            return;
        }

        setSyncing(true);
        setAccounts((currentAccounts) =>
            currentAccounts.map((account) =>
                syncableAccounts.some((syncableAccount) => syncableAccount.id === account.id)
                    ? {
                          ...account,
                          isSyncInProgress: true,
                      }
                    : account
            )
        );

        try {
            const syncResults = await Promise.all(
                syncableAccounts.map(async (account) => {
                    const response = await enqueueGeneralSync(organizationId, account.id, account.provider);
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

            await loadAccounts(organizationId, { nextRefreshing: true });
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

            const account = accounts.find((a) => a.id === cloudAccountId);

            if (account?.isSyncInProgress) {
                toast.info('Esta conta já possui sync em andamento.');
                return;
            }

            setSyncingAccountId(cloudAccountId);
            setAccounts((currentAccounts) =>
                currentAccounts.map((currentAccount) =>
                    currentAccount.id === cloudAccountId
                        ? {
                              ...currentAccount,
                              isSyncInProgress: true,
                          }
                        : currentAccount
                )
            );

            try {
                const response = await enqueueGeneralSync(organizationId, cloudAccountId, account?.provider);
                const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

                if (!response.ok) {
                    const message = extractErrorMessage(payload ?? null);
                    toast.error(message);
                    return;
                }

                toast.success('Sync da conta enfileirado com sucesso.');
                await loadAccounts(organizationId, { nextRefreshing: true });
            } catch {
                toast.error('Não foi possível enfileirar o sync da conta.');
            } finally {
                setSyncingAccountId(null);
            }
        },
        [accounts, canManageAccounts, loadAccounts, organizationId, syncingAccountId]
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
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void loadAccounts(organizationId, { nextRefreshing: true })}
                                isLoading={refreshing}
                            >
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
                            <div className="p-4">
                                <OrganizationCloudTable
                                    data={accounts}
                                    canManageAccounts={canManageAccounts}
                                    syncingAccountId={syncingAccountId}
                                    onSyncAccount={(id) => void handleSyncAccount(id)}
                                    onEditAccount={handleEditAccount}
                                />
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
