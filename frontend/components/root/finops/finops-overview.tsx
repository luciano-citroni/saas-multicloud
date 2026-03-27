'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { BarChart2 } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSummaryCards } from '@/components/root/finops/overview/finops-summary-cards';
import { FinopsJobsTable } from '@/components/root/finops/overview/finops-jobs-table';
import { FinopsRecommendations } from '@/components/root/finops/overview/finops-recommendations';
import { FinopsConsentDialog } from '@/components/root/finops/overview/finops-consent-dialog';
import { FinopsSyncDialog } from '@/components/root/finops/overview/finops-sync-dialog';
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
    FinopsDashboard,
    FinopsJob,
    FinopsRecommendation,
    FinopsScore,
    PaginationMeta,
    SidebarContextPayload,
} from '@/components/root/finops/overview/types';
import { ACTIVE_ORG_STORAGE_KEY, ACTIVE_ORG_CHANGED_EVENT, ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT } from '@/lib/sidebar-context';
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
} from '@/app/actions/finops';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const CLOUD_PROVIDER_STORAGE_KEY = 'smc_active_cloud_provider';

export function FinopsOverview() {
    const router = useRouter();

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [cloudProvider, setCloudProvider] = useState<string>('aws');
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);

    const [hasConsent, setHasConsent] = useState<boolean | null>(null);
    const [dashboard, setDashboard] = useState<FinopsDashboard | null>(null);
    const [score, setScore] = useState<FinopsScore | null>(null);
    const [jobs, setJobs] = useState<FinopsJob[]>([]);
    const [jobsPagination, setJobsPagination] = useState<PaginationMeta | null>(null);
    const [recommendations, setRecommendations] = useState<FinopsRecommendation[]>([]);
    const [jobsPage, setJobsPage] = useState(DEFAULT_JOBS_PAGE);
    const [jobsLimit, setJobsLimit] = useState(DEFAULT_JOBS_LIMIT);

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
        setOrganizationId(activeOrgId);
        setCloudAccountId(activeCloudId);
        setCloudProvider(activeProvider);
    }, []);

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
                    return;
                }

                if (options.tableOnly) {
                    const jobsRes = await fetchFinopsJobs(orgId, cloudId);

                    if (jobsRes.ok) {
                        const jobsPayload = await jobsRes.json().catch(() => null);
                        setJobs(normalizeJobs(jobsPayload));
                        setJobsPagination(normalizePagination(jobsPayload));
                    }
                } else {
                    const [dashRes, scoreRes, jobsRes, recsRes] = await Promise.all([
                        fetchFinopsDashboard(orgId, cloudId),
                        fetchFinopsScore(orgId, cloudId),
                        fetchFinopsJobs(orgId, cloudId),
                        fetchFinopsRecommendations(orgId, cloudId),
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
        [jobsLimit, jobsPage, router]
    );

    useEffect(() => {
        if (!organizationId || !cloudAccountId) {
            setLoadingInitial(false);
            return;
        }

        const prev = prevOrgCloudRef.current;
        const isContextChange = prev.organizationId !== organizationId || prev.cloudAccountId !== cloudAccountId;
        prevOrgCloudRef.current = { organizationId, cloudAccountId };

        if (isContextChange) {
            void loadData(organizationId, cloudAccountId, cloudProvider, { page: jobsPage, limit: jobsLimit });
        } else {
            void loadData(organizationId, cloudAccountId, cloudProvider, { tableOnly: true, page: jobsPage, limit: jobsLimit });
        }
    }, [organizationId, cloudAccountId, cloudProvider, jobsLimit, jobsPage, loadData]);

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
        if (!organizationId || !cloudAccountId) return;

        setSyncing(true);
        setShowSyncDialog(false);

        try {
            const response = await startFinopsSync(organizationId, cloudAccountId, cloudProvider, granularity, startDate, endDate);
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

            await loadData(organizationId, cloudAccountId, cloudProvider, { silent: true, page: jobsPage, limit: jobsLimit });

            stopPolling();
            pollingRef.current = setInterval(() => {
                void pollJobStatus(organizationId, cloudAccountId, jobId, cloudProvider);
            }, 3000);
        } catch {
            toast.error('Não foi possível iniciar a sincronização.');
            setSyncing(false);
        }
    };

    const handleAcceptConsent = async () => {
        if (!organizationId || !cloudAccountId) return;

        setAcceptingConsent(true);

        try {
            const response = await acceptFinopsConsent(organizationId, cloudAccountId, cloudProvider);
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
        if (!organizationId || !cloudAccountId) return;
        setRefreshing(true);
        await loadData(organizationId, cloudAccountId, cloudProvider, { silent: true, page: jobsPage, limit: jobsLimit });
        setRefreshing(false);
    };

    const handleSyncClick = () => {
        if (!hasConsent) {
            setShowConsentDialog(true);
        } else {
            setShowSyncDialog(true);
        }
    };

    const canSync = hasRequiredOrganizationRole(currentRole, 'ADMIN');
    const hasRunningJob = jobs.some((j) => j.status === 'pending' || j.status === 'running');

    if (!organizationId || !cloudAccountId) {
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

                <FinopsJobsTable
                    jobs={jobs}
                    jobsPage={jobsPage}
                    jobsLimit={jobsLimit}
                    jobsPagination={jobsPagination}
                    loadingTable={loadingTable}
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

                {hasConsent && (
                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/finops/costs">
                                <BarChart2 className="size-4" />
                                Ver detalhes de custos
                            </Link>
                        </Button>
                    </div>
                )}

                <FinopsRecommendations recommendations={recommendations} />
            </div>

            <FinopsConsentDialog
                open={showConsentDialog}
                cloudProvider={cloudProvider}
                onAccept={() => void handleAcceptConsent()}
                onCancel={() => setShowConsentDialog(false)}
                isLoading={acceptingConsent}
            />

            <FinopsSyncDialog
                open={showSyncDialog}
                cloudProvider={cloudProvider}
                onConfirm={(granularity, startDate, endDate) => void handleStartSync(granularity, startDate, endDate)}
                onCancel={() => setShowSyncDialog(false)}
                isLoading={syncing}
            />
        </>
    );
}
