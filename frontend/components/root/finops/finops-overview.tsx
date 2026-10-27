'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsConsentDialog } from '@/components/root/finops/overview/finops-consent-dialog';
import { FinopsSyncDialog } from '@/components/root/finops/overview/finops-sync-dialog';
import { FinopsSpendPanel } from '@/components/root/finops/overview/finops-spend-panel';
import { FinopsOptimizePanel } from '@/components/root/finops/overview/finops-optimize-panel';
import { FinopsAccountsStrip } from '@/components/root/finops/overview/finops-accounts-strip';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { FinopsFilterBar } from '@/components/root/finops/finops-filter-bar';
import { FinopsKpiStrip, type FinopsBudgetStatusItem } from '@/components/root/finops/finops-kpi-strip';
import {
    ACCOUNT_FILTER_ALL,
    buildFinopsQuery,
    parseFinopsUrlFilters,
    type FinopsTab,
} from '@/components/root/finops/finops-filter-utils';
import { formatDate } from '@/components/root/finops/overview/helpers';
import type {
    DashboardPeriod,
    FinopsJob,
    OrgFinopsOptimize,
    OrgFinopsOverview,
    SidebarContextPayload,
    SyncRun,
} from '@/components/root/finops/overview/types';
import { ACTIVE_ORG_STORAGE_KEY, ACTIVE_ORG_CHANGED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import {
    acceptFinopsConsent,
    fetchFinopsBudgetStatuses,
    fetchFinopsConsent,
    fetchFinopsJobStatus,
    fetchFinopsOrgOptimize,
    fetchFinopsOrgOverview,
    fetchFinopsSyncRuns,
    startFinopsSync,
} from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

export function FinopsOverview() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tf = useTranslations('finops');
    const tc = useTranslations('common');

    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [sidebarAccountId, setSidebarAccountId] = useState<string | null>(null);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [loadingCloudAccounts, setLoadingCloudAccounts] = useState(false);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);

    const [overview, setOverview] = useState<OrgFinopsOverview | null>(null);
    const [optimize, setOptimize] = useState<OrgFinopsOptimize | null>(null);
    const [budgetStatuses, setBudgetStatuses] = useState<FinopsBudgetStatusItem[]>([]);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [acceptingConsent, setAcceptingConsent] = useState(false);
    const [collectingCosts, setCollectingCosts] = useState(false);

    const [showConsentDialog, setShowConsentDialog] = useState(false);
    const [showSyncDialog, setShowSyncDialog] = useState(false);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const period = urlFilters.period;
    const selectedAccountId = urlFilters.accountId;
    const providerFilter = urlFilters.provider;
    const serviceFilter = urlFilters.service;
    const tab = urlFilters.tab;

    const syncUrlState = useCallback(
        (next: Partial<{
            tab: FinopsTab;
            period: DashboardPeriod;
            account: string | null;
            provider: string | null;
            service: string | null;
        }>) => {
            const nextQuery = buildFinopsQuery(searchParams, next);
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    useEffect(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        setSidebarAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
    }, [searchParams]);

    useEffect(() => {
        const handleContextChange = () => {
            setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
            setSidebarAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
        };

        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
        window.addEventListener('storage', handleContextChange);

        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
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

    const selectedAccount = useMemo(
        () => (selectedAccountId ? (cloudAccounts.find((account) => account.id === selectedAccountId) ?? null) : null),
        [cloudAccounts, selectedAccountId]
    );

    const syncTargetAccount = useMemo(() => {
        if (selectedAccount) return selectedAccount;
        return cloudAccounts.find((account) => account.id === sidebarAccountId) ?? cloudAccounts[0] ?? null;
    }, [cloudAccounts, selectedAccount, sidebarAccountId]);

    const accountAliases = useMemo(() => {
        const map: Record<string, string> = {};
        for (const account of cloudAccounts) map[account.id] = account.alias;
        return map;
    }, [cloudAccounts]);

    const loadOverview = useCallback(
        async (orgId: string, options: { silent?: boolean } = {}) => {
            if (!options.silent) setLoadingInitial(true);

            try {
                const response = await fetchFinopsOrgOverview(orgId, {
                    period,
                    cloudAccountId: selectedAccountId ?? undefined,
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
        [period, router, selectedAccountId, tc.sessionExpired, tf.loadError]
    );

    const loadOptimize = useCallback(
        async (orgId: string) => {
            try {
                const response = await fetchFinopsOrgOptimize(orgId, {
                    status: 'open',
                    days: overview?.period.anomalyDays ?? 90,
                    cloudAccountId: selectedAccountId ?? undefined,
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
        [overview?.period.anomalyDays, selectedAccountId]
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

    useEffect(() => {
        if (!organizationId || !selectedAccountId) {
            setBudgetStatuses([]);
            setLastSyncAt(null);
            return;
        }

        const loadAccountExtras = async () => {
            try {
                const [budgetRes, syncRes] = await Promise.all([
                    fetchFinopsBudgetStatuses(organizationId, selectedAccountId),
                    fetchFinopsSyncRuns(organizationId, selectedAccountId),
                ]);

                if (budgetRes.ok) {
                    const payload = (await budgetRes.json().catch(() => null)) as FinopsBudgetStatusItem[] | null;
                    setBudgetStatuses(Array.isArray(payload) ? payload : []);
                } else {
                    setBudgetStatuses([]);
                }

                if (syncRes.ok) {
                    const payload = await syncRes.json().catch(() => null);
                    const runs = Array.isArray(payload)
                        ? (payload as SyncRun[])
                        : Array.isArray((payload as { items?: SyncRun[] })?.items)
                          ? (payload as { items: SyncRun[] }).items
                          : [];
                    const completed = runs.find((run) => run.status === 'completed' || run.completedAt);
                    setLastSyncAt(completed?.completedAt ?? completed?.createdAt ?? null);
                } else {
                    setLastSyncAt(null);
                }
            } catch {
                setBudgetStatuses([]);
                setLastSyncAt(null);
            }
        };

        void loadAccountExtras();
    }, [organizationId, selectedAccountId]);

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
        if (!organizationId || !syncTargetAccount) return;

        setSyncing(true);
        setCollectingCosts(true);
        setShowSyncDialog(false);

        try {
            const response = await startFinopsSync(
                organizationId,
                syncTargetAccount.id,
                syncTargetAccount.provider,
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
                void pollJobStatus(organizationId, syncTargetAccount.id, jobId);
            }, 3000);
        } catch {
            toast.error(tf.syncError);
            setSyncing(false);
            setCollectingCosts(false);
        }
    };

    const handleAcceptConsent = async () => {
        if (!organizationId || !syncTargetAccount) return;

        setAcceptingConsent(true);
        try {
            const response = await acceptFinopsConsent(organizationId, syncTargetAccount.id, syncTargetAccount.provider);
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
        if (!organizationId || !syncTargetAccount) {
            toast.error('Selecione uma conta cloud para sincronizar.');
            return;
        }

        try {
            const response = await fetchFinopsConsent(organizationId, syncTargetAccount.id, syncTargetAccount.provider);
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

    const displayAccounts = useMemo(() => {
        const metricsById = new Map((overview?.accounts ?? []).map((account) => [account.id, account]));

        const base =
            cloudAccounts.length > 0
                ? cloudAccounts.map((account) => {
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
                  })
                : (overview?.accounts ?? []).map((account) => {
                      const provider = (account.provider ?? '').toLowerCase();
                      return {
                          ...account,
                          finopsSupported: provider === 'aws' || provider === 'azure' || provider === 'gcp',
                      };
                  });

        if (!providerFilter) return base;
        return base.filter((account) => account.provider.toLowerCase() === providerFilter);
    }, [cloudAccounts, overview?.accounts, providerFilter]);

    const filteredCostByService = useMemo(() => {
        const items = overview?.costByService ?? [];
        if (!serviceFilter) return items;
        return items.filter((item) => item.service === serviceFilter);
    }, [overview?.costByService, serviceFilter]);

    const filteredOptimizeItems = useMemo(() => {
        let items = optimize?.items ?? [];
        if (providerFilter) {
            items = items.filter((item) => item.cloudProvider.toLowerCase() === providerFilter);
        }
        if (serviceFilter) {
            items = items.filter((item) => (item.service ?? '').includes(serviceFilter) || item.title.includes(serviceFilter));
        }
        if (providerFilter && !selectedAccountId) {
            const allowedIds = new Set(displayAccounts.map((account) => account.id));
            items = items.filter((item) => allowedIds.has(item.cloudAccountId));
        }
        return items;
    }, [displayAccounts, optimize?.items, providerFilter, selectedAccountId, serviceFilter]);

    const filteredTotals = useMemo(() => {
        if (!overview) {
            return {
                cost: 0,
                currency: 'USD',
                momGrowth: 0,
                forecastedCost: null as number | null,
                potentialSavings: 0,
                openAnomalies: 0,
                openRecommendations: 0,
            };
        }

        const providerScoped =
            providerFilter && !selectedAccountId
                ? displayAccounts.reduce((sum, account) => sum + Number(account.totalCost ?? 0), 0)
                : overview.totals.cost;

        const openAnomalies =
            providerFilter || serviceFilter
                ? filteredOptimizeItems.filter((item) => item.kind === 'anomaly').length
                : (optimize?.totals.openAnomalies ?? overview.anomalies.length);

        const openRecommendations =
            providerFilter || serviceFilter
                ? filteredOptimizeItems.filter((item) => item.kind === 'recommendation').length
                : (optimize?.totals.openRecommendations ?? overview.recommendations.length);

        const potentialSavings =
            providerFilter || serviceFilter
                ? filteredOptimizeItems
                      .filter((item) => item.kind === 'recommendation')
                      .reduce((sum, item) => sum + Number(item.impact ?? 0), 0)
                : overview.totals.potentialSavings;

        return {
            cost: serviceFilter
                ? filteredCostByService.reduce((sum, item) => sum + Number(item.currentMonthCost ?? 0), 0)
                : providerScoped,
            currency: overview.totals.currency,
            momGrowth: Number(overview.totals.momGrowth),
            forecastedCost: overview.totals.forecastedCost,
            potentialSavings,
            openAnomalies,
            openRecommendations,
        };
    }, [
        displayAccounts,
        filteredCostByService,
        filteredOptimizeItems,
        optimize?.totals.openAnomalies,
        optimize?.totals.openRecommendations,
        overview,
        providerFilter,
        selectedAccountId,
        serviceFilter,
    ]);

    const serviceOptions = useMemo(
        () => (overview?.costByService ?? []).map((item) => item.service).filter(Boolean),
        [overview?.costByService]
    );

    const canSync = hasRequiredOrganizationRole(currentRole, 'ADMIN');
    const hasNoData = overview != null && filteredTotals.cost === 0 && overview.costTrend.length === 0;
    const subtitle = selectedAccount
        ? `Gastos e otimizações de ${selectedAccount.alias}`
        : 'Consolidação financeira das contas do tenant';

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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-3">
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight">FinOps</h1>
                            <p className="text-sm text-muted-foreground">{subtitle}</p>
                        </div>
                        <FinopsSubnav />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
                            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                            Atualizar
                        </Button>

                        {canSync && (
                            <Button
                                size="sm"
                                onClick={() => void handleSyncClick()}
                                isLoading={syncing}
                                disabled={syncing || !syncTargetAccount}
                            >
                                <PlayCircle className="size-4" />
                                Sincronizar
                            </Button>
                        )}
                    </div>
                </div>

                <FinopsFilterBar
                    period={period}
                    accountId={selectedAccountId}
                    provider={providerFilter}
                    service={serviceFilter}
                    cloudAccounts={cloudAccounts}
                    serviceOptions={serviceOptions}
                    sidebarAccountId={sidebarAccountId}
                    onPeriodChange={(nextPeriod) => syncUrlState({ period: nextPeriod })}
                    onAccountChange={(accountId) => syncUrlState({ account: accountId ?? ACCOUNT_FILTER_ALL })}
                    onProviderChange={(provider) => syncUrlState({ provider })}
                    onServiceChange={(service) => syncUrlState({ service })}
                    onClear={() =>
                        syncUrlState({
                            period: 'lastmonth',
                            account: ACCOUNT_FILTER_ALL,
                            provider: null,
                            service: null,
                        })
                    }
                />

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {overview?.period && (
                        <span>
                            Período analisado:{' '}
                            <strong className="text-foreground">
                                {overview.period.startDate} → {overview.period.endDate}
                            </strong>
                        </span>
                    )}
                    <span>
                        Última sincronização:{' '}
                        <strong className="text-foreground">
                            {selectedAccountId ? formatDate(lastSyncAt) : 'Filtre uma conta para ver'}
                        </strong>
                    </span>
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

                {selectedAccountId &&
                    budgetStatuses.some((item) => (item.triggeredAlerts?.length ?? 0) > 0) && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                            Um ou mais orçamentos desta conta atingiram limiares de alerta.{' '}
                            <Link
                                href={`/finops/budgets?account=${encodeURIComponent(selectedAccountId)}`}
                                className="font-medium underline underline-offset-2"
                            >
                                Ver orçamentos
                            </Link>
                        </div>
                    )}

                <FinopsKpiStrip
                    cost={filteredTotals.cost}
                    currency={filteredTotals.currency}
                    momGrowth={filteredTotals.momGrowth}
                    forecastedCost={filteredTotals.forecastedCost}
                    potentialSavings={filteredTotals.potentialSavings}
                    openAnomalies={filteredTotals.openAnomalies}
                    openRecommendations={filteredTotals.openRecommendations}
                    budgetStatuses={budgetStatuses}
                    singleAccountMode={selectedAccountId != null}
                    budgetsHref={
                        selectedAccountId
                            ? `/finops/budgets?account=${encodeURIComponent(selectedAccountId)}`
                            : '/finops/budgets'
                    }
                    isLoading={loadingInitial && !overview}
                />

                <Tabs
                    value={tab}
                    onValueChange={(value) => {
                        syncUrlState({ tab: value as FinopsTab });
                    }}
                >
                    <TabsList>
                        <TabsTrigger value="spend">Gastos</TabsTrigger>
                        <TabsTrigger value="optimize">Otimizar</TabsTrigger>
                    </TabsList>

                    <TabsContent value="spend" className="mt-4">
                        <FinopsSpendPanel
                            overview={overview}
                            accounts={displayAccounts}
                            costByService={filteredCostByService}
                            isLoading={loadingInitial && !overview}
                            onServiceClick={(service) => syncUrlState({ service })}
                        />
                    </TabsContent>

                    <TabsContent value="optimize" className="mt-4">
                        <FinopsOptimizePanel
                            organizationId={organizationId}
                            items={filteredOptimizeItems}
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
                    selectedAccountId={selectedAccountId}
                    isLoading={loadingCloudAccounts && displayAccounts.length === 0}
                    onSelectAccount={(accountId) => syncUrlState({ account: accountId })}
                />
            </div>

            <FinopsConsentDialog
                open={showConsentDialog}
                cloudProvider={syncTargetAccount?.provider ?? 'aws'}
                onAccept={() => void handleAcceptConsent()}
                onCancel={() => setShowConsentDialog(false)}
                isLoading={acceptingConsent}
            />

            <FinopsSyncDialog
                open={showSyncDialog}
                cloudProvider={syncTargetAccount?.provider ?? 'aws'}
                onConfirm={(granularity, startDate, endDate) => void handleStartSync(granularity, startDate, endDate)}
                onCancel={() => setShowSyncDialog(false)}
                isLoading={syncing}
            />
        </>
    );
}
