'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GovernanceJobsTable } from '@/components/root/governance/overview/governance-jobs-table';
import { GovernanceLoadingSkeleton } from '@/components/root/governance/overview/governance-loading-skeleton';
import { GovernanceSummaryCards } from '@/components/root/governance/overview/governance-summary-cards';
import {
    DEFAULT_JOBS_LIMIT,
    DEFAULT_JOBS_PAGE,
    normalizeJobs,
    normalizeJobsLimit,
    normalizePagination,
    readPaginationFromLocation,
} from '@/components/root/governance/overview/helpers';
import type { GovernanceJob, GovernanceScore, PaginationMeta, SidebarContextPayload } from '@/components/root/governance/overview/types';
import { ACTIVE_ORG_STORAGE_KEY, ACTIVE_ORG_CHANGED_EVENT, ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import { startGovernanceScan, fetchGovernanceJobs, fetchGovernanceJobStatus, fetchGovernanceScore } from '@/app/actions/governance';

// --- Helpers ------------------------------------------------------------------

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

function normalizeScore(payload: GovernanceScore | null): GovernanceScore | null {
    if (!payload?.jobId) {
        return null;
    }

    return payload;
}

// --- Component ----------------------------------------------------------------

export function GovernanceOverview() {
    const router = useRouter();

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);

    const [score, setScore] = useState<GovernanceScore | null>(null);
    const [jobs, setJobs] = useState<GovernanceJob[]>([]);
    const [jobsPagination, setJobsPagination] = useState<PaginationMeta | null>(null);
    const [jobsPage, setJobsPage] = useState(DEFAULT_JOBS_PAGE);
    const [jobsLimit, setJobsLimit] = useState(DEFAULT_JOBS_LIMIT);

    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingTable, setLoadingTable] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const prevOrgCloudRef = useRef<{ organizationId: string | null; cloudAccountId: string | null }>({
        organizationId: null,
        cloudAccountId: null,
    });

    const syncPaginationUrlState = useCallback((nextPage: number, nextLimit: number) => {
        if (typeof window === 'undefined') {
            return;
        }

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

        if (nextQuery === currentQuery) {
            return;
        }

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

        return () => {
            window.removeEventListener('popstate', syncFromUrl);
        };
    }, []);

    // -- Load context from localStorage ----------------------------------------

    useEffect(() => {
        const activeOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const activeCloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
        setOrganizationId(activeOrgId);
        setCloudAccountId(activeCloudId);
    }, []);

    // -- React to org/cloud account changes ------------------------------------

    useEffect(() => {
        const handleContextChange = () => {
            const nextOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
            const nextCloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
            setOrganizationId(nextOrgId);
            setCloudAccountId(nextCloudId);
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

    // -- Load RBAC role ---------------------------------------------------------

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

    // -- Load data --------------------------------------------------------------

    const loadData = useCallback(
        async (orgId: string, cloudId: string, options: { silent?: boolean; tableOnly?: boolean; page?: number; limit?: number } = {}) => {
            if (options.tableOnly) {
                setLoadingTable(true);
            } else if (!options.silent) {
                setLoadingInitial(true);
            }

            const page = options.page ?? jobsPage;
            const limit = options.limit ?? jobsLimit;

            try {
                if (options.tableOnly) {
                    const jobsRes = await fetchGovernanceJobs(orgId, cloudId, { page, limit });

                    if (jobsRes.status === 401) {
                        toast.error('Sua sessão expirou.');
                        router.replace('/auth/sign-in');
                        return;
                    }

                    if (jobsRes.ok) {
                        const jobsPayload = await jobsRes.json().catch(() => null);
                        setJobs(normalizeJobs(jobsPayload));
                        setJobsPagination(normalizePagination(jobsPayload));
                    }
                } else {
                    const [scoreRes, jobsRes] = await Promise.all([
                        fetchGovernanceScore(orgId, cloudId),
                        fetchGovernanceJobs(orgId, cloudId, { page, limit }),
                    ]);

                    if (scoreRes.status === 401 || jobsRes.status === 401) {
                        toast.error('Sua sessão expirou.');
                        router.replace('/auth/sign-in');
                        return;
                    }

                    if (scoreRes.ok) {
                        const scorePayload = await scoreRes.json().catch(() => null);
                        setScore(normalizeScore(scorePayload as GovernanceScore | null));
                    }

                    if (jobsRes.ok) {
                        const jobsPayload = await jobsRes.json().catch(() => null);
                        setJobs(normalizeJobs(jobsPayload));
                        setJobsPagination(normalizePagination(jobsPayload));
                    }
                }
            } catch {
                if (!options.silent && !options.tableOnly) toast.error('Não foi possível carregar dados de governança.');
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
            void loadData(organizationId, cloudAccountId, { page: jobsPage, limit: jobsLimit });
        } else {
            void loadData(organizationId, cloudAccountId, { tableOnly: true, page: jobsPage, limit: jobsLimit });
        }
    }, [organizationId, cloudAccountId, jobsLimit, jobsPage, loadData]);

    // -- Polling for running jobs -----------------------------------------------

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const pollJobStatus = useCallback(
        async (orgId: string, cloudId: string, jobId: string) => {
            try {
                const response = await fetchGovernanceJobStatus(orgId, cloudId, jobId);
                if (!response.ok) return;

                const job = (await response.json().catch(() => null)) as GovernanceJob | null;
                if (!job) return;

                setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));

                if (job.status === 'completed' || job.status === 'failed') {
                    stopPolling();
                    setScanning(false);

                    if (job.status === 'completed') {
                        toast.success('Varredura de governança concluída!');
                        void loadData(orgId, cloudId, { silent: true, page: jobsPage, limit: jobsLimit });
                    } else {
                        toast.error('Varredura de governança falhou. Tente novamente.');
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

    // -- Actions ----------------------------------------------------------------

    const handleStartScan = async () => {
        if (!organizationId || !cloudAccountId) return;

        setScanning(true);

        try {
            const response = await startGovernanceScan(organizationId, cloudAccountId);
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                setScanning(false);
                return;
            }

            const jobId = (payload as { jobId?: string })?.jobId;
            if (!jobId) {
                setScanning(false);
                return;
            }

            toast.success('Varredura de governança iniciada!');

            // Refresh job list
            await loadData(organizationId, cloudAccountId, { silent: true, page: jobsPage, limit: jobsLimit });

            // Start polling
            stopPolling();
            pollingRef.current = setInterval(() => {
                void pollJobStatus(organizationId, cloudAccountId, jobId);
            }, 3000);
        } catch {
            toast.error('Não foi possível iniciar a varredura de governança.');
            setScanning(false);
        }
    };

    const handleRefresh = async () => {
        if (!organizationId || !cloudAccountId) return;
        setRefreshing(true);
        await loadData(organizationId, cloudAccountId, { silent: true, page: jobsPage, limit: jobsLimit });
        setRefreshing(false);
    };

    const handleOpenAnalysis = (job: GovernanceJob) => {
        if (job.status !== 'completed') return;
        router.push(`/governance/analysis?jobId=${encodeURIComponent(job.id)}`);
    };

    const canRunScan = hasRequiredOrganizationRole(currentRole, 'ADMIN');
    const hasRunningJob = jobs.some((j) => j.status === 'pending' || j.status === 'running');

    // -- Empty state ------------------------------------------------------------

    if (!organizationId || !cloudAccountId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Governança</CardTitle>
                    <CardDescription>Selecione uma organização e uma conta cloud na sidebar para visualizar o painel de governança.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (loadingInitial) {
        return <GovernanceLoadingSkeleton />;
    }

    // -- Render -----------------------------------------------------------------

    return (
        <div className="flex flex-col gap-6">
            <GovernanceSummaryCards
                score={score}
                canRunScan={canRunScan}
                scanning={scanning}
                hasRunningJob={hasRunningJob}
                refreshing={refreshing}
                onStartScan={() => void handleStartScan()}
                onRefresh={() => void handleRefresh()}
            />

            <GovernanceJobsTable
                jobs={jobs}
                jobsPage={jobsPage}
                jobsLimit={jobsLimit}
                jobsPagination={jobsPagination}
                loadingTable={loadingTable}
                onOpenAnalysis={handleOpenAnalysis}
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
        </div>
    );
}
