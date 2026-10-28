'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GovernanceJobsTable } from '@/components/root/governance/overview/governance-jobs-table';
import { GovernanceLoadingSkeleton } from '@/components/root/governance/overview/governance-loading-skeleton';
import { GovernanceSummaryCards } from '@/components/root/governance/overview/governance-summary-cards';
import {
    JOB_STATUS_FILTER_ALL,
    type JobStatusFilter,
} from '@/components/root/governance/overview/governance-jobs-filter-bar';
import {
    DEFAULT_JOBS_LIMIT,
    DEFAULT_JOBS_PAGE,
    normalizeJobs,
    normalizeJobsLimit,
    normalizePagination,
    readJobsFiltersFromLocation,
} from '@/components/root/governance/overview/helpers';
import type { GovernanceJob, GovernanceScore, PaginationMeta, SidebarContextPayload } from '@/components/root/governance/overview/types';
import {
    ACTIVE_ORG_STORAGE_KEY,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import { startGovernanceScan, fetchGovernanceJobs, fetchGovernanceJobStatus, fetchGovernanceScore } from '@/app/actions/governance';
import { useTranslations } from '@/lib/i18n';

// --- Helpers ------------------------------------------------------------------

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

function normalizeScore(payload: GovernanceScore | null): GovernanceScore | null {
    if (!payload?.jobId) {
        return null;
    }

    return payload;
}

type CloudAccountsApiPayload = OrganizationCloudAccount[] | { items?: OrganizationCloudAccount[] };

function normalizeCloudAccounts(payload: unknown): OrganizationCloudAccount[] {
    const normalizedPayload = payload as CloudAccountsApiPayload;
    const items = Array.isArray(normalizedPayload) ? normalizedPayload : Array.isArray(normalizedPayload?.items) ? normalizedPayload.items : [];

    return items.filter((item): item is OrganizationCloudAccount => {
        return (
            typeof item === 'object' &&
            item !== null &&
            typeof item.id === 'string' &&
            typeof item.alias === 'string' &&
            typeof item.provider === 'string'
        );
    });
}

// --- Component ----------------------------------------------------------------

export function GovernanceOverview() {
    const router = useRouter();
    const tg = useTranslations('governance');
    const tca = useTranslations('cloudAccounts');
    const tc = useTranslations('common');

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [activeCloudAccount, setActiveCloudAccount] = useState<OrganizationCloudAccount | null>(null);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);

    const [score, setScore] = useState<GovernanceScore | null>(null);
    const [jobs, setJobs] = useState<GovernanceJob[]>([]);
    const [jobsPagination, setJobsPagination] = useState<PaginationMeta | null>(null);
    const [jobsPage, setJobsPage] = useState(DEFAULT_JOBS_PAGE);
    const [jobsLimit, setJobsLimit] = useState(DEFAULT_JOBS_LIMIT);
    const [statusFilter, setStatusFilter] = useState<JobStatusFilter>(JOB_STATUS_FILTER_ALL);

    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingTable, setLoadingTable] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isContextLoading, setIsContextLoading] = useState(true);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const prevOrgCloudRef = useRef<{ organizationId: string | null; cloudAccountId: string | null }>({
        organizationId: null,
        cloudAccountId: null,
    });

    const syncJobsUrlState = useCallback((nextPage: number, nextLimit: number, nextStatus: JobStatusFilter) => {
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

        if (nextStatus === JOB_STATUS_FILTER_ALL) {
            params.delete('status');
        } else {
            params.set('status', nextStatus);
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
            const { page, limit, status } = readJobsFiltersFromLocation();
            setJobsPage((current) => (current === page ? current : page));
            setJobsLimit((current) => (current === limit ? current : limit));
            setStatusFilter((current) => (current === status ? current : status));
        };

        syncFromUrl();
        window.addEventListener('popstate', syncFromUrl);

        return () => {
            window.removeEventListener('popstate', syncFromUrl);
        };
    }, []);

    // -- Load context from backend + localStorage -------------------------------

    useEffect(() => {
        let cancelled = false;

        const loadContext = async () => {
            const activeOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
            const activeCloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);

            if (!cancelled) {
                setOrganizationId(activeOrgId);
                setCloudAccountId(activeCloudId);
            }

            if (!activeOrgId) {
                if (!cancelled) {
                    setCurrentRole(null);
                    setActiveCloudAccount(null);
                    setScore(null);
                    setJobs([]);
                    setJobsPagination(null);
                    setIsContextLoading(false);
                }

                return;
            }

            try {
                const [sidebarResponse, cloudAccountsResponse] = await Promise.all([
                    fetch('/api/sidebar/context', { cache: 'no-store' }),
                    fetchOrganizationCloudAccounts(activeOrgId),
                ]);

                if (sidebarResponse.status === 401 || cloudAccountsResponse.status === 401) {
                    toast.error(tc.sessionExpired);
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!sidebarResponse.ok || !cloudAccountsResponse.ok) {
                    if (!cancelled) {
                        setCurrentRole(null);
                        setActiveCloudAccount(null);
                        setCloudAccountId(null);
                        setScore(null);
                        setJobs([]);
                        setJobsPagination(null);
                    }

                    return;
                }

                const sidebarPayload = (await sidebarResponse.json().catch(() => null)) as SidebarContextPayload | null;
                const activeOrganization = sidebarPayload?.organizations?.find((organization) => organization?.id === activeOrgId);
                const cloudAccountsPayload = (await cloudAccountsResponse.json().catch(() => null)) as unknown;
                const cloudAccounts = normalizeCloudAccounts(cloudAccountsPayload);
                const resolvedActiveCloudAccount = cloudAccounts.find((account) => account.id === activeCloudId) ?? null;

                if (!cancelled) {
                    setCurrentRole(normalizeOrganizationRole(activeOrganization?.currentRole ?? null));
                    setActiveCloudAccount(resolvedActiveCloudAccount);
                    setCloudAccountId(resolvedActiveCloudAccount?.id ?? null);

                    if (!resolvedActiveCloudAccount) {
                        setScore(null);
                        setJobs([]);
                        setJobsPagination(null);
                    }
                }
            } catch {
                if (!cancelled) {
                    setCurrentRole(null);
                    setActiveCloudAccount(null);
                    setCloudAccountId(null);
                    setScore(null);
                    setJobs([]);
                    setJobsPagination(null);
                }
            } finally {
                if (!cancelled) {
                    setIsContextLoading(false);
                }
            }
        };

        void loadContext();

        return () => {
            cancelled = true;
        };
    }, []);

    // -- React to org/cloud account changes ------------------------------------

    useEffect(() => {
        const handleContextChange = () => {
            const nextOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
            const nextCloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
            setOrganizationId(nextOrgId);
            setCloudAccountId(nextCloudId);
            setJobsPage(DEFAULT_JOBS_PAGE);
            setStatusFilter(JOB_STATUS_FILTER_ALL);
            syncJobsUrlState(DEFAULT_JOBS_PAGE, jobsLimit, JOB_STATUS_FILTER_ALL);
        };

        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
        window.addEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleContextChange);
        window.addEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, handleContextChange);
        window.addEventListener('storage', handleContextChange);

        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
            window.removeEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleContextChange);
            window.removeEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, handleContextChange);
            window.removeEventListener('storage', handleContextChange);
        };
    }, [jobsLimit, syncJobsUrlState]);

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
        async (
            orgId: string,
            cloudId: string,
            options: { silent?: boolean; tableOnly?: boolean; page?: number; limit?: number; status?: JobStatusFilter } = {}
        ) => {
            if (options.tableOnly) {
                setLoadingTable(true);
            } else if (!options.silent) {
                setLoadingInitial(true);
            }

            const page = options.page ?? jobsPage;
            const limit = options.limit ?? jobsLimit;
            const status = options.status ?? statusFilter;
            const jobsQuery = {
                page,
                limit,
                status: status === JOB_STATUS_FILTER_ALL ? undefined : status,
            };

            try {
                if (options.tableOnly) {
                    const jobsRes = await fetchGovernanceJobs(orgId, cloudId, jobsQuery);

                    if (jobsRes.status === 401) {
                        toast.error(tc.sessionExpired);
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
                        fetchGovernanceJobs(orgId, cloudId, jobsQuery),
                    ]);

                    if (scoreRes.status === 401 || jobsRes.status === 401) {
                        toast.error(tc.sessionExpired);
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
                if (!options.silent && !options.tableOnly) toast.error(tg.loadError);
            } finally {
                if (options.tableOnly) {
                    setLoadingTable(false);
                } else if (!options.silent) {
                    setLoadingInitial(false);
                }
            }
        },
        [jobsLimit, jobsPage, router, statusFilter, tc.sessionExpired, tg.loadError]
    );

    useEffect(() => {
        if (isContextLoading) {
            return;
        }

        if (!organizationId || !cloudAccountId) {
            setLoadingInitial(false);
            return;
        }

        const prev = prevOrgCloudRef.current;
        const isContextChange = prev.organizationId !== organizationId || prev.cloudAccountId !== cloudAccountId;
        prevOrgCloudRef.current = { organizationId, cloudAccountId };

        if (isContextChange) {
            void loadData(organizationId, cloudAccountId, { page: jobsPage, limit: jobsLimit, status: statusFilter });
        } else {
            void loadData(organizationId, cloudAccountId, {
                tableOnly: true,
                page: jobsPage,
                limit: jobsLimit,
                status: statusFilter,
            });
        }
    }, [cloudAccountId, isContextLoading, jobsLimit, jobsPage, loadData, organizationId, statusFilter]);

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
                        toast.success(tg.scanComplete);
                        void loadData(orgId, cloudId, {
                            silent: true,
                            page: jobsPage,
                            limit: jobsLimit,
                            status: statusFilter,
                        });
                    } else {
                        toast.error(tg.scanFailed);
                    }
                }
            } catch {
                // ignore polling errors
            }
        },
        [jobsLimit, jobsPage, loadData, statusFilter, stopPolling, tg.scanComplete, tg.scanFailed]
    );

    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    // -- Actions ----------------------------------------------------------------

    const handleStartScan = async () => {
        if (!organizationId || !activeCloudAccount || !cloudAccountId) return;

        setScanning(true);

        try {
            const validationResponse = await fetchOrganizationCloudAccounts(organizationId);

            if (validationResponse.status === 401) {
                toast.error(tc.sessionExpired);
                router.replace('/auth/sign-in');
                router.refresh();
                setScanning(false);
                return;
            }

            if (!validationResponse.ok) {
                toast.error(tg.scanError);
                setScanning(false);
                return;
            }

            const validationPayload = await validationResponse.json().catch(() => null);
            const validationAccounts = normalizeCloudAccounts(validationPayload);
            const currentAccount = validationAccounts.find((account) => account.id === cloudAccountId) ?? null;

            if (!currentAccount) {
                setActiveCloudAccount(null);
                setCloudAccountId(null);
                setScore(null);
                setJobs([]);
                setJobsPagination(null);
                toast.error(tca.notFound);
                setScanning(false);
                return;
            }

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

            toast.success(tg.scanStarted);

            // Refresh job list
            await loadData(organizationId, cloudAccountId, {
                silent: true,
                page: jobsPage,
                limit: jobsLimit,
                status: statusFilter,
            });

            // Start polling
            stopPolling();
            pollingRef.current = setInterval(() => {
                void pollJobStatus(organizationId, cloudAccountId, jobId);
            }, 3000);
        } catch {
            toast.error(tg.scanError);
            setScanning(false);
        }
    };

    const handleRefresh = async () => {
        if (!organizationId || !cloudAccountId) return;
        setRefreshing(true);
        await loadData(organizationId, cloudAccountId, {
            silent: true,
            page: jobsPage,
            limit: jobsLimit,
            status: statusFilter,
        });
        setRefreshing(false);
    };

    const handleOpenAnalysis = (job: GovernanceJob) => {
        if (job.status !== 'completed') return;
        router.push(`/governance/analysis?jobId=${encodeURIComponent(job.id)}`);
    };

    const canRunScan = activeCloudAccount !== null && hasRequiredOrganizationRole(currentRole, 'ADMIN');
    const hasRunningJob = jobs.some((j) => j.status === 'pending' || j.status === 'running');

    // -- Empty state ------------------------------------------------------------

    if (!organizationId || !cloudAccountId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{tg.selectOrgTitle}</CardTitle>
                    <CardDescription>{tg.selectOrgDesc}</CardDescription>
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
                statusFilter={statusFilter}
                loadingTable={loadingTable}
                onStatusFilterChange={(status) => {
                    setStatusFilter(status);
                    setJobsPage(DEFAULT_JOBS_PAGE);
                    syncJobsUrlState(DEFAULT_JOBS_PAGE, jobsLimit, status);
                }}
                onClearFilters={() => {
                    setStatusFilter(JOB_STATUS_FILTER_ALL);
                    setJobsPage(DEFAULT_JOBS_PAGE);
                    syncJobsUrlState(DEFAULT_JOBS_PAGE, jobsLimit, JOB_STATUS_FILTER_ALL);
                }}
                onOpenAnalysis={handleOpenAnalysis}
                onChangeLimit={(limit) => {
                    const nextLimit = normalizeJobsLimit(limit);
                    setJobsLimit(nextLimit);
                    setJobsPage(DEFAULT_JOBS_PAGE);
                    syncJobsUrlState(DEFAULT_JOBS_PAGE, nextLimit, statusFilter);
                }}
                onGoFirst={() => {
                    setJobsPage(DEFAULT_JOBS_PAGE);
                    syncJobsUrlState(DEFAULT_JOBS_PAGE, jobsLimit, statusFilter);
                }}
                onGoPrevious={() => {
                    const nextPage = Math.max(jobsPage - 1, DEFAULT_JOBS_PAGE);
                    setJobsPage(nextPage);
                    syncJobsUrlState(nextPage, jobsLimit, statusFilter);
                }}
                onGoNext={() => {
                    const nextPage = jobsPage + 1;
                    setJobsPage(nextPage);
                    syncJobsUrlState(nextPage, jobsLimit, statusFilter);
                }}
                onGoLast={() => {
                    const nextPage = jobsPagination?.totalPages ?? DEFAULT_JOBS_PAGE;
                    setJobsPage(nextPage);
                    syncJobsUrlState(nextPage, jobsLimit, statusFilter);
                }}
            />
        </div>
    );
}
