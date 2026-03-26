'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ACTIVE_ORG_CHANGED_EVENT, ACTIVE_ORG_STORAGE_KEY, SIDEBAR_CONTEXT_UPDATED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { canManageCloudAccounts, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import {
    enqueueGeneralSync,
    fetchOrganizationCloudAccounts,
    isAwsProvider,
    type OrganizationCloudAccount as CloudAccount,
} from '@/app/actions/organization';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CloudAccountTable } from './cloud-account-table';

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
        maxCloudAccounts?: number;
    }>;
};

type CloudAccountApiItem = CloudAccount & {
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

function normalizeCloudAccounts(payload: unknown): CloudAccount[] {
    const normalizedPayload = payload as CloudAccountsApiPayload;
    const items = Array.isArray(normalizedPayload) ? normalizedPayload : Array.isArray(normalizedPayload?.items) ? normalizedPayload.items : [];

    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .filter((item): item is CloudAccount => {
            return (
                typeof item === 'object' &&
                item !== null &&
                typeof (item as CloudAccount).id === 'string' &&
                typeof (item as CloudAccount).alias === 'string' &&
                typeof (item as CloudAccount).provider === 'string'
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

export function CloudAccountSync() {
    const router = useRouter();
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [organizationRole, setOrganizationRole] = useState<OrganizationRole | null>(null);
    const [maxCloudAccounts, setMaxCloudAccounts] = useState(0);
    const [accounts, setAccounts] = useState<CloudAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [resolvingRole, setResolvingRole] = useState(true);
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
                    toast.error('Não foi possível carregar as contas Cloud da Organização.');
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
            setMaxCloudAccounts(typeof activeOrganization?.maxCloudAccounts === 'number' ? activeOrganization.maxCloudAccounts : 0);
        } catch {
            setOrganizationRole(null);
            setMaxCloudAccounts(0);
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
    const hasCloudAccountLimit = maxCloudAccounts > 0;
    const hasReachedCloudAccountLimit = hasCloudAccountLimit && accounts.length >= maxCloudAccounts;

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

                if (isAwsProvider(account?.provider)) {
                    toast.success('Sync da conta AWS foi iniciado. O processamento vai considerar todas as regiões cadastradas nessa conta Cloud.');
                } else {
                    toast.success('Sync da conta Cloud foi iniciado com sucesso.');
                }
                await loadAccounts(organizationId, { nextRefreshing: true });
            } catch {
                toast.error('Não foi possível iniciar o sync da conta.');
            } finally {
                setSyncingAccountId(null);
            }
        },
        [accounts, canManageAccounts, loadAccounts, organizationId, syncingAccountId]
    );

    const handleEditAccount = useCallback(
        (cloudAccountId: string) => {
            if (!canManageAccounts) {
                return;
            }

            router.push(`/cloud-accounts/${encodeURIComponent(cloudAccountId)}/edit`);
        },
        [canManageAccounts, router]
    );

    const connectAccountButton = canManageAccounts ? (
        hasReachedCloudAccountLimit ? (
            <Button size="sm" disabled>
                <Plus className="mr-1 h-4 w-4" />
                Nova conta
            </Button>
        ) : (
            <Link href="/cloud-accounts/new">
                <Button size="sm">
                    <Plus className="mr-1 h-4 w-4" />
                    Nova conta
                </Button>
            </Link>
        )
    ) : null;

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Organização</CardTitle>
                    <CardDescription>Selecione uma organização na sidebar para visualizar as contas Cloud e sincronizações.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">Contas Cloud da Organização</p>
                        {hasReachedCloudAccountLimit ? (
                            <p className="text-xs text-muted-foreground">
                                Limite de contas cloud do plano atingido. Faça upgrade em Billing para conectar uma nova conta.
                            </p>
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        {connectAccountButton}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void loadAccounts(organizationId, { nextRefreshing: true })}
                            isLoading={refreshing}
                        >
                            Atualizar
                        </Button>
                    </div>
                </div>

                {loading || resolvingRole ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">Carregando contas...</div>
                ) : accounts.length === 0 ? (
                    <div className="px-4 py-6">
                        <p className="text-sm text-muted-foreground">
                            Nenhuma conta cloud conectada ainda. Conecte uma conta para habilitar o sync geral.
                        </p>
                    </div>
                ) : (
                    <div className="p-4">
                        <CloudAccountTable
                            data={accounts}
                            canManageAccounts={canManageAccounts}
                            syncingAccountId={syncingAccountId}
                            onSyncAccount={(id) => void handleSyncAccount(id)}
                            onEditAccount={handleEditAccount}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
