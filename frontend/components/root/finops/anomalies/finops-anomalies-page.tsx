'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ChevronsLeft,
    ChevronsRight,
    Loader2,
    RefreshCw,
    RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import {
    ACCOUNT_FILTER_ALL,
    PROVIDER_FILTER_ALL,
    parseFinopsUrlFilters,
} from '@/components/root/finops/finops-filter-utils';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import { formatResourceChange, shortResourceId } from '@/components/root/finops/overview/finops-resource-id';
import type { AnomalyResourceContributor, FinopsAnomaly } from '@/components/root/finops/overview/types';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import {
    acknowledgeFinopsAnomaly,
    fetchFinopsAnomalyContributors,
    fetchFinopsOrgAnomalies,
} from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { FinopsAnomalyAlertsCard } from '@/components/root/finops/anomalies/finops-anomaly-alerts-card';
import { cn } from '@/lib/utils';

type AnomalyRow = FinopsAnomaly & { cloudAccountId: string };

type AnomaliesListResponse = {
    items: AnomalyRow[];
    pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    totals: {
        open: number;
        acknowledged: number;
        resolved: number;
        critical: number;
        high: number;
    };
};

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 30] as const;
const DEFAULT_PERIOD = 'last7days';
const PERIOD_OPTIONS = [
    { value: 'last7days', label: 'Últimos 7 dias' },
    { value: 'currentmonth', label: 'Mês atual' },
    { value: 'lastmonth', label: 'Mês passado' },
    { value: 'last30days', label: 'Últimos 30 dias' },
    { value: 'last90days', label: 'Últimos 90 dias' },
    { value: 'last180days', label: 'Últimos 180 dias' },
] as const;
type PeriodOption = (typeof PERIOD_OPTIONS)[number]['value'];

const DEFAULT_SORT = 'severity';
const SORT_OPTIONS = [
    { value: 'severity', label: 'Severidade' },
    { value: 'cost', label: 'Custo (maior → menor)' },
    { value: 'date', label: 'Data (mais recente)' },
] as const;
type SortOption = (typeof SORT_OPTIONS)[number]['value'];

function isPeriodOption(value: string | null): value is PeriodOption {
    return PERIOD_OPTIONS.some((o) => o.value === value);
}

function isSortOption(value: string | null): value is SortOption {
    return SORT_OPTIONS.some((o) => o.value === value);
}

function daysSinceAnomaly(anomalyDate: string | Date): number {
    const raw = anomalyDate instanceof Date ? anomalyDate.toISOString() : String(anomalyDate);
    const day = raw.slice(0, 10);
    const target = new Date(`${day}T00:00:00Z`);
    const now = new Date();
    const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return Math.floor((utcToday.getTime() - target.getTime()) / 86_400_000);
}

function contributorsEmptyMessage(anomaly: AnomalyRow): string {
    const age = daysSinceAnomaly(anomaly.anomalyDate);
    const service = anomaly.service.toLowerCase();
    const hasInventoryCauses =
        service.includes('elastic compute') ||
        service.includes('ec2') ||
        service.includes('relational database') ||
        service.includes('rds') ||
        service.includes('virtual machines') ||
        service.includes('compute engine');

    if (age > 14) {
        return (
            `Não foi possível identificar o recurso desta anomalia. ` +
            `A AWS só disponibiliza o detalhe por recurso nos últimos 14 dias ` +
            `(esta anomalia tem ${age} dias). Esse histórico não pode ser recuperado depois.`
        );
    }
    if (!hasInventoryCauses) {
        return (
            `Não encontramos o detalhe por recurso neste dia. ` +
            `Execute um sync FinOps nos próximos dias enquanto a anomalia ainda estiver recente (até 14 dias). ` +
            `Em serviços como Lambda, o sistema mostra apenas o custo da função — não há evento de inventário ` +
            `(como troca de tipo de instância na EC2) para explicar a causa.`
        );
    }
    return 'Não encontramos recursos vinculados a esta anomalia.';
}

const SEVERITY_CONFIG = {
    critical: { label: 'Crítica', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    high: { label: 'Alta', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    medium: { label: 'Média', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    low: { label: 'Baixa', className: 'bg-muted text-muted-foreground' },
} as const;

const STATUS_LABELS: Record<string, string> = {
    open: 'Abertas',
    acknowledged: 'Reconhecidas',
    resolved: 'Resolvidas',
    all: 'Todas',
};

function SeverityBadge({ severity }: { severity: string }) {
    const cfg = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.low;
    return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cfg.className)}>
            {cfg.label}
        </span>
    );
}

export function FinopsAnomaliesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);

    const statusFilter = (searchParams.get('status') as 'open' | 'acknowledged' | 'resolved' | 'all' | null) ?? 'open';
    const severityRaw = (searchParams.get('severity') ?? 'all').trim().toLowerCase();
    const severityFilter = ['all', 'critical', 'high', 'medium', 'low'].includes(severityRaw)
        ? severityRaw
        : 'all';
    const periodParam = searchParams.get('period');
    const legacyDays = searchParams.get('days');
    const periodFilter: PeriodOption =
        isPeriodOption(periodParam) ? periodParam : legacyDays ? 'last90days' : DEFAULT_PERIOD;
    const sortParam = searchParams.get('sort');
    const sortFilter: SortOption = isSortOption(sortParam) ? sortParam : DEFAULT_SORT;
    const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const limitParam = Number.parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10);
    const pageSize = PAGE_SIZE_OPTIONS.includes(limitParam as (typeof PAGE_SIZE_OPTIONS)[number])
        ? limitParam
        : DEFAULT_PAGE_SIZE;

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const midOrgId = useActiveMidOrgId(organizationId);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [accountsReady, setAccountsReady] = useState(false);
    const [data, setData] = useState<AnomaliesListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [acknowledging, setAcknowledging] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [contributorsById, setContributorsById] = useState<Record<string, AnomalyResourceContributor[]>>({});
    const [loadingContributorsId, setLoadingContributorsId] = useState<string | null>(null);

    const scopedAccountIds = useMemo(() => cloudAccounts.map((account) => account.id), [cloudAccounts]);

    /** URL é a fonte da verdade — só faz patch dos campos informados. */
    const syncUrlState = useCallback(
        (
            next: Partial<{
                account: string | null;
                provider: string | null;
                status: string | null;
                severity: string | null;
                period: string | null;
                sort: string | null;
                page: number | null;
                limit: number | null;
            }>,
        ) => {
            const params = new URLSearchParams(searchParams.toString());

            if (next.account !== undefined) {
                if (!next.account || next.account === ACCOUNT_FILTER_ALL) params.delete('account');
                else params.set('account', next.account);
            }
            if (next.provider !== undefined) {
                if (!next.provider || next.provider === PROVIDER_FILTER_ALL) params.delete('provider');
                else params.set('provider', next.provider);
            }
            if (next.status !== undefined) {
                if (!next.status || next.status === 'open') params.delete('status');
                else params.set('status', next.status);
            }
            if (next.severity !== undefined) {
                if (!next.severity || next.severity === 'all') params.delete('severity');
                else params.set('severity', next.severity.toLowerCase());
            }
            if (next.period !== undefined) {
                if (!next.period || next.period === DEFAULT_PERIOD) params.delete('period');
                else params.set('period', next.period);
                // Migração: period substitui days
                params.delete('days');
            }
            if (next.sort !== undefined) {
                if (!next.sort || next.sort === DEFAULT_SORT) params.delete('sort');
                else params.set('sort', next.sort);
            }
            if (next.page !== undefined) {
                if (!next.page || next.page <= 1) params.delete('page');
                else params.set('page', String(next.page));
            }
            if (next.limit !== undefined) {
                if (!next.limit || next.limit === DEFAULT_PAGE_SIZE) params.delete('limit');
                else params.set('limit', String(next.limit));
            }

            // Migração: remove pageSize legado se ainda existir
            params.delete('pageSize');

            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    useEffect(() => {
        const syncOrg = () => setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        syncOrg();
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, syncOrg);
        window.addEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, syncOrg);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, syncOrg);
            window.removeEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, syncOrg);
        };
    }, []);

    const loadAccounts = useCallback(async (orgId: string, activeMidOrgId: string | null) => {
        setAccountsReady(false);
        try {
            const response = await fetchOrganizationCloudAccounts(orgId, {
                midOrgId: activeMidOrgId ?? getActiveMidOrgId(orgId),
            });
            if (!response.ok) {
                setCloudAccounts([]);
                return;
            }
            const payload = await response.json().catch(() => null);
            const items = Array.isArray(payload)
                ? payload
                : Array.isArray((payload as { items?: unknown })?.items)
                  ? (payload as { items: OrganizationCloudAccount[] }).items
                  : [];
            setCloudAccounts(
                items.filter((a) => {
                    const p = a.provider?.toLowerCase();
                    return p === 'aws' || p === 'azure' || p === 'gcp';
                }),
            );
        } catch {
            setCloudAccounts([]);
        } finally {
            setAccountsReady(true);
        }
    }, []);

    const loadAnomalies = useCallback(
        async (orgId: string, accountIds: string[]) => {
            setLoading(true);
            try {
                const selectedAccountId =
                    urlFilters.accountId && accountIds.includes(urlFilters.accountId)
                        ? urlFilters.accountId
                        : undefined;

                // Sem contas no escopo da mid-org → lista vazia (não vaza outras orgs).
                if (accountIds.length === 0) {
                    setData({
                        items: [],
                        pagination: {
                            page: 1,
                            limit: pageSize,
                            totalItems: 0,
                            totalPages: 0,
                            hasNextPage: false,
                            hasPreviousPage: false,
                        },
                        totals: { open: 0, acknowledged: 0, resolved: 0, critical: 0, high: 0 },
                    });
                    return;
                }

                const response = await fetchFinopsOrgAnomalies(orgId, {
                    status: statusFilter,
                    severity: severityFilter,
                    period: periodFilter,
                    sort: sortFilter,
                    cloudAccountId: selectedAccountId,
                    cloudAccountIds: selectedAccountId ? undefined : accountIds,
                    provider: urlFilters.provider ?? undefined,
                    page,
                    limit: pageSize,
                });
                if (response.status === 401) {
                    toast.error('Sessão expirada.');
                    router.replace('/auth/sign-in');
                    return;
                }
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    toast.error(extractErrorMessage(payload, 'pt'));
                    setData(null);
                    return;
                }
                setData(payload as AnomaliesListResponse);
            } catch {
                toast.error('Não foi possível carregar as anomalias.');
                setData(null);
            } finally {
                setLoading(false);
            }
        },
        [
            page,
            pageSize,
            periodFilter,
            router,
            severityFilter,
            sortFilter,
            statusFilter,
            urlFilters.accountId,
            urlFilters.provider,
        ],
    );

    useEffect(() => {
        if (!organizationId) {
            setLoading(false);
            setAccountsReady(false);
            setCloudAccounts([]);
            return;
        }
        void loadAccounts(organizationId, midOrgId);
    }, [organizationId, midOrgId, loadAccounts]);

    useEffect(() => {
        if (!organizationId || !accountsReady) {
            if (!organizationId) setLoading(false);
            return;
        }
        // Conta da URL fora do escopo mid-org → limpa filtro
        if (urlFilters.accountId && !scopedAccountIds.includes(urlFilters.accountId)) {
            syncUrlState({ account: null, page: null });
            return;
        }
        void loadAnomalies(organizationId, scopedAccountIds);
    }, [
        organizationId,
        accountsReady,
        scopedAccountIds,
        loadAnomalies,
        urlFilters.accountId,
        syncUrlState,
    ]);

    const accountAliases = useMemo(() => {
        const map: Record<string, string> = {};
        for (const account of cloudAccounts) map[account.id] = account.alias;
        return map;
    }, [cloudAccounts]);

    const handleAcknowledge = async (anomaly: AnomalyRow) => {
        if (!organizationId) return;
        setAcknowledging(anomaly.id);
        try {
            const response = await acknowledgeFinopsAnomaly(organizationId, anomaly.cloudAccountId, anomaly.id);
            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }
            toast.success('Anomalia reconhecida.');
            void loadAnomalies(organizationId, scopedAccountIds);
        } catch {
            toast.error('Não foi possível reconhecer a anomalia.');
        } finally {
            setAcknowledging(null);
        }
    };

    const toggleContributors = async (anomaly: AnomalyRow) => {
        if (!organizationId) return;
        if (expandedId === anomaly.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(anomaly.id);
        if (contributorsById[anomaly.id]) return;

        setLoadingContributorsId(anomaly.id);
        try {
            const response = await fetchFinopsAnomalyContributors(
                organizationId,
                anomaly.cloudAccountId,
                anomaly.id,
                10,
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                setContributorsById((prev) => ({ ...prev, [anomaly.id]: [] }));
                return;
            }
            setContributorsById((prev) => ({
                ...prev,
                [anomaly.id]: Array.isArray(payload) ? (payload as AnomalyResourceContributor[]) : [],
            }));
        } catch {
            toast.error('Não foi possível carregar os recursos.');
            setContributorsById((prev) => ({ ...prev, [anomaly.id]: [] }));
        } finally {
            setLoadingContributorsId(null);
        }
    };

    const pagination = data?.pagination;
    const totals = data?.totals;
    const items = data?.items ?? [];
    // Página vem sempre da URL; totalPages da resposta do backend.
    const totalPages = Math.max(1, pagination?.totalPages ?? 1);
    const currentPage = page;
    const hasPreviousPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Anomalias</CardTitle>
                    <CardDescription>Selecione uma organização na sidebar.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (loading && !data) {
        return <FinopsLoadingSkeleton />;
    }

    const hasActiveFilters =
        Boolean(urlFilters.accountId) ||
        Boolean(urlFilters.provider) ||
        statusFilter !== 'open' ||
        severityFilter !== 'all' ||
        periodFilter !== DEFAULT_PERIOD ||
        sortFilter !== DEFAULT_SORT;

    const clearFilters = () => {
        syncUrlState({
            account: null,
            provider: null,
            status: 'open',
            severity: 'all',
            period: DEFAULT_PERIOD,
            sort: DEFAULT_SORT,
            page: null,
        });
    };

    return (
        <div className="flex flex-col gap-6 pb-24">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Anomalias de custo</h1>
                        <p className="text-sm text-muted-foreground">
                            Desvios detectados por serviço — filtre, pagine e investigue o recurso que causou o spike.
                        </p>
                    </div>
                    <FinopsSubnav />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <FinopsAnomalyAlertsCard organizationId={organizationId} />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            organizationId && accountsReady && void loadAnomalies(organizationId, scopedAccountIds)
                        }
                        disabled={loading || !accountsReady}
                    >
                        <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                        Atualizar
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Abertas</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{totals?.open ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Críticas / altas</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">
                            {(totals?.critical ?? 0) + (totals?.high ?? 0)}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Reconhecidas</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{totals?.acknowledged ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Resultados filtrados</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{pagination?.totalItems ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card>
                <CardHeader className="gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle className="text-base">Filtros</CardTitle>
                            <CardDescription>Persistidos na URL — compartilháveis e com histórico</CardDescription>
                        </div>
                        {hasActiveFilters ? (
                            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={clearFilters}>
                                <RotateCcw className="size-3.5" />
                                Limpar filtros
                            </Button>
                        ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                            <label htmlFor="anomalies-cloud-account" className="text-xs font-medium text-muted-foreground">
                                Cloud account
                            </label>
                            <Select
                                value={
                                    urlFilters.accountId && scopedAccountIds.includes(urlFilters.accountId)
                                        ? urlFilters.accountId
                                        : ACCOUNT_FILTER_ALL
                                }
                                onValueChange={(value) => {
                                    if (value !== ACCOUNT_FILTER_ALL) {
                                        window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, value);
                                    }
                                    syncUrlState({
                                        account: value === ACCOUNT_FILTER_ALL ? null : value,
                                        page: null,
                                    });
                                }}
                                disabled={!accountsReady}
                            >
                                <SelectTrigger id="anomalies-cloud-account" className="w-full">
                                    <SelectValue placeholder="Selecione a conta" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ACCOUNT_FILTER_ALL}>Todas as contas</SelectItem>
                                    {cloudAccounts.map((account) => (
                                        <SelectItem key={account.id} value={account.id}>
                                            {account.alias}
                                            {account.provider ? ` · ${account.provider.toUpperCase()}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="anomalies-status" className="text-xs font-medium text-muted-foreground">
                                Status
                            </label>
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => syncUrlState({ status: value, page: null })}
                            >
                                <SelectTrigger id="anomalies-status" className="w-full">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(['open', 'acknowledged', 'resolved', 'all'] as const).map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {STATUS_LABELS[s]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="anomalies-severity" className="text-xs font-medium text-muted-foreground">
                                Severidade
                            </label>
                            <Select
                                value={severityFilter}
                                onValueChange={(value) => syncUrlState({ severity: value, page: null })}
                            >
                                <SelectTrigger id="anomalies-severity" className="w-full">
                                    <SelectValue placeholder="Severidade" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas severidades</SelectItem>
                                    <SelectItem value="critical">Crítica</SelectItem>
                                    <SelectItem value="high">Alta</SelectItem>
                                    <SelectItem value="medium">Média</SelectItem>
                                    <SelectItem value="low">Baixa</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="anomalies-period" className="text-xs font-medium text-muted-foreground">
                                Período
                            </label>
                            <Select
                                value={periodFilter}
                                onValueChange={(value) => syncUrlState({ period: value, page: null })}
                            >
                                <SelectTrigger id="anomalies-period" className="w-full">
                                    <SelectValue placeholder="Período" />
                                </SelectTrigger>
                                <SelectContent>
                                    {PERIOD_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="anomalies-provider" className="text-xs font-medium text-muted-foreground">
                                Provedor
                            </label>
                            <Select
                                value={urlFilters.provider ?? PROVIDER_FILTER_ALL}
                                onValueChange={(value) =>
                                    syncUrlState({
                                        provider: value === PROVIDER_FILTER_ALL ? null : value,
                                        page: null,
                                    })
                                }
                            >
                                <SelectTrigger id="anomalies-provider" className="w-full">
                                    <SelectValue placeholder="Provedor" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={PROVIDER_FILTER_ALL}>Todos provedores</SelectItem>
                                    <SelectItem value="aws">AWS</SelectItem>
                                    <SelectItem value="azure">Azure</SelectItem>
                                    <SelectItem value="gcp">GCP</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="anomalies-sort" className="text-xs font-medium text-muted-foreground">
                                Ordenar por
                            </label>
                            <Select
                                value={sortFilter}
                                onValueChange={(value) => syncUrlState({ sort: value, page: null })}
                            >
                                <SelectTrigger id="anomalies-sort" className="w-full">
                                    <SelectValue placeholder="Ordenação" />
                                </SelectTrigger>
                                <SelectContent>
                                    {SORT_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Lista de anomalias</CardTitle>
                    <CardDescription>
                        {pagination
                            ? `${pagination.totalItems} resultado(s) · página ${currentPage} de ${totalPages}`
                            : 'Carregando…'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {loading && items.length === 0 ? (
                        <div className="divide-y">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-3">
                                    <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                                    <div className="flex-1 space-y-1.5">
                                        <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
                                        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                            <p className="text-sm font-medium">Nenhuma anomalia encontrada</p>
                            <p className="text-xs text-muted-foreground">
                                Ajuste os filtros ou aguarde o próximo sync diário FinOps.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {items.map((anomaly) => {
                                const expanded = expandedId === anomaly.id;
                                const contributors = contributorsById[anomaly.id];
                                const loadingContributors = loadingContributorsId === anomaly.id;
                                const alias =
                                    accountAliases[anomaly.cloudAccountId] ?? anomaly.cloudAccountId.slice(0, 8);

                                return (
                                    <div key={anomaly.id} className="px-4 py-3">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <AlertTriangle className="size-4 text-amber-500" />
                                                    <SeverityBadge severity={anomaly.severity} />
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] uppercase text-muted-foreground">
                                                        {anomaly.cloudProvider}
                                                    </span>
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                        {alias}
                                                    </span>
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground">
                                                        {STATUS_LABELS[anomaly.status] ?? anomaly.status}
                                                    </span>
                                                </div>
                                                <p className="truncate text-sm font-medium">{anomaly.service}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {anomaly.region || 'global'} ·{' '}
                                                    {new Date(anomaly.anomalyDate).toLocaleDateString('pt-BR')}
                                                    {anomaly.description ? ` · ${anomaly.description}` : ''}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                                                <div className="text-right text-xs">
                                                    <p className="text-muted-foreground">
                                                        Esperado {formatCurrency(anomaly.expectedCost, anomaly.currency)}
                                                    </p>
                                                    <p className="font-semibold tabular-nums text-destructive">
                                                        Real {formatCurrency(anomaly.actualCost, anomaly.currency)}
                                                    </p>
                                                    <p className="tabular-nums text-destructive">
                                                        +{Number(anomaly.deviationPercentage).toFixed(1)}% · impacto{' '}
                                                        {formatCurrency(anomaly.financialImpact, anomaly.currency)}
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8"
                                                    onClick={() => void toggleContributors(anomaly)}
                                                >
                                                    {expanded ? (
                                                        <ChevronUp className="size-4" />
                                                    ) : (
                                                        <ChevronDown className="size-4" />
                                                    )}
                                                    Recursos
                                                </Button>
                                                {anomaly.status === 'open' && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8"
                                                        isLoading={acknowledging === anomaly.id}
                                                        disabled={acknowledging !== null}
                                                        onClick={() => void handleAcknowledge(anomaly)}
                                                    >
                                                        OK
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        {expanded ? (
                                            <div className="mt-3 rounded-lg border bg-muted/20 px-3 py-3">
                                                {loadingContributors ? (
                                                    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                                                        <Loader2 className="size-4 animate-spin" />
                                                        Carregando recursos…
                                                    </div>
                                                ) : !contributors || contributors.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground">
                                                        {contributorsEmptyMessage(anomaly)}
                                                    </p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {contributors.map((row) => (
                                                            <div
                                                                key={row.resourceId}
                                                                className="rounded-md border bg-background px-3 py-2"
                                                            >
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <div className="min-w-0">
                                                                        <p
                                                                            className="truncate font-mono text-xs font-medium"
                                                                            title={row.resourceId}
                                                                        >
                                                                            {shortResourceId(row.resourceId)}
                                                                        </p>
                                                                        <p className="text-[11px] text-muted-foreground">
                                                                            delta{' '}
                                                                            {formatCurrency(row.delta, row.currency)}
                                                                        </p>
                                                                    </div>
                                                                    <p className="text-xs font-semibold tabular-nums">
                                                                        {formatCurrency(
                                                                            row.costOnAnomalyDate,
                                                                            row.currency,
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                {row.causes[0] ? (
                                                                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                                                                        {formatResourceChange(
                                                                            row.causes[0].field,
                                                                            row.causes[0].previousValue,
                                                                            row.causes[0].newValue,
                                                                        )}
                                                                    </p>
                                                                ) : (
                                                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                                                        Sem mudança de configuração no período
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {pagination && pagination.totalItems > 0 ? (
                        <div className="flex flex-col gap-4 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-8 sm:pr-32 md:pr-36">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                                <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                                <Select
                                    value={String(pageSize)}
                                    onValueChange={(value) => syncUrlState({ limit: Number(value), page: null })}
                                >
                                    <SelectTrigger className="h-8 min-w-22">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAGE_SIZE_OPTIONS.map((size) => (
                                            <SelectItem key={size} value={String(size)}>
                                                {size}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                <span className="text-sm font-medium">
                                    Página {currentPage} de {totalPages}
                                </span>
                                <div className="flex items-center gap-1 self-start sm:self-auto">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={!hasPreviousPage || loading}
                                        onClick={() => syncUrlState({ page: 1 })}
                                        aria-label="Primeira página"
                                    >
                                        <ChevronsLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={!hasPreviousPage || loading}
                                        onClick={() => syncUrlState({ page: Math.max(1, currentPage - 1) })}
                                        aria-label="Página anterior"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={!hasNextPage || loading}
                                        onClick={() => syncUrlState({ page: currentPage + 1 })}
                                        aria-label="Próxima página"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={!hasNextPage || loading}
                                        onClick={() => syncUrlState({ page: totalPages })}
                                        aria-label="Última página"
                                    >
                                        <ChevronsRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
