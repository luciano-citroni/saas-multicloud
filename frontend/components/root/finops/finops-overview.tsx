'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, DollarSign, Lightbulb, TrendingUp } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSummaryCards } from '@/components/root/finops/overview/finops-summary-cards';
import { FinopsJobsTable } from '@/components/root/finops/overview/finops-jobs-table';
import { FinopsRecommendations } from '@/components/root/finops/overview/finops-recommendations';
import { FinopsConsentDialog } from '@/components/root/finops/overview/finops-consent-dialog';
import { FinopsSyncDialog } from '@/components/root/finops/overview/finops-sync-dialog';
import { FinopsDashboardPanels } from '@/components/root/finops/overview/finops-dashboard-panels';
import { FinopsAggregatedDashboard } from '@/components/root/finops/overview/finops-aggregated-dashboard';
import { FinopsCloudAccountSelector } from '@/components/root/finops/overview/finops-cloud-account-selector';
import { FinopsCloudAccountsManagement } from '@/components/root/finops/overview/finops-cloud-accounts-management';
import { aggregateFinopsData, type AggregatedFinopsData } from '@/components/root/finops/overview/finops-aggregator';
import {
    DEFAULT_JOBS_LIMIT,
    DEFAULT_JOBS_PAGE,
    normalizeJobs,
    normalizeJobsLimit,
    normalizePagination,
    readPaginationFromLocation,
} from '@/components/root/finops/overview/helpers';
import type {
    FinopsConsent,
    FinopsAnomaly,
    ForecastResult,
    OptimizationInsight,
    BillingRecord,
    CostByServiceItem,
    FinopsDashboard,
    FinopsJob,
    FinopsRecommendation,
    FinopsScore,
    ForecastMonthProjection,
    PaginationMeta,
    SidebarContextPayload,
} from '@/components/root/finops/overview/types';
import {
    ACTIVE_ORG_STORAGE_KEY,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT,
    notifyActiveCloudAccountChanged,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import {
    fetchFinopsConsent,
    acceptFinopsConsent,
    startFinopsSync,
    fetchFinopsJobs,
    fetchFinopsJobStatus,
    fetchFinopsDashboard,
    fetchFinopsScore,
    fetchFinopsRecommendations,
    fetchFinopsCostByService,
    fetchFinopsForecast,
    fetchFinopsAnomalies,
    fetchFinopsInsights,
    fetchFinopsBillingHistory,
} from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const CLOUD_PROVIDER_STORAGE_KEY = 'smc_active_cloud_provider';
const SELECTED_ACCOUNT_STORAGE_KEY = 'smc_finops_selected_account';

type FinopsOverviewProps = {
    mode?: 'all' | 'individual';
};

export function FinopsOverview({ mode = 'all' }: FinopsOverviewProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    type DashboardPeriod = 'last7days' | 'last30days' | 'last90days' | 'currentmonth' | 'lastmonth' | 'ytd';

    const isDashboardPeriod = (value: string | null): value is DashboardPeriod => {
        return (
            value === 'last7days' ||
            value === 'last30days' ||
            value === 'last90days' ||
            value === 'currentmonth' ||
            value === 'lastmonth' ||
            value === 'ytd'
        );
    };

    const getPeriodFilters = (period: DashboardPeriod) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        if (period === 'last7days') {
            return { anomalyDays: 7, year: currentYear, month: currentMonth };
        }
        if (period === 'last30days') {
            return { anomalyDays: 30, year: currentYear, month: currentMonth };
        }
        if (period === 'last90days') {
            return { anomalyDays: 90, year: currentYear, month: currentMonth };
        }
        if (period === 'currentmonth') {
            return { anomalyDays: Math.max(1, now.getDate()), year: currentYear, month: currentMonth };
        }
        if (period === 'lastmonth') {
            const reference = new Date(currentYear, now.getMonth() - 1, 1);
            return {
                anomalyDays: 30,
                year: reference.getFullYear(),
                month: reference.getMonth() + 1,
            };
        }

        return { anomalyDays: 365, year: currentYear, month: currentMonth };
    };

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [cloudProvider, setCloudProvider] = useState<string>('aws');
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);

    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [loadingCloudAccounts, setLoadingCloudAccounts] = useState(false);
    const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('lastmonth');

    const [hasConsent, setHasConsent] = useState<boolean | null>(null);
    const [dashboard, setDashboard] = useState<FinopsDashboard | null>(null);
    const [score, setScore] = useState<FinopsScore | null>(null);
    const [jobs, setJobs] = useState<FinopsJob[]>([]);
    const [jobsPagination, setJobsPagination] = useState<PaginationMeta | null>(null);
    const [recommendations, setRecommendations] = useState<FinopsRecommendation[]>([]);
    const [costByService, setCostByService] = useState<CostByServiceItem[]>([]);
    const [forecast, setForecast] = useState<ForecastResult | null>(null);
    const [forecastNextMonths, setForecastNextMonths] = useState<ForecastMonthProjection[]>([]);
    const [anomalies, setAnomalies] = useState<FinopsAnomaly[]>([]);
    const [insights, setInsights] = useState<OptimizationInsight | null>(null);
    const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
    const [jobsPage, setJobsPage] = useState(DEFAULT_JOBS_PAGE);
    const [jobsLimit, setJobsLimit] = useState(DEFAULT_JOBS_LIMIT);

    // Multi-account aggregated data
    const [aggregatedDashboards, setAggregatedDashboards] = useState<(FinopsDashboard | null)[]>([]);
    const [aggregatedCostByServices, setAggregatedCostByServices] = useState<CostByServiceItem[][]>([]);
    const [aggregatedAnomalies, setAggregatedAnomalies] = useState<FinopsAnomaly[][]>([]);
    const [aggregatedRecommendations, setAggregatedRecommendations] = useState<FinopsRecommendation[][]>([]);
    const [aggregatedForecasts, setAggregatedForecasts] = useState<(ForecastResult | null)[]>([]);
    const [aggregatedInsights, setAggregatedInsights] = useState<(OptimizationInsight | null)[]>([]);
    const [aggregatedBillingHistory, setAggregatedBillingHistory] = useState<BillingRecord[][]>([]);
    const [aggregatedData, setAggregatedData] = useState<AggregatedFinopsData | null>(null);

    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingTable, setLoadingTable] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [acceptingConsent, setAcceptingConsent] = useState(false);

    const [showConsentDialog, setShowConsentDialog] = useState(false);
    const [showSyncDialog, setShowSyncDialog] = useState(false);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const prevOrgCloudRef = useRef<{ organizationId: string | null; cloudAccountId: string | null }>({
        organizationId: null,
        cloudAccountId: null,
    });
    const accountFromQuery = searchParams.get('account');

    const syncPaginationUrlState = useCallback((nextPage: number, nextLimit: number) => {
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);
        const normalizedPage = Math.max(DEFAULT_JOBS_PAGE, nextPage);
        const normalizedLimit = normalizeJobsLimit(nextLimit);

        if (normalizedPage === DEFAULT_JOBS_PAGE) {
            params.delete('page');
        } else {
            params.set('page', String(normalizedPage));
        }

        if (normalizedLimit === DEFAULT_JOBS_LIMIT) {
            params.delete('limit');
        } else {
            params.set('limit', String(normalizedLimit));
        }

        const nextQuery = params.toString();
        const currentQuery = window.location.search.startsWith('?') ? window.location.search.slice(1) : window.location.search;

        if (nextQuery === currentQuery) return;

        const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
        window.history.replaceState(window.history.state, '', nextUrl);
    }, []);

    useEffect(() => {
        const syncFromUrl = () => {
            const { page, limit } = readPaginationFromLocation();
            setJobsPage((current) => (current === page ? current : page));
            setJobsLimit((current) => (current === limit ? current : limit));
        };

        syncFromUrl();
        window.addEventListener('popstate', syncFromUrl);
        return () => window.removeEventListener('popstate', syncFromUrl);
    }, []);

    useEffect(() => {
        const activeOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const activeCloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
        const activeProvider = window.localStorage.getItem(CLOUD_PROVIDER_STORAGE_KEY) ?? 'aws';
        const savedSelectedAccount = window.localStorage.getItem(SELECTED_ACCOUNT_STORAGE_KEY);
        const requestedAccountId = accountFromQuery ?? savedSelectedAccount ?? activeCloudId;

        setOrganizationId(activeOrgId);
        setCloudAccountId(activeCloudId);
        setCloudProvider(activeProvider);
        setSelectedAccountId(requestedAccountId);

        const periodParam = searchParams.get('period');
        if (isDashboardPeriod(periodParam)) {
            setDashboardPeriod(periodParam);
        }
    }, [accountFromQuery, searchParams]);

    useEffect(() => {
        if (mode !== 'individual') return;

        if (accountFromQuery) {
            setSelectedAccountId(accountFromQuery);
        }
    }, [accountFromQuery, mode]);

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
        const handleContextChange = () => {
            const nextOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
            const nextCloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
            const nextProvider = window.localStorage.getItem(CLOUD_PROVIDER_STORAGE_KEY) ?? 'aws';
            setOrganizationId(nextOrgId);
            setCloudAccountId(nextCloudId);
            setCloudProvider(nextProvider);
            setHasConsent(null);
            setJobsPage(DEFAULT_JOBS_PAGE);
            syncPaginationUrlState(DEFAULT_JOBS_PAGE, jobsLimit);
        };

        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
        window.addEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleContextChange);
        window.addEventListener('storage', handleContextChange);

        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
            window.removeEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleContextChange);
            window.removeEventListener('storage', handleContextChange);
        };
    }, [jobsLimit, syncPaginationUrlState]);

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

    useEffect(() => {
        if (loadingInitial) return;
        if (!organizationId || !cloudAccountId) return;
        if (hasConsent !== false) return;
        if (!hasRequiredOrganizationRole(currentRole, 'ADMIN')) return;

        setShowConsentDialog(true);
    }, [cloudAccountId, currentRole, hasConsent, loadingInitial, organizationId]);

    const loadData = useCallback(
        async (
            orgId: string,
            cloudId: string,
            provider: string,
            options: { silent?: boolean; tableOnly?: boolean; page?: number; limit?: number } = {}
        ) => {
            if (options.tableOnly) {
                setLoadingTable(true);
            } else if (!options.silent) {
                setLoadingInitial(true);
            }

            const page = options.page ?? jobsPage;
            const limit = options.limit ?? jobsLimit;

            try {
                // Check consent first
                const consentRes = await fetchFinopsConsent(orgId, cloudId, provider);

                if (consentRes.status === 401) {
                    toast.error('Sua sessão expirou.');
                    router.replace('/auth/sign-in');
                    return;
                }

                if (!consentRes.ok) {
                    const consentPayload = await consentRes.json().catch(() => null);
                    toast.error(extractErrorMessage(consentPayload, 'pt'));
                    setHasConsent(false);
                    setDashboard(null);
                    setScore(null);
                    setJobs([]);
                    setJobsPagination(null);
                    setRecommendations([]);
                    setCostByService([]);
                    setForecast(null);
                    setAnomalies([]);
                    setInsights(null);
                    setBillingHistory([]);
                    return;
                }

                const consentPayload = (await consentRes.json().catch(() => null)) as FinopsConsent | null;
                const consentGranted = consentPayload?.accepted === true;

                setHasConsent(consentGranted);

                if (!consentGranted) {
                    setDashboard(null);
                    setScore(null);
                    setJobs([]);
                    setJobsPagination(null);
                    setRecommendations([]);
                    setCostByService([]);
                    setForecast(null);
                    setAnomalies([]);
                    setInsights(null);
                    setBillingHistory([]);
                    return;
                }

                if (options.tableOnly) {
                    const jobsRes = await fetchFinopsJobs(orgId, cloudId, page, limit);

                    if (jobsRes.ok) {
                        const jobsPayload = await jobsRes.json().catch(() => null);
                        setJobs(normalizeJobs(jobsPayload));
                        setJobsPagination(normalizePagination(jobsPayload));
                    }
                } else {
                    const periodFilters = getPeriodFilters(dashboardPeriod);
                    const [dashRes, scoreRes, jobsRes, recsRes, costsRes, forecastRes, anomaliesRes, insightsRes, billingRes] = await Promise.all([
                        fetchFinopsDashboard(orgId, cloudId, periodFilters.year, periodFilters.month),
                        fetchFinopsScore(orgId, cloudId, periodFilters.year, periodFilters.month),
                        fetchFinopsJobs(orgId, cloudId, page, limit),
                        fetchFinopsRecommendations(orgId, cloudId),
                        fetchFinopsCostByService(orgId, cloudId, periodFilters.year, periodFilters.month),
                        fetchFinopsForecast(orgId, cloudId),
                        fetchFinopsAnomalies(orgId, cloudId, 'open', periodFilters.anomalyDays),
                        fetchFinopsInsights(orgId, cloudId),
                        fetchFinopsBillingHistory(orgId, cloudId, periodFilters.anomalyDays > 30 ? 3 : 1),
                    ]);

                    if (dashRes.ok) {
                        const dashPayload = await dashRes.json().catch(() => null);
                        setDashboard(dashPayload as FinopsDashboard | null);
                    }

                    if (scoreRes.ok) {
                        const scorePayload = await scoreRes.json().catch(() => null);
                        setScore(scorePayload as FinopsScore | null);
                    }

                    if (jobsRes.ok) {
                        const jobsPayload = await jobsRes.json().catch(() => null);
                        setJobs(normalizeJobs(jobsPayload));
                        setJobsPagination(normalizePagination(jobsPayload));
                    }

                    if (recsRes.ok) {
                        const recsPayload = await recsRes.json().catch(() => null);
                        const items = Array.isArray(recsPayload)
                            ? recsPayload
                            : Array.isArray((recsPayload as { items?: unknown })?.items)
                              ? (recsPayload as { items: FinopsRecommendation[] }).items
                              : [];
                        setRecommendations(items);
                    }

                    if (costsRes.ok) {
                        const costsPayload = await costsRes.json().catch(() => null);
                        const items = Array.isArray(costsPayload)
                            ? costsPayload
                            : Array.isArray((costsPayload as { items?: unknown })?.items)
                              ? (costsPayload as { items: CostByServiceItem[] }).items
                              : [];
                        setCostByService(items);
                    }

                    if (forecastRes.ok) {
                        const forecastPayload = await forecastRes.json().catch(() => null);
                        setForecast((forecastPayload as ForecastResult | null) ?? null);
                    }

                    if (anomaliesRes.ok) {
                        const anomaliesPayload = await anomaliesRes.json().catch(() => null);
                        const items = Array.isArray(anomaliesPayload)
                            ? anomaliesPayload
                            : Array.isArray((anomaliesPayload as { items?: unknown })?.items)
                              ? (anomaliesPayload as { items: FinopsAnomaly[] }).items
                              : [];
                        setAnomalies(items);
                    }

                    if (insightsRes.ok) {
                        const insightsPayload = await insightsRes.json().catch(() => null);
                        setInsights((insightsPayload as OptimizationInsight | null) ?? null);
                    }

                    if (billingRes.ok) {
                        const billingPayload = await billingRes.json().catch(() => null);
                        const items = Array.isArray(billingPayload)
                            ? billingPayload
                            : Array.isArray((billingPayload as { items?: unknown })?.items)
                              ? (billingPayload as { items: BillingRecord[] }).items
                              : [];
                        setBillingHistory(items);
                    }
                }
            } catch {
                if (!options.silent && !options.tableOnly) toast.error('Não foi possível carregar dados de FinOps.');
            } finally {
                if (options.tableOnly) {
                    setLoadingTable(false);
                } else if (!options.silent) {
                    setLoadingInitial(false);
                }
            }
        },
        [dashboardPeriod, jobsLimit, jobsPage, router]
    );

    const loadAggregatedData = useCallback(
        async (orgId: string, accounts: OrganizationCloudAccount[], options: { silent?: boolean } = {}) => {
            if (!options.silent) {
                setLoadingInitial(true);
            }

            try {
                const periodFilters = getPeriodFilters(dashboardPeriod);
                const dashboards: (FinopsDashboard | null)[] = [];
                const costByServices: CostByServiceItem[][] = [];
                const allAnomalies: FinopsAnomaly[][] = [];
                const allRecommendations: FinopsRecommendation[][] = [];
                const forecasts: (ForecastResult | null)[] = [];
                const insights: (OptimizationInsight | null)[] = [];
                const billingHistories: BillingRecord[][] = [];

                // Load data for all accounts in parallel
                const results = await Promise.allSettled(
                    accounts.map(async (account) => {
                        const [dashRes, costsRes, anomaliesRes, recsRes, forecastRes, insightsRes, billingRes] = await Promise.all([
                            fetchFinopsDashboard(orgId, account.id, periodFilters.year, periodFilters.month),
                            fetchFinopsCostByService(orgId, account.id, periodFilters.year, periodFilters.month),
                            fetchFinopsAnomalies(orgId, account.id, 'open', periodFilters.anomalyDays),
                            fetchFinopsRecommendations(orgId, account.id),
                            fetchFinopsForecast(orgId, account.id),
                            fetchFinopsInsights(orgId, account.id),
                            fetchFinopsBillingHistory(orgId, account.id, periodFilters.anomalyDays > 30 ? 3 : 1),
                        ]);

                        return {
                            dashboard: dashRes.ok ? await dashRes.json().catch(() => null) : null,
                            costs: costsRes.ok
                                ? Array.isArray(await costsRes.json().catch(() => null))
                                    ? await costsRes.json().catch(() => [])
                                    : Array.isArray((await costsRes.json().catch(() => null))?.items)
                                      ? (await costsRes.json().catch(() => null)).items
                                      : []
                                : [],
                            anomalies: anomaliesRes.ok
                                ? Array.isArray(await anomaliesRes.json().catch(() => null))
                                    ? await anomaliesRes.json().catch(() => [])
                                    : Array.isArray((await anomaliesRes.json().catch(() => null))?.items)
                                      ? (await anomaliesRes.json().catch(() => null)).items
                                      : []
                                : [],
                            recommendations: recsRes.ok
                                ? Array.isArray(await recsRes.json().catch(() => null))
                                    ? await recsRes.json().catch(() => [])
                                    : Array.isArray((await recsRes.json().catch(() => null))?.items)
                                      ? (await recsRes.json().catch(() => null)).items
                                      : []
                                : [],
                            forecast: forecastRes.ok ? await forecastRes.json().catch(() => null) : null,
                            insights: insightsRes.ok ? await insightsRes.json().catch(() => null) : null,
                            billing: billingRes.ok
                                ? Array.isArray(await billingRes.json().catch(() => null))
                                    ? await billingRes.json().catch(() => [])
                                    : Array.isArray((await billingRes.json().catch(() => null))?.items)
                                      ? (await billingRes.json().catch(() => null)).items
                                      : []
                                : [],
                        };
                    })
                );

                // Collect results
                results.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        dashboards.push(result.value.dashboard);
                        costByServices.push(result.value.costs);
                        allAnomalies.push(result.value.anomalies);
                        allRecommendations.push(result.value.recommendations);
                        forecasts.push(result.value.forecast);
                        insights.push(result.value.insights);
                        billingHistories.push(result.value.billing);
                    }
                });

                setAggregatedDashboards(dashboards);
                setAggregatedCostByServices(costByServices);
                setAggregatedAnomalies(allAnomalies);
                setAggregatedRecommendations(allRecommendations);
                setAggregatedForecasts(forecasts);
                setAggregatedInsights(insights);
                setAggregatedBillingHistory(billingHistories);
            } catch {
                if (!options.silent) toast.error('Não foi possível carregar dados de FinOps.');
            } finally {
                if (!options.silent) {
                    setLoadingInitial(false);
                }
            }
        },
        [dashboardPeriod]
    );

    useEffect(() => {
        if (!organizationId) {
            setLoadingInitial(false);
            return;
        }

        if (mode === 'all') {
            if (cloudAccounts.length > 0) {
                void loadAggregatedData(organizationId, cloudAccounts);
            } else if (!loadingCloudAccounts) {
                setLoadingInitial(false);
            }
        } else {
            const requestedAccountId = accountFromQuery ?? selectedAccountId ?? cloudAccountId;
            const fallbackAccountId = cloudAccounts[0]?.id ?? null;
            const accountToUse = requestedAccountId ?? fallbackAccountId;

            if (!accountToUse) {
                setLoadingInitial(false);
                return;
            }

            const account = cloudAccounts.find((acc) => acc.id === accountToUse);
            if (!account) {
                if (!loadingCloudAccounts && fallbackAccountId && fallbackAccountId !== accountToUse) {
                    setSelectedAccountId(fallbackAccountId);
                }
                setLoadingInitial(false);
                return;
            }

            const prev = prevOrgCloudRef.current;
            const isContextChange = prev.organizationId !== organizationId || prev.cloudAccountId !== accountToUse;
            prevOrgCloudRef.current = { organizationId, cloudAccountId: accountToUse };

            if (isContextChange) {
                void loadData(organizationId, accountToUse, account.provider, {
                    page: jobsPage,
                    limit: jobsLimit,
                });
            } else {
                void loadData(organizationId, accountToUse, account.provider, {
                    tableOnly: true,
                    page: jobsPage,
                    limit: jobsLimit,
                });
            }
        }
    }, [
        organizationId,
        cloudAccountId,
        cloudProvider,
        jobsLimit,
        jobsPage,
        loadData,
        loadAggregatedData,
        mode,
        accountFromQuery,
        selectedAccountId,
        cloudAccounts,
        loadingCloudAccounts,
        dashboardPeriod,
    ]);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const pollJobStatus = useCallback(
        async (orgId: string, cloudId: string, jobId: string, provider: string) => {
            try {
                const response = await fetchFinopsJobStatus(orgId, cloudId, jobId);
                if (!response.ok) return;

                const job = (await response.json().catch(() => null)) as FinopsJob | null;
                if (!job) return;

                setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));

                if (job.status === 'completed' || job.status === 'failed') {
                    stopPolling();
                    setSyncing(false);

                    if (job.status === 'completed') {
                        toast.success('Sincronização de custos concluída!');
                        void loadData(orgId, cloudId, provider, { silent: true, page: jobsPage, limit: jobsLimit });
                    } else {
                        toast.error('Sincronização falhou. Tente novamente.');
                    }
                }
            } catch {
                // ignore polling errors
            }
        },
        [jobsLimit, jobsPage, loadData, stopPolling]
    );

    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    const handleStartSync = async (granularity: 'daily' | 'monthly', startDate: string, endDate: string) => {
        const accountToUse = accountFromQuery ?? selectedAccountId ?? cloudAccountId;
        if (!organizationId || !accountToUse) return;

        const account = cloudAccounts.find((acc) => acc.id === accountToUse);
        if (!account) return;

        setSyncing(true);
        setShowSyncDialog(false);

        try {
            const response = await startFinopsSync(organizationId, accountToUse, account.provider, granularity, startDate, endDate);
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                setSyncing(false);
                return;
            }

            const jobId = (payload as { jobId?: string })?.jobId;
            if (!jobId) {
                setSyncing(false);
                return;
            }

            toast.success('Sincronização de custos iniciada!');

            await loadData(organizationId, accountToUse, account.provider, { silent: true, page: jobsPage, limit: jobsLimit });

            stopPolling();
            pollingRef.current = setInterval(() => {
                void pollJobStatus(organizationId, accountToUse, jobId, account.provider);
            }, 3000);
        } catch {
            toast.error('Não foi possível iniciar a sincronização.');
            setSyncing(false);
        }
    };

    const handleAcceptConsent = async () => {
        const accountToUse = accountFromQuery ?? selectedAccountId ?? cloudAccountId;
        if (!organizationId || !accountToUse) return;

        const account = cloudAccounts.find((acc) => acc.id === accountToUse);
        if (!account) return;

        setAcceptingConsent(true);

        try {
            const response = await acceptFinopsConsent(organizationId, accountToUse, account.provider);
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                return;
            }

            setShowConsentDialog(false);
            setHasConsent(true);
            toast.success('Consentimento registrado! Iniciando sincronização histórica dos últimos 3 meses...');

            // Sincronização histórica automática: últimos 3 meses com granularidade diária
            const end = new Date();
            const start = new Date(end);
            start.setMonth(start.getMonth() - 3);
            const endDate = end.toISOString().slice(0, 10);
            const startDate = start.toISOString().slice(0, 10);

            void handleStartSync('daily', startDate, endDate);
        } catch {
            toast.error('Não foi possível registrar o consentimento.');
        } finally {
            setAcceptingConsent(false);
        }
    };

    const handleRefresh = async () => {
        if (mode === 'all') {
            setRefreshing(true);
            await loadAggregatedData(organizationId!, cloudAccounts, { silent: true });
            setRefreshing(false);
        } else {
            const accountToUse = accountFromQuery ?? selectedAccountId ?? cloudAccountId;
            if (!accountToUse) return;
            const account = cloudAccounts.find((item) => item.id === accountToUse);
            if (!account) return;
            setRefreshing(true);
            await loadData(organizationId!, accountToUse, account.provider, { silent: true, page: jobsPage, limit: jobsLimit });
            setRefreshing(false);
        }
    };

    // Sync aggregated data when its components change
    useEffect(() => {
        if (mode === 'all') {
            void aggregateFinopsData(
                aggregatedDashboards,
                aggregatedCostByServices,
                aggregatedAnomalies,
                aggregatedRecommendations,
                aggregatedForecasts,
                aggregatedInsights,
                aggregatedBillingHistory
            ).then(setAggregatedData);
        }
    }, [
        mode,
        aggregatedDashboards,
        aggregatedCostByServices,
        aggregatedAnomalies,
        aggregatedRecommendations,
        aggregatedForecasts,
        aggregatedInsights,
        aggregatedBillingHistory,
    ]);

    const handleSyncClick = () => {
        if (!hasConsent) {
            setShowConsentDialog(true);
        } else {
            setShowSyncDialog(true);
        }
    };

    const handleIndividualAccountChange = (accountId: string) => {
        const account = cloudAccounts.find((item) => item.id === accountId);

        setSelectedAccountId(accountId);

        if (typeof window !== 'undefined') {
            window.localStorage.setItem(SELECTED_ACCOUNT_STORAGE_KEY, accountId);
            window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, accountId);
            if (account?.provider) {
                window.localStorage.setItem(CLOUD_PROVIDER_STORAGE_KEY, account.provider);
                setCloudProvider(account.provider);
            }
            notifyActiveCloudAccountChanged();
        }

        const params = new URLSearchParams(searchParams.toString());
        params.set('account', accountId);
        const nextQuery = params.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    };

    const canSync = hasRequiredOrganizationRole(currentRole, 'ADMIN');
    const hasRunningJob = jobs.some((j) => j.status === 'pending' || j.status === 'running');

    const accountToUse = accountFromQuery ?? selectedAccountId ?? cloudAccountId ?? cloudAccounts[0]?.id;
    const currentCloudProvider = cloudAccounts.find((acc) => acc.id === accountToUse)?.provider || cloudProvider;

    if (!organizationId || (mode === 'individual' && !accountToUse)) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>FinOps</CardTitle>
                    <CardDescription>Selecione uma organização e uma conta cloud na sidebar para visualizar o painel financeiro.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (loadingInitial) {
        return <FinopsLoadingSkeleton />;
    }

    return (
        <>
            <div className="flex flex-col gap-6">
                {mode === 'individual' && cloudAccounts.length > 1 && (
                    <FinopsCloudAccountSelector
                        cloudAccounts={cloudAccounts}
                        selectedAccountId={selectedAccountId}
                        onAccountChange={handleIndividualAccountChange}
                    />
                )}

                {mode === 'individual' && (
                    <>
                        <FinopsSummaryCards
                            dashboard={dashboard}
                            score={score}
                            hasConsent={hasConsent}
                            canSync={canSync}
                            syncing={syncing}
                            acceptingConsent={acceptingConsent}
                            hasRunningJob={hasRunningJob}
                            refreshing={refreshing}
                            onStartSync={handleSyncClick}
                            onAcceptTerms={() => setShowConsentDialog(true)}
                            onRefresh={() => void handleRefresh()}
                        />

                        {hasConsent && (
                            <FinopsDashboardPanels
                                dashboard={dashboard}
                                costByService={costByService}
                                anomalies={anomalies}
                                recommendations={recommendations}
                                forecast={forecast}
                                insights={insights}
                                billingHistory={billingHistory}
                                onPeriodChange={setDashboardPeriod}
                            />
                        )}

                        <FinopsJobsTable
                            jobs={jobs}
                            jobsPage={jobsPage}
                            jobsLimit={jobsLimit}
                            jobsPagination={jobsPagination}
                            loadingTable={loadingTable}
                            title="Histórico de Sincronizações"
                            description="Últimos 5 syncs executados para esta conta"
                            previewLimit={5}
                            actionHref="/finops/history"
                            actionLabel="Ver histórico completo"
                            onChangeLimit={(limit) => {
                                const nextLimit = normalizeJobsLimit(limit);
                                setJobsLimit(nextLimit);
                                setJobsPage(DEFAULT_JOBS_PAGE);
                                syncPaginationUrlState(DEFAULT_JOBS_PAGE, nextLimit);
                            }}
                            onGoFirst={() => {
                                setJobsPage(DEFAULT_JOBS_PAGE);
                                syncPaginationUrlState(DEFAULT_JOBS_PAGE, jobsLimit);
                            }}
                            onGoPrevious={() => {
                                const nextPage = Math.max(jobsPage - 1, DEFAULT_JOBS_PAGE);
                                setJobsPage(nextPage);
                                syncPaginationUrlState(nextPage, jobsLimit);
                            }}
                            onGoNext={() => {
                                const nextPage = jobsPage + 1;
                                setJobsPage(nextPage);
                                syncPaginationUrlState(nextPage, jobsLimit);
                            }}
                            onGoLast={() => {
                                const nextPage = jobsPagination?.totalPages ?? DEFAULT_JOBS_PAGE;
                                setJobsPage(nextPage);
                                syncPaginationUrlState(nextPage, jobsLimit);
                            }}
                        />

                        <FinopsRecommendations
                            recommendations={recommendations}
                            previewLimit={5}
                            actionHref="/finops/recommendations"
                            actionLabel="Ver todas"
                        />

                        {hasConsent && (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <Link
                                    href={`/finops/anomalies?account=${encodeURIComponent(accountToUse!)}`}
                                    className="flex flex-col gap-1.5 rounded-xl border p-3 transition-colors hover:bg-muted/50"
                                >
                                    <AlertTriangle className="size-4 text-muted-foreground" />
                                    <p className="text-sm font-medium">Anomalias</p>
                                    <p className="text-xs text-muted-foreground">Desvios de custo</p>
                                </Link>
                                <Link
                                    href={`/finops/forecast?account=${encodeURIComponent(accountToUse!)}`}
                                    className="flex flex-col gap-1.5 rounded-xl border p-3 transition-colors hover:bg-muted/50"
                                >
                                    <TrendingUp className="size-4 text-muted-foreground" />
                                    <p className="text-sm font-medium">Forecast</p>
                                    <p className="text-xs text-muted-foreground">Projeção do mês</p>
                                </Link>
                                <Link
                                    href={`/finops/insights?account=${encodeURIComponent(accountToUse!)}`}
                                    className="flex flex-col gap-1.5 rounded-xl border p-3 transition-colors hover:bg-muted/50"
                                >
                                    <Lightbulb className="size-4 text-muted-foreground" />
                                    <p className="text-sm font-medium">Insights</p>
                                    <p className="text-xs text-muted-foreground">Otimização avançada</p>
                                </Link>
                                <Link
                                    href={`/finops/billing?account=${encodeURIComponent(accountToUse!)}`}
                                    className="flex flex-col gap-1.5 rounded-xl border p-3 transition-colors hover:bg-muted/50"
                                >
                                    <DollarSign className="size-4 text-muted-foreground" />
                                    <p className="text-sm font-medium">Billing</p>
                                    <p className="text-xs text-muted-foreground">Markup & margem</p>
                                </Link>
                            </div>
                        )}
                    </>
                )}

                {mode === 'all' && (
                    <>
                        <FinopsAggregatedDashboard data={aggregatedData} isLoading={loadingInitial} onPeriodChange={setDashboardPeriod} />
                        <FinopsCloudAccountsManagement cloudAccounts={cloudAccounts} dashboards={aggregatedDashboards} isLoading={loadingInitial} />
                    </>
                )}
            </div>

            <FinopsConsentDialog
                open={showConsentDialog}
                cloudProvider={currentCloudProvider}
                onAccept={() => void handleAcceptConsent()}
                onCancel={() => setShowConsentDialog(false)}
                isLoading={acceptingConsent}
            />

            <FinopsSyncDialog
                open={showSyncDialog}
                cloudProvider={currentCloudProvider}
                onConfirm={(granularity, startDate, endDate) => void handleStartSync(granularity, startDate, endDate)}
                onCancel={() => setShowSyncDialog(false)}
                isLoading={syncing}
            />
        </>
    );
}
