'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsConsentDialog } from '@/components/root/finops/overview/finops-consent-dialog';
import { FinopsSyncDialog } from '@/components/root/finops/overview/finops-sync-dialog';
import { FinopsSpendPanel } from '@/components/root/finops/overview/finops-spend-panel';
import { FinopsAccountsStrip } from '@/components/root/finops/overview/finops-accounts-strip';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { FinopsFilterBar } from '@/components/root/finops/finops-filter-bar';
import {
    FinopsKpiStrip,
    FinopsPortfolioStrip,
    type FinopsBudgetStatusItem,
    type FinopsPortfolioSnapshot,
} from '@/components/root/finops/finops-kpi-strip';
import {
    ACCOUNT_FILTER_ALL,
    buildFinopsQuery,
    parseFinopsUrlFilters,
} from '@/components/root/finops/finops-filter-utils';
import { formatDate } from '@/components/root/finops/overview/helpers';
import type {
    DashboardPeriod,
    FinopsJob,
    OrgFinopsOverview,
    OrgOverviewAccount,
    SyncRun,
} from '@/components/root/finops/overview/types';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import {
    acceptFinopsConsent,
    fetchFinopsBudgetStatuses,
    fetchFinopsConsent,
    fetchFinopsJobStatus,
    fetchFinopsCommitmentsOverview,
    fetchFinopsOrgOverview,
    fetchFinopsSyncRuns,
    fetchOrganizationBudgetStatuses,
    fetchOrganizationFinopsBudgetStatuses,
    revokeFinopsConsent,
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
    const midOrgId = useActiveMidOrgId(organizationId);
    const [sidebarAccountId, setSidebarAccountId] = useState<string | null>(null);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [loadingCloudAccounts, setLoadingCloudAccounts] = useState(false);
    const { currentRole: rawRole } = useOrganizationFromSidebar(organizationId);
    const currentRole = normalizeOrganizationRole(rawRole);

    const [overview, setOverview] = useState<OrgFinopsOverview | null>(null);
    const [portfolio, setPortfolio] = useState<FinopsPortfolioSnapshot | null>(null);
    const [budgetStatuses, setBudgetStatuses] = useState<FinopsBudgetStatusItem[]>([]);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [acceptingConsent, setAcceptingConsent] = useState(false);
    const [collectingCosts, setCollectingCosts] = useState(false);

    const [showConsentDialog, setShowConsentDialog] = useState(false);
    const [showSyncDialog, setShowSyncDialog] = useState(false);
    const [revokeTarget, setRevokeTarget] = useState<OrgOverviewAccount | null>(null);
    const [revokingConsent, setRevokingConsent] = useState(false);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const period = urlFilters.period;
    const selectedAccountId = urlFilters.accountId;
    const providerFilter = urlFilters.provider;
    const serviceFilter = urlFilters.service;

    const syncUrlState = useCallback(
        (next: Partial<{
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
        window.addEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, handleContextChange);
        window.addEventListener('storage', handleContextChange);

        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
            window.removeEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, handleContextChange);
            window.removeEventListener('storage', handleContextChange);
        };
    }, []);

    useEffect(() => {
        if (!organizationId) return;

        const loadCloudAccounts = async () => {
            setLoadingCloudAccounts(true);
            try {
                const response = await fetchOrganizationCloudAccounts(organizationId, {
                    midOrgId: midOrgId ?? getActiveMidOrgId(organizationId),
                });
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
    }, [organizationId, midOrgId]);

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
                    setPortfolio(null);
                    return;
                }

                const payload = (await response.json().catch(() => null)) as OrgFinopsOverview | null;
                setOverview(payload);

                if (!payload?.period) {
                    setPortfolio(null);
                } else {
                    const portfolioResponse = await fetchFinopsCommitmentsOverview(orgId, {
                        cloudAccountId: selectedAccountId ?? undefined,
                        provider: providerFilter ?? undefined,
                        periodStart: payload.period.startDate,
                        periodEnd: payload.period.endDate,
                    });
                    if (portfolioResponse.ok) {
                        const portfolioPayload = (await portfolioResponse.json().catch(() => null)) as FinopsPortfolioSnapshot | null;
                        setPortfolio(portfolioPayload);
                    } else {
                        setPortfolio(null);
                    }
                }
            } catch {
                if (!options.silent) toast.error(tf.loadError);
            } finally {
                if (!options.silent) setLoadingInitial(false);
            }
        },
        [period, providerFilter, router, selectedAccountId, tc.sessionExpired, tf.loadError]
    );

    useEffect(() => {
        if (!organizationId) {
            setLoadingInitial(false);
            return;
        }
        void loadOverview(organizationId);
    }, [organizationId, loadOverview]);

    useEffect(() => {
        if (!organizationId) {
            setBudgetStatuses([]);
            setLastSyncAt(null);
            return;
        }

        const normalizeStatuses = (payload: unknown): FinopsBudgetStatusItem[] => {
            if (Array.isArray(payload)) return payload as FinopsBudgetStatusItem[];
            if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
                return (payload as { items: FinopsBudgetStatusItem[] }).items;
            }
            return [];
        };

        const mergeById = (items: FinopsBudgetStatusItem[]) => {
            const map = new Map<string, FinopsBudgetStatusItem>();
            for (const item of items) map.set(item.budget.id, item);
            return Array.from(map.values());
        };

        const loadBudgetExtras = async () => {
            try {
                if (!selectedAccountId) {
                    const budgetRes = await fetchOrganizationFinopsBudgetStatuses(organizationId, 50);
                    if (budgetRes.ok) {
                        setBudgetStatuses(normalizeStatuses(await budgetRes.json().catch(() => null)));
                    } else {
                        setBudgetStatuses([]);
                    }
                    setLastSyncAt(null);
                    return;
                }

                const [accountBudgetRes, orgBudgetRes, syncRes] = await Promise.all([
                    fetchFinopsBudgetStatuses(organizationId, selectedAccountId),
                    fetchOrganizationBudgetStatuses(organizationId),
                    fetchFinopsSyncRuns(organizationId, selectedAccountId),
                ]);

                const accountItems = accountBudgetRes.ok
                    ? normalizeStatuses(await accountBudgetRes.json().catch(() => null))
                    : [];
                const orgItems = orgBudgetRes.ok
                    ? normalizeStatuses(await orgBudgetRes.json().catch(() => null))
                    : [];
                setBudgetStatuses(mergeById([...orgItems, ...accountItems]));

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

        void loadBudgetExtras();
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
                    } else {
                        toast.error(job.error?.trim() ? job.error : tf.syncFailed);
                    }
                }
            } catch {
                // ignore polling errors
            }
        },
        [loadOverview, stopPolling, tf.syncComplete, tf.syncFailed]
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

    const handleRevokeConsent = async () => {
        if (!organizationId || !revokeTarget) return;

        setRevokingConsent(true);
        try {
            const response = await revokeFinopsConsent(organizationId, revokeTarget.id, revokeTarget.provider);
            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                toast.error(extractErrorMessage(payload));
                return;
            }

            setRevokeTarget(null);
            toast.success(tf.consentRevokeSuccess);
            await loadOverview(organizationId, { silent: true });
        } catch {
            toast.error(tf.consentRevokeError);
        } finally {
            setRevokingConsent(false);
        }
    };

    const handleRefresh = async () => {
        if (!organizationId) return;
        setRefreshing(true);
        await loadOverview(organizationId, { silent: true });
        setRefreshing(false);
    };

    const handleSyncClick = async () => {
        if (!organizationId || !syncTargetAccount) {
            toast.error(tf.selectAccountToSync);
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
                          lastSyncAt: metrics?.lastSyncAt ?? null,
                          isActive: account.isActive,
                          finopsSupported,
                      };
                  })
                : (overview?.accounts ?? []).map((account) => {
                      const provider = (account.provider ?? '').toLowerCase();
                      return {
                          ...account,
                          lastSyncAt: account.lastSyncAt ?? null,
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

        const allowedIds =
            providerFilter && !selectedAccountId
                ? new Set(displayAccounts.map((account) => account.id))
                : null;

        const anomalies = overview.anomalies.filter((item) => {
            if (allowedIds && !allowedIds.has(item.cloudAccountId)) return false;
            if (serviceFilter && item.service !== serviceFilter) return false;
            return true;
        });

        const recommendations = overview.recommendations.filter((item) => {
            if (allowedIds && !allowedIds.has(item.cloudAccountId)) return false;
            if (serviceFilter && !(item.description ?? '').includes(serviceFilter)) return false;
            return true;
        });

        return {
            cost: serviceFilter
                ? filteredCostByService.reduce((sum, item) => sum + Number(item.currentMonthCost ?? 0), 0)
                : providerScoped,
            currency: overview.totals.currency,
            momGrowth: Number(overview.totals.momGrowth),
            forecastedCost: overview.totals.forecastedCost,
            potentialSavings:
                providerFilter || serviceFilter
                    ? recommendations.reduce((sum, item) => sum + Number(item.potentialSaving ?? 0), 0)
                    : overview.totals.potentialSavings,
            openAnomalies: anomalies.length,
            openRecommendations: recommendations.length,
        };
    }, [
        displayAccounts,
        filteredCostByService,
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
        ? tf.spendOfAccount.replace('{alias}', selectedAccount.alias)
        : tf.tenantConsolidation;

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
                            {tc.refresh}
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

                {budgetStatuses.some((item) => (item.triggeredAlerts?.length ?? 0) > 0) && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                        Um ou mais orçamentos atingiram limiares de alerta.{' '}
                        <Link
                            href={
                                selectedAccountId
                                    ? `/finops/budgets?account=${encodeURIComponent(selectedAccountId)}`
                                    : '/finops/budgets?account=organization'
                            }
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
                    budgetsHref={
                        selectedAccountId
                            ? `/finops/budgets?account=${encodeURIComponent(selectedAccountId)}`
                            : '/finops/budgets?account=organization'
                    }
                    savingsHref={
                        selectedAccountId
                            ? `/finops/savings?account=${encodeURIComponent(selectedAccountId)}`
                            : '/finops/savings'
                    }
                    anomaliesHref={
                        selectedAccountId
                            ? `/finops/anomalies?account=${encodeURIComponent(selectedAccountId)}`
                            : '/finops/anomalies'
                    }
                    isLoading={loadingInitial && !overview}
                />

                <FinopsPortfolioStrip
                    portfolio={portfolio}
                    href={`/finops/commitments${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
                    isLoading={loadingInitial && !portfolio}
                />

                <FinopsSpendPanel
                    overview={overview}
                    accounts={displayAccounts}
                    costByService={overview?.costByService ?? []}
                    isLoading={loadingInitial && !overview}
                    onServiceClick={(service) =>
                        syncUrlState({ service: serviceFilter === service ? null : service })
                    }
                    organizationId={organizationId}
                    selectedAccountId={selectedAccountId}
                    selectedService={urlFilters.service}
                />

                <FinopsAccountsStrip
                    accounts={displayAccounts}
                    currency={overview?.totals.currency ?? 'USD'}
                    selectedAccountId={selectedAccountId}
                    isLoading={loadingCloudAccounts && displayAccounts.length === 0}
                    canManage={canSync}
                    onSelectAccount={(accountId) => syncUrlState({ account: accountId })}
                    onRevokeConsent={(account) => setRevokeTarget(account)}
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

            <AlertDialog
                open={Boolean(revokeTarget)}
                onOpenChange={(open) => {
                    if (!open && !revokingConsent) setRevokeTarget(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{tf.consentRevokeTitle}</AlertDialogTitle>
                        <AlertDialogDescription>{tf.consentRevokeDescription}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revokingConsent}>{tc.cancel}</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={revokingConsent}
                            onClick={(event) => {
                                event.preventDefault();
                                void handleRevokeConsent();
                            }}
                        >
                            {revokingConsent ? <Loader2 className="size-4 animate-spin" /> : null}
                            {tf.consentRevokeConfirm}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
