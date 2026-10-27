'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsConsentDialog } from '@/components/root/finops/overview/finops-consent-dialog';
import { FinopsSyncDialog } from '@/components/root/finops/overview/finops-sync-dialog';
import { FinopsSpendPanel } from '@/components/root/finops/overview/finops-spend-panel';
import { FinopsOptimizePanel } from '@/components/root/finops/overview/finops-optimize-panel';
import { FinopsAccountsStrip } from '@/components/root/finops/overview/finops-accounts-strip';
import type { DashboardPeriod, FinopsJob, OrgFinopsOptimize, OrgFinopsOverview, SidebarContextPayload } from '@/components/root/finops/overview/types';
import {
    ACTIVE_ORG_STORAGE_KEY,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import {
    acceptFinopsConsent,
    fetchFinopsConsent,
    fetchFinopsJobStatus,
    fetchFinopsOrgOptimize,
    fetchFinopsOrgOverview,
    startFinopsSync,
} from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

type FinopsScope = 'org' | 'account';
type FinopsTab = 'spend' | 'optimize';

function isDashboardPeriod(value: string | null): value is DashboardPeriod {
    return (
        value === 'last7days' ||
        value === 'last30days' ||
        value === 'last90days' ||
        value === 'currentmonth' ||
        value === 'lastmonth' ||
        value === 'ytd'
    );
}

function isFinopsTab(value: string | null): value is FinopsTab {
    return value === 'spend' || value === 'optimize';
}

function periodLabel(period: DashboardPeriod): string {
    if (period === 'last7days') return 'Últimos 7 dias';
    if (period === 'last30days') return 'Últimos 30 dias';
    if (period === 'last90days') return 'Últimos 90 dias';
    if (period === 'currentmonth') return 'Mês atual';
    if (period === 'lastmonth') return 'Mês passado';
    return 'Ano até hoje';
}

export function FinopsOverview() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tf = useTranslations('finops');
    const tc = useTranslations('common');

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [activeCloudAccountId, setActiveCloudAccountId] = useState<string | null>(null);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [loadingCloudAccounts, setLoadingCloudAccounts] = useState(false);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);

    const [scope, setScope] = useState<FinopsScope>('org');
    const [period, setPeriod] = useState<DashboardPeriod>('lastmonth');
    const [tab, setTab] = useState<FinopsTab>('spend');

    const [overview, setOverview] = useState<OrgFinopsOverview | null>(null);
    const [optimize, setOptimize] = useState<OrgFinopsOptimize | null>(null);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [acceptingConsent, setAcceptingConsent] = useState(false);
    const [collectingCosts, setCollectingCosts] = useState(false);

    const [showConsentDialog, setShowConsentDialog] = useState(false);
    const [showSyncDialog, setShowSyncDialog] = useState(false);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const syncUrlState = useCallback(
        (next: { tab?: FinopsTab; period?: DashboardPeriod; scope?: FinopsScope; account?: string | null }) => {
            const params = new URLSearchParams(searchParams.toString());

            if (next.tab !== undefined) {
                if (next.tab === 'spend') params.delete('tab');
                else params.set('tab', next.tab);
            }

            if (next.period !== undefined) {
                if (next.period === 'lastmonth') params.delete('period');
                else params.set('period', next.period);
            }

            if (next.scope !== undefined) {
                if (next.scope === 'org') params.delete('scope');
                else params.set('scope', 'account');
            }

            if (next.account !== undefined) {
                if (!next.account) params.delete('account');
                else params.set('account', next.account);
            }

            const nextQuery = params.toString();
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    useEffect(() => {
        const periodParam = searchParams.get('period');
        const tabParam = searchParams.get('tab');
        const scopeParam = searchParams.get('scope');

        if (isDashboardPeriod(periodParam)) setPeriod(periodParam);
        if (isFinopsTab(tabParam)) setTab(tabParam);
        if (scopeParam === 'account') setScope('account');
        else setScope('org');

        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const cloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
        const accountFromQuery = searchParams.get('account');

        setOrganizationId(orgId);
        setActiveCloudAccountId(accountFromQuery ?? cloudId);

        if (accountFromQuery) {
            window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, accountFromQuery);
        }
    }, [searchParams]);

    useEffect(() => {
        const handleContextChange = () => {
            setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
            setActiveCloudAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
        };

        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
        window.addEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleContextChange);
        window.addEventListener('storage', handleContextChange);

        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
            window.removeEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleContextChange);
            window.removeEventListener('storage', handleContextChange);
        };
    }, []);

    useEffect(() => {
        if (!organizationId) return;

        const loadCloudAccounts = async () => {
            setLoadingCloudAccounts(true);
            try {
                const response = await fetchOrganizationCloudAccounts(organizationId);
                if (!response.ok) {
                    setCloudAccounts([]);
                    return;
                }
                const payload = await response.json().catch(() => null);
                const accounts = Array.isArray(payload)
                    ? payload
                    : Array.isArray((payload as { items?: unknown })?.items)
                      ? (payload as { items: OrganizationCloudAccount[] }).items
                      : [];
                // Todas as cloud accounts do tenant (mesmo universo da sidebar).
                setCloudAccounts(accounts);
            } catch {
                setCloudAccounts([]);
            } finally {
                setLoadingCloudAccounts(false);
            }
        };

        void loadCloudAccounts();
    }, [organizationId]);

    useEffect(() => {
        if (!organizationId) return;

        const loadRole = async () => {
            try {
                const response = await fetch('/api/sidebar/context', { cache: 'no-store' });
                if (!response.ok) return;
                const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
                const org = payload?.organizations?.find((o) => o?.id === organizationId);
                setCurrentRole(normalizeOrganizationRole(org?.currentRole ?? null));
            } catch {
                // non-blocking
            }
        };

        void loadRole();
    }, [organizationId]);

    const scopedAccountId = scope === 'account' ? activeCloudAccountId : undefined;

    const activeAccount = useMemo(
        () => cloudAccounts.find((account) => account.id === activeCloudAccountId) ?? cloudAccounts[0] ?? null,
        [activeCloudAccountId, cloudAccounts]
    );

    const accountAliases = useMemo(() => {
        const map: Record<string, string> = {};
        for (const account of cloudAccounts) map[account.id] = account.alias;
        return map;
    }, [cloudAccounts]);

    const displayAccounts = useMemo(() => {
        const metricsById = new Map((overview?.accounts ?? []).map((account) => [account.id, account]));

        // Fonte de verdade: todas as contas do tenant. Métricas FinOps entram por cima quando existirem.
        if (cloudAccounts.length > 0) {
            return cloudAccounts.map((account) => {
                const metrics = metricsById.get(account.id);
                const provider = (account.provider ?? '').toLowerCase();
                const finopsSupported = provider === 'aws' || provider === 'azure' || provider === 'gcp';

                return {
                    id: account.id,
                    alias: account.alias,
                    provider: account.provider,
                    totalCost: metrics?.totalCost ?? 0,
                    openAnomalies: metrics?.openAnomalies ?? 0,
                    openRecs: metrics?.openRecs ?? 0,
                    hasConsent: metrics?.hasConsent ?? false,
                    isActive: account.isActive,
                    finopsSupported,
                };
            });
        }

        return (overview?.accounts ?? []).map((account) => {
            const provider = (account.provider ?? '').toLowerCase();
            return {
                ...account,
                finopsSupported: provider === 'aws' || provider === 'azure' || provider === 'gcp',
            };
        });
    }, [cloudAccounts, overview?.accounts]);

    const loadOverview = useCallback(
        async (orgId: string, options: { silent?: boolean } = {}) => {
            if (!options.silent) setLoadingInitial(true);

            try {
                const response = await fetchFinopsOrgOverview(orgId, {
                    period,
                    cloudAccountId: scopedAccountId ?? undefined,
                });

                if (response.status === 401) {
                    toast.error(tc.sessionExpired);
                    router.replace('/auth/sign-in');
                    return;
                }

                if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    toast.error(extractErrorMessage(payload));
                    setOverview(null);
                    return;
                }

                const payload = (await response.json().catch(() => null)) as OrgFinopsOverview | null;
                setOverview(payload);
            } catch {
                if (!options.silent) toast.error(tf.loadError);
            } finally {
                if (!options.silent) setLoadingInitial(false);
            }
        },
        [period, router, scopedAccountId, tc.sessionExpired, tf.loadError]
    );

    const loadOptimize = useCallback(
        async (orgId: string) => {
            try {
                const response = await fetchFinopsOrgOptimize(orgId, {
                    status: 'open',
                    days: overview?.period.anomalyDays ?? 90,
                    cloudAccountId: scopedAccountId ?? undefined,
                    limit: 50,
                });

                if (!response.ok) {
                    setOptimize(null);
                    return;
                }

                const payload = (await response.json().catch(() => null)) as OrgFinopsOptimize | null;
                setOptimize(payload);
            } catch {
                setOptimize(null);
            }
        },
        [overview?.period.anomalyDays, scopedAccountId]
    );

    useEffect(() => {
        if (!organizationId) {
            setLoadingInitial(false);
            return;
        }
        void loadOverview(organizationId);
    }, [organizationId, loadOverview]);

    useEffect(() => {
        if (!organizationId || tab !== 'optimize') return;
        void loadOptimize(organizationId);
    }, [organizationId, tab, loadOptimize]);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    useEffect(() => () => stopPolling(), [stopPolling]);

    const pollJobStatus = useCallback(
        async (orgId: string, cloudId: string, jobId: string) => {
            try {
                const response = await fetchFinopsJobStatus(orgId, cloudId, jobId);
                if (!response.ok) return;
                const job = (await response.json().catch(() => null)) as FinopsJob | null;
                if (!job) return;

                if (job.status === 'completed' || job.status === 'failed') {
                    stopPolling();
                    setSyncing(false);
                    setCollectingCosts(false);

                    if (job.status === 'completed') {
                        toast.success(tf.syncComplete);
                        void loadOverview(orgId, { silent: true });
                        if (tab === 'optimize') void loadOptimize(orgId);
                    } else {
                        toast.error(job.error?.trim() ? job.error : tf.syncFailed);
                    }
                }
            } catch {
                // ignore polling errors
            }
        },
        [loadOptimize, loadOverview, stopPolling, tab, tf.syncComplete, tf.syncFailed]
    );

    const handleStartSync = async (granularity: 'daily' | 'monthly', startDate: string, endDate: string) => {
        if (!organizationId || !activeAccount) return;

        setSyncing(true);
        setCollectingCosts(true);
        setShowSyncDialog(false);

        try {
            const response = await startFinopsSync(
                organizationId,
                activeAccount.id,
                activeAccount.provider,
                granularity,
                startDate,
                endDate
            );
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                setSyncing(false);
                setCollectingCosts(false);
                return;
            }

            const jobId = (payload as { jobId?: string })?.jobId;
            if (!jobId) {
                setSyncing(false);
                setCollectingCosts(false);
                return;
            }

            toast.success(tf.syncStarted);
            stopPolling();
            pollingRef.current = setInterval(() => {
                void pollJobStatus(organizationId, activeAccount.id, jobId);
            }, 3000);
        } catch {
            toast.error(tf.syncError);
            setSyncing(false);
            setCollectingCosts(false);
        }
    };

    const handleAcceptConsent = async () => {
        if (!organizationId || !activeAccount) return;

        setAcceptingConsent(true);
        try {
            const response = await acceptFinopsConsent(organizationId, activeAccount.id, activeAccount.provider);
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }

            setShowConsentDialog(false);
            toast.success(tf.consentSuccess);

            const end = new Date();
            const start = new Date(end);
            start.setMonth(start.getMonth() - 3);
            void handleStartSync('daily', start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
        } catch {
            toast.error(tf.consentError);
        } finally {
            setAcceptingConsent(false);
        }
    };

    const handleRefresh = async () => {
        if (!organizationId) return;
        setRefreshing(true);
        await loadOverview(organizationId, { silent: true });
        if (tab === 'optimize') await loadOptimize(organizationId);
        setRefreshing(false);
    };

    const handleSyncClick = async () => {
        if (!organizationId || !activeAccount) {
            toast.error('Selecione uma conta cloud na sidebar.');
            return;
        }

        try {
            const response = await fetchFinopsConsent(organizationId, activeAccount.id, activeAccount.provider);
            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                toast.error(extractErrorMessage(payload));
                return;
            }
            const payload = await response.json().catch(() => null);
            if (payload?.accepted !== true) {
                setShowConsentDialog(true);
                return;
            }
            setShowSyncDialog(true);
        } catch {
            toast.error(tf.loadError);
        }
    };

    const canSync = hasRequiredOrganizationRole(currentRole, 'ADMIN');
    const hasNoData = overview != null && overview.totals.cost === 0 && overview.costTrend.length === 0;

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{tf.selectOrgTitle}</CardTitle>
                    <CardDescription>{tf.selectOrgDesc}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (loadingInitial && !overview) {
        return <FinopsLoadingSkeleton />;
    }

    return (
        <>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">FinOps</h1>
                        <p className="text-sm text-muted-foreground">Gastos e otimizações da organização</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={scope}
                            onValueChange={(value) => {
                                if (value === 'account' && activeCloudAccountId) {
                                    router.push(`/finops/accounts/${encodeURIComponent(activeCloudAccountId)}`);
                                    return;
                                }
                                setScope('org');
                                syncUrlState({ scope: 'org', account: null });
                            }}
                        >
                            <SelectTrigger className="w-[220px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="org">Todas as contas</SelectItem>
                                <SelectItem value="account" disabled={!activeAccount}>
                                    Abrir conta ativa{activeAccount ? ` (${activeAccount.alias})` : ''}
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={period}
                            onValueChange={(value) => {
                                const nextPeriod = value as DashboardPeriod;
                                setPeriod(nextPeriod);
                                syncUrlState({ period: nextPeriod });
                            }}
                        >
                            <SelectTrigger className="w-[170px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(['last7days', 'last30days', 'last90days', 'currentmonth', 'lastmonth', 'ytd'] as DashboardPeriod[]).map(
                                    (item) => (
                                        <SelectItem key={item} value={item}>
                                            {periodLabel(item)}
                                        </SelectItem>
                                    )
                                )}
                            </SelectContent>
                        </Select>

                        <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
                            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                            Atualizar
                        </Button>

                        {canSync && (
                            <Button
                                size="sm"
                                onClick={() => void handleSyncClick()}
                                isLoading={syncing}
                                disabled={syncing || !activeAccount}
                            >
                                <PlayCircle className="size-4" />
                                Sincronizar
                            </Button>
                        )}
                    </div>
                </div>

                {collectingCosts && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                        <Loader2 className="size-4 animate-spin" />
                        {tf.collectingCosts}
                    </div>
                )}

                {hasNoData && !collectingCosts && (
                    <Card>
                        <CardHeader>
                            <CardTitle>{tf.emptyCostsTitle}</CardTitle>
                            <CardDescription>{tf.emptyCostsDesc}</CardDescription>
                        </CardHeader>
                    </Card>
                )}

                <Tabs
                    value={tab}
                    onValueChange={(value) => {
                        const nextTab = value as FinopsTab;
                        setTab(nextTab);
                        syncUrlState({ tab: nextTab });
                    }}
                >
                    <TabsList>
                        <TabsTrigger value="spend">Gastos</TabsTrigger>
                        <TabsTrigger value="optimize">Otimizar</TabsTrigger>
                    </TabsList>

                    <TabsContent value="spend" className="mt-4">
                        <FinopsSpendPanel overview={overview} isLoading={loadingInitial && !overview} />
                    </TabsContent>

                    <TabsContent value="optimize" className="mt-4">
                        <FinopsOptimizePanel
                            organizationId={organizationId}
                            data={optimize}
                            accountAliases={accountAliases}
                            isLoading={!optimize && tab === 'optimize'}
                            onChanged={() => {
                                if (organizationId) void loadOptimize(organizationId);
                            }}
                        />
                    </TabsContent>
                </Tabs>

                <FinopsAccountsStrip
                    accounts={displayAccounts}
                    currency={overview?.totals.currency ?? 'USD'}
                    isLoading={loadingCloudAccounts && displayAccounts.length === 0}
                />
            </div>

            <FinopsConsentDialog
                open={showConsentDialog}
                cloudProvider={activeAccount?.provider ?? 'aws'}
                onAccept={() => void handleAcceptConsent()}
                onCancel={() => setShowConsentDialog(false)}
                isLoading={acceptingConsent}
            />

            <FinopsSyncDialog
                open={showSyncDialog}
                cloudProvider={activeAccount?.provider ?? 'aws'}
                onConfirm={(granularity, startDate, endDate) => void handleStartSync(granularity, startDate, endDate)}
                onCancel={() => setShowSyncDialog(false)}
                isLoading={syncing}
            />
        </>
    );
}
