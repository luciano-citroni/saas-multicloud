'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ACTIVE_ORG_CHANGED_EVENT, ACTIVE_ORG_STORAGE_KEY, SIDEBAR_CONTEXT_UPDATED_EVENT, notifySidebarContextUpdated } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { canManageCloudAccounts, canSyncCloudAccounts, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import {
    deleteOrganizationCloudAccount,
    enqueueGeneralSync,
    fetchOrganizationCloudAccounts,
    isAwsProvider,
    isGcpProvider,
    pollGeneralSyncJobStatus,
    type GeneralSyncJobStatus,
    type OrganizationCloudAccount as CloudAccount,
} from '@/app/actions/organization';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CloudAccountTable } from './cloud-account-table';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from '@/lib/i18n';
import { ConfirmCloudAccountActionDialog } from '@/components/root/cloud-accounts/edit/confirm-cloud-account-action-dialog';

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
    last_general_sync_error?: string | null;
    last_general_sync_warning?: string | null;
};

type CloudAccountsApiPayload =
    | CloudAccountApiItem[]
    | {
          items?: CloudAccountApiItem[];
      };

type MidOrg = {
    id: string;
    name: string;
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
                organizationId:
                    typeof apiItem.organizationId === 'string'
                        ? apiItem.organizationId
                        : typeof (apiItem as CloudAccountApiItem & { organization_id?: unknown }).organization_id === 'string'
                          ? ((apiItem as CloudAccountApiItem & { organization_id?: string }).organization_id ?? null)
                          : null,
                tenantId:
                    typeof apiItem.tenantId === 'string'
                        ? apiItem.tenantId
                        : typeof (apiItem as CloudAccountApiItem & { tenant_id?: unknown }).tenant_id === 'string'
                          ? ((apiItem as CloudAccountApiItem & { tenant_id?: string }).tenant_id ?? null)
                          : null,
                isSyncInProgress: apiItem.isSyncInProgress === true || apiItem.is_sync_in_progress === true,
                lastGeneralSyncAt: normalizeDateValue(apiItem.lastGeneralSyncAt ?? apiItem.last_general_sync_at ?? null),
                lastGeneralSyncError:
                    typeof apiItem.lastGeneralSyncError === 'string'
                        ? apiItem.lastGeneralSyncError
                        : typeof apiItem.last_general_sync_error === 'string'
                          ? apiItem.last_general_sync_error
                          : null,
                lastGeneralSyncWarning:
                    typeof apiItem.lastGeneralSyncWarning === 'string'
                        ? apiItem.lastGeneralSyncWarning
                        : typeof apiItem.last_general_sync_warning === 'string'
                          ? apiItem.last_general_sync_warning
                          : null,
            };
        });
}

export function CloudAccountSync() {
    const router = useRouter();
    const tca = useTranslations('cloudAccounts');
    const tc = useTranslations('common');
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [organizationRole, setOrganizationRole] = useState<OrganizationRole | null>(null);
    const [maxCloudAccounts, setMaxCloudAccounts] = useState(0);
    const [accounts, setAccounts] = useState<CloudAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [resolvingRole, setResolvingRole] = useState(true);
    const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
    const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
    const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [midOrgs, setMidOrgs] = useState<MidOrg[]>([]);
    const syncPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopSyncPolling = useCallback(() => {
        if (syncPollingRef.current) {
            window.clearInterval(syncPollingRef.current);
            syncPollingRef.current = null;
        }
    }, []);

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

                    return [];
                }

                const cloudAccountsList = normalizeCloudAccounts(payload);
                setAccounts(cloudAccountsList);
                return cloudAccountsList;
            } catch {
                if (!silentErrors) {
                    toast.error(tca.loadListError);
                }

                if (!background) {
                    setAccounts([]);
                }

                return [];
            } finally {
                if (!background) {
                    setLoading(false);
                }

                setRefreshing(false);
            }
        },
        [tca]
    );

    useEffect(() => {
        return () => {
            stopSyncPolling();
        };
    }, [stopSyncPolling]);

    const pollSyncJobStatus = useCallback(
        async (tenantId: string, cloudAccountId: string, jobId: string, provider: string) => {
            try {
                const response = await pollGeneralSyncJobStatus(tenantId, cloudAccountId, jobId, provider);
                if (!response.ok) {
                    return;
                }

                const job = (await response.json().catch(() => null)) as GeneralSyncJobStatus | null;
                if (!job) {
                    return;
                }

                const normalizedStatus = job.status.trim().toLowerCase();

                if (normalizedStatus === 'completed') {
                    stopSyncPolling();
                    setSyncingAccountId(null);
                    const refreshedAccounts = await loadAccounts(tenantId, { nextRefreshing: true });
                    const refreshedAccount = refreshedAccounts.find((account) => account.id === cloudAccountId);
                    const syncWarning = refreshedAccount?.lastGeneralSyncWarning?.trim();

                    if (syncWarning) {
                        toast.warning(syncWarning);
                    } else {
                        toast.success(tca.syncComplete);
                    }
                    return;
                }

                if (normalizedStatus === 'failed') {
                    stopSyncPolling();
                    setSyncingAccountId(null);
                    toast.error(job.failedReason?.trim() || tca.syncFailed);
                    await loadAccounts(tenantId, { nextRefreshing: true });
                }
            } catch {
                // ignore transient polling errors
            }
        },
        [loadAccounts, stopSyncPolling, tca.syncComplete, tca.syncFailed]
    );

    const startSyncJobPolling = useCallback(
        (tenantId: string, cloudAccountId: string, jobId: string, provider: string) => {
            stopSyncPolling();
            void pollSyncJobStatus(tenantId, cloudAccountId, jobId, provider);
            syncPollingRef.current = window.setInterval(() => {
                void pollSyncJobStatus(tenantId, cloudAccountId, jobId, provider);
            }, 3000);
        },
        [pollSyncJobStatus, stopSyncPolling]
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

    const loadMidOrgs = useCallback(async (orgId: string) => {
        try {
            const response = await fetch(`/api/orgs?organizationId=${encodeURIComponent(orgId)}`, { cache: 'no-store' });

            if (!response.ok) {
                setMidOrgs([]);
                return;
            }

            const payload = (await response.json().catch(() => null)) as unknown;
            const items = Array.isArray(payload)
                ? payload
                : Array.isArray((payload as { items?: unknown[] } | null)?.items)
                  ? ((payload as { items?: unknown[] }).items ?? [])
                  : [];

            const normalized = items.filter(
                (item): item is MidOrg =>
                    typeof item === 'object' && item !== null && typeof (item as MidOrg).id === 'string' && typeof (item as MidOrg).name === 'string'
            );

            setMidOrgs(normalized);
        } catch {
            setMidOrgs([]);
        }
    }, []);

    useEffect(() => {
        const activeOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        setOrganizationId(activeOrganizationId);

        if (!activeOrganizationId) {
            setLoading(false);
            setResolvingRole(false);
            setMidOrgs([]);
            return;
        }

        void loadOrganizationRole(activeOrganizationId);
        void loadMidOrgs(activeOrganizationId);
    }, [loadMidOrgs, loadOrganizationRole]);

    useEffect(() => {
        const syncActiveOrganization = () => {
            const nextOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);

            setOrganizationId(nextOrganizationId);
            setAccounts([]);
            setSyncingAccountId(null);

            if (!nextOrganizationId) {
                setAccounts([]);
                setMidOrgs([]);
                setOrganizationRole(null);
                setLoading(false);
                setResolvingRole(false);
                return;
            }

            void loadOrganizationRole(nextOrganizationId);
            void loadMidOrgs(nextOrganizationId);
        };

        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, syncActiveOrganization);
        window.addEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, syncActiveOrganization);
        window.addEventListener('storage', syncActiveOrganization);

        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, syncActiveOrganization);
            window.removeEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, syncActiveOrganization);
            window.removeEventListener('storage', syncActiveOrganization);
        };
    }, [loadMidOrgs, loadOrganizationRole]);

    const organizationNamesById = useMemo(() => {
        return Object.fromEntries(midOrgs.map((org) => [org.id, org.name]));
    }, [midOrgs]);

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
    const canSyncAccounts = canSyncCloudAccounts(organizationRole);
    const hasCloudAccountLimit = maxCloudAccounts > 0;
    const hasReachedCloudAccountLimit = hasCloudAccountLimit && accounts.length >= maxCloudAccounts;

    const handleSyncAccount = useCallback(
        async (cloudAccountId: string) => {
            if (!organizationId || !canSyncAccounts || syncingAccountId) {
                return;
            }

            const account = accounts.find((a) => a.id === cloudAccountId);

            if (!account) {
                toast.error(tca.notFound);
                await loadAccounts(organizationId, { nextRefreshing: true });
                return;
            }

            if (account.tenantId && account.tenantId !== organizationId) {
                toast.error(tca.notFound);
                await loadAccounts(organizationId, { nextRefreshing: true });
                return;
            }

            if (account?.isSyncInProgress) {
                toast.info(tca.alreadySyncingToast);
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
                const tenantId = account.tenantId ?? organizationId;
                const response = await enqueueGeneralSync(tenantId, cloudAccountId, account?.provider);
                const payload = (await response.json().catch(() => null)) as (ApiErrorPayload & { id?: string }) | null;

                if (!response.ok) {
                    const message = extractErrorMessage(payload ?? null);
                    toast.error(message);
                    setAccounts((currentAccounts) =>
                        currentAccounts.map((currentAccount) =>
                            currentAccount.id === cloudAccountId
                                ? {
                                      ...currentAccount,
                                      isSyncInProgress: false,
                                  }
                                : currentAccount
                        )
                    );
                    return;
                }

                const jobId = typeof payload?.id === 'string' ? payload.id : null;

                if (isAwsProvider(account?.provider)) {
                    toast.success(tca.awsSyncStarted);
                } else if (isGcpProvider(account?.provider)) {
                    toast.success(tca.gcpSyncStarted);
                } else {
                    toast.success(tca.syncStarted);
                }

                await loadAccounts(organizationId, { nextRefreshing: true });

                if (jobId) {
                    startSyncJobPolling(tenantId, cloudAccountId, jobId, account.provider);
                }
            } catch {
                toast.error(tca.syncError);
                stopSyncPolling();
                setAccounts((currentAccounts) =>
                    currentAccounts.map((currentAccount) =>
                        currentAccount.id === cloudAccountId
                            ? {
                                  ...currentAccount,
                                  isSyncInProgress: false,
                              }
                            : currentAccount
                    )
                );
            } finally {
                if (!syncPollingRef.current) {
                    setSyncingAccountId(null);
                }
            }
        },
        [accounts, canSyncAccounts, loadAccounts, organizationId, startSyncJobPolling, stopSyncPolling, syncingAccountId, tca]
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

    const handleDeleteAccount = useCallback(
        (cloudAccountId: string) => {
            if (!canManageAccounts || deletingAccountId) {
                return;
            }

            setPendingDeleteAccountId(cloudAccountId);
        },
        [canManageAccounts, deletingAccountId]
    );

    const handleConfirmDeleteAccount = useCallback(async (): Promise<boolean> => {
        if (!organizationId || !canManageAccounts || deletingAccountId || !pendingDeleteAccountId) {
            return true;
        }

        setDeletingAccountId(pendingDeleteAccountId);

        try {
            const response = await deleteOrganizationCloudAccount(organizationId, pendingDeleteAccountId);
            const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

            if (response.status === 404) {
                notifySidebarContextUpdated();
                toast.success(tca.deleteSuccess);
                setPendingDeleteAccountId(null);
                await loadAccounts(organizationId, { nextRefreshing: true });
                router.refresh();
                return true;
            }

            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return false;
            }

            notifySidebarContextUpdated();
            toast.success(tca.deleteSuccess);
            setPendingDeleteAccountId(null);
            await loadAccounts(organizationId, { nextRefreshing: true });
            router.refresh();
            return true;
        } catch {
            toast.error(tca.deleteError);
            return false;
        } finally {
            setDeletingAccountId(null);
        }
    }, [canManageAccounts, deletingAccountId, loadAccounts, organizationId, pendingDeleteAccountId, router, tca]);

    const connectAccountButton = canManageAccounts ? (
        hasReachedCloudAccountLimit ? (
            <Button size="sm" disabled>
                <Plus className="mr-1 h-4 w-4" />
                {tca.newAccountButton}
            </Button>
        ) : (
            <Link href="/cloud-accounts/new">
                <Button size="sm">
                    <Plus className="mr-1 h-4 w-4" />
                    {tca.newAccountButton}
                </Button>
            </Link>
        )
    ) : null;

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{tca.selectOrgTitle}</CardTitle>
                    <CardDescription>{tca.selectOrgDesc}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <ConfirmCloudAccountActionDialog
                    title="Excluir conta cloud"
                    description="Esta ação remove a Conta Cloud permanentemente. Após a confirmação não pode ser desfeita."
                    confirmLabel="Excluir conta"
                    triggerLabel="Excluir conta"
                    open={Boolean(pendingDeleteAccountId)}
                    onOpenChange={(nextOpen) => {
                        if (!nextOpen) {
                            setPendingDeleteAccountId(null);
                        }
                    }}
                    hideTrigger
                    confirmVariant="destructive"
                    isConfirming={deletingAccountId !== null}
                    onConfirm={handleConfirmDeleteAccount}
                />

                <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">{tca.orgAccountsTitle}</p>
                        {hasReachedCloudAccountLimit ? <p className="text-xs text-muted-foreground">{tca.planLimitNote}</p> : null}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        {connectAccountButton}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void loadAccounts(organizationId, { nextRefreshing: true })}
                            isLoading={refreshing}
                        >
                            {tc.refresh}
                        </Button>
                    </div>
                </div>

                {loading || resolvingRole ? (
                    <div className="space-y-3 p-4">
                        <Skeleton className="h-10 w-full rounded-md" />
                        <Skeleton className="h-10 w-full rounded-md" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                ) : accounts.length === 0 ? (
                    <div className="px-4 py-6">
                        <p className="text-sm text-muted-foreground">{tca.noAccountsConnected}</p>
                    </div>
                ) : (
                    <div className="p-4">
                        <CloudAccountTable
                            data={accounts}
                            organizationNamesById={organizationNamesById}
                            canManageAccounts={canManageAccounts}
                            canSyncAccounts={canSyncAccounts}
                            syncingAccountId={syncingAccountId}
                            onSyncAccount={(id) => void handleSyncAccount(id)}
                            onEditAccount={handleEditAccount}
                            onDeleteAccount={(id) => void handleDeleteAccount(id)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
