'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FinopsJobsTable } from '@/components/root/finops/overview/finops-jobs-table';
import { DEFAULT_JOBS_LIMIT, DEFAULT_JOBS_PAGE, normalizeJobs, normalizeJobsLimit, normalizePagination } from '@/components/root/finops/overview/helpers';
import type { FinopsJob, PaginationMeta } from '@/components/root/finops/overview/types';
import { fetchFinopsJobs } from '@/app/actions/finops';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

export function FinopsSyncHistory() {
    const router = useRouter();

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [jobs, setJobs] = useState<FinopsJob[]>([]);
    const [jobsPagination, setJobsPagination] = useState<PaginationMeta | null>(null);
    const [jobsPage, setJobsPage] = useState(DEFAULT_JOBS_PAGE);
    const [jobsLimit, setJobsLimit] = useState(DEFAULT_JOBS_LIMIT);
    const [loadingTable, setLoadingTable] = useState(true);

    useEffect(() => {
        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const cloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
        setOrganizationId(orgId);
        setCloudAccountId(cloudId);
    }, []);

    const loadJobs = useCallback(
        async (orgId: string, cloudId: string, page: number, limit: number) => {
            setLoadingTable(true);
            try {
                const response = await fetchFinopsJobs(orgId, cloudId, page, limit);

                if (response.status === 401) {
                    toast.error('Sua sessão expirou.');
                    router.replace('/auth/sign-in');
                    return;
                }

                const payload = await response.json().catch(() => null);

                if (!response.ok) {
                    toast.error(extractErrorMessage(payload, 'pt'));
                    return;
                }

                setJobs(normalizeJobs(payload));
                setJobsPagination(normalizePagination(payload));
            } catch {
                toast.error('Não foi possível carregar o histórico de sincronizações.');
            } finally {
                setLoadingTable(false);
            }
        },
        [router]
    );

    useEffect(() => {
        if (!organizationId || !cloudAccountId) {
            setLoadingTable(false);
            return;
        }

        void loadJobs(organizationId, cloudAccountId, jobsPage, jobsLimit);
    }, [organizationId, cloudAccountId, jobsPage, jobsLimit, loadJobs]);

    if (!organizationId || !cloudAccountId) {
        return (
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Histórico de Sincronizações</p>
                    <p className="text-xs text-muted-foreground">Selecione uma organização e conta cloud na sidebar.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">Histórico completo de sincronizações</p>
                        <p className="text-xs text-muted-foreground">Acompanhe todas as execuções de coleta de custos</p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/finops">
                            <ArrowLeft className="size-4" />
                            Voltar
                        </Link>
                    </Button>
                </div>
            </div>

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
                }}
                onGoFirst={() => setJobsPage(DEFAULT_JOBS_PAGE)}
                onGoPrevious={() => setJobsPage((page) => Math.max(page - 1, DEFAULT_JOBS_PAGE))}
                onGoNext={() => setJobsPage((page) => page + 1)}
                onGoLast={() => setJobsPage(jobsPagination?.totalPages ?? DEFAULT_JOBS_PAGE)}
            />
        </div>
    );
}
