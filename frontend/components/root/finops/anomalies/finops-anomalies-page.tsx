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
import { toIntlLocale } from '@/lib/i18n/format';
import { useTranslations, type Translations } from '@/lib/i18n';

type FinopsT = Record<keyof Translations['finops'], string>;

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
    { value: 'last7days', labelKey: 'periodLast7days' },
    { value: 'currentmonth', labelKey: 'periodCurrentMonth' },
    { value: 'lastmonth', labelKey: 'periodLastMonth' },
    { value: 'last30days', labelKey: 'periodLast30days' },
    { value: 'last90days', labelKey: 'periodLast90days' },
    { value: 'last180days', labelKey: 'periodLast180days' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: keyof FinopsT }>;
type PeriodOption = (typeof PERIOD_OPTIONS)[number]['value'];

const DEFAULT_SORT = 'severity';
const SORT_OPTIONS = [
    { value: 'severity', labelKey: 'severity' },
    { value: 'cost', labelKey: 'sortCost' },
    { value: 'date', labelKey: 'sortDate' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: keyof FinopsT }>;
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

function contributorsEmptyMessage(anomaly: AnomalyRow, t: FinopsT): string {
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
        return t.contributorsTooOld.replace('{days}', String(age));
    }
    if (!hasInventoryCauses) {
        return t.contributorsMissingDetail;
    }
    return t.contributorsNone;
}

const SEVERITY_CONFIG = {
    critical: { labelKey: 'severityCritical', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    high: { labelKey: 'severityHigh', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    medium: { labelKey: 'severityMedium', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    low: { labelKey: 'severityLow', className: 'bg-muted text-muted-foreground' },
} as const satisfies Record<string, { labelKey: keyof FinopsT; className: string }>;

const STATUS_LABEL_KEYS = {
    open: 'statusOpen',
    acknowledged: 'statusAcknowledged',
    resolved: 'statusResolved',
    all: 'statusAll',
} as const satisfies Record<string, keyof FinopsT>;

function statusLabel(t: FinopsT, status: string): string {
    const key = STATUS_LABEL_KEYS[status as keyof typeof STATUS_LABEL_KEYS];
    return key ? t[key] : status;
}

function SeverityBadge({ severity, t }: { severity: string; t: FinopsT }) {
    const cfg = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.low;
    return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cfg.className)}>
            {t[cfg.labelKey]}
        </span>
    );
}

export function FinopsAnomaliesPage() {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');
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
                    toast.error(tCommon.sessionExpired);
                    router.replace('/auth/sign-in');
                    return;
                }
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    toast.error(extractErrorMessage(payload));
                    setData(null);
                    return;
                }
                setData(payload as AnomaliesListResponse);
            } catch {
                toast.error(t.loadAnomaliesError);
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
            t,
            tCommon,
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
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.acknowledgeSuccess);
            void loadAnomalies(organizationId, scopedAccountIds);
        } catch {
            toast.error(t.acknowledgeError);
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
                toast.error(extractErrorMessage(payload));
                setContributorsById((prev) => ({ ...prev, [anomaly.id]: [] }));
                return;
            }
            setContributorsById((prev) => ({
                ...prev,
                [anomaly.id]: Array.isArray(payload) ? (payload as AnomalyResourceContributor[]) : [],
            }));
        } catch {
            toast.error(t.resourcesLoadError);
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
                    <CardTitle>{t.subnavAnomalies}</CardTitle>
                    <CardDescription>{t.selectOrgSidebar}</CardDescription>
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
                        <h1 className="text-xl font-semibold tracking-tight">{t.anomaliesTitle}</h1>
                        <p className="text-sm text-muted-foreground">{t.anomaliesDesc}</p>
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
                        {tCommon.refresh}
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.statusOpen}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{totals?.open ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.anomaliesCriticalHigh}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">
                            {(totals?.critical ?? 0) + (totals?.high ?? 0)}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.statusAcknowledged}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{totals?.acknowledged ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.filteredResults}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{pagination?.totalItems ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card>
                <CardHeader className="gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle className="text-base">{t.filtersTitle}</CardTitle>
                            <CardDescription>{t.filtersUrlHint}</CardDescription>
                        </div>
                        {hasActiveFilters ? (
                            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={clearFilters}>
                                <RotateCcw className="size-3.5" />
                                {t.clearFilters}
                            </Button>
                        ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                            <label htmlFor="anomalies-cloud-account" className="text-xs font-medium text-muted-foreground">
                                {t.cloudAccountLabel}
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
                                    <SelectValue placeholder={t.selectAccountPlaceholder} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ACCOUNT_FILTER_ALL}>{t.allAccounts}</SelectItem>
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
                                {tCommon.status}
                            </label>
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => syncUrlState({ status: value, page: null })}
                            >
                                <SelectTrigger id="anomalies-status" className="w-full">
                                    <SelectValue placeholder={tCommon.status} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(['open', 'acknowledged', 'resolved', 'all'] as const).map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {statusLabel(t, s)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="anomalies-severity" className="text-xs font-medium text-muted-foreground">
                                {t.severity}
                            </label>
                            <Select
                                value={severityFilter}
                                onValueChange={(value) => syncUrlState({ severity: value, page: null })}
                            >
                                <SelectTrigger id="anomalies-severity" className="w-full">
                                    <SelectValue placeholder={t.severity} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t.allSeverities}</SelectItem>
                                    <SelectItem value="critical">{t.severityCritical}</SelectItem>
                                    <SelectItem value="high">{t.severityHigh}</SelectItem>
                                    <SelectItem value="medium">{t.severityMedium}</SelectItem>
                                    <SelectItem value="low">{t.severityLow}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="anomalies-period" className="text-xs font-medium text-muted-foreground">
                                {t.budgetPeriod}
                            </label>
                            <Select
                                value={periodFilter}
                                onValueChange={(value) => syncUrlState({ period: value, page: null })}
                            >
                                <SelectTrigger id="anomalies-period" className="w-full">
                                    <SelectValue placeholder={t.budgetPeriod} />
                                </SelectTrigger>
                                <SelectContent>
                                    {PERIOD_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {t[option.labelKey]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="anomalies-provider" className="text-xs font-medium text-muted-foreground">
                                {t.providerLabel}
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
                                    <SelectValue placeholder={t.providerLabel} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={PROVIDER_FILTER_ALL}>{t.allProviders}</SelectItem>
                                    <SelectItem value="aws">AWS</SelectItem>
                                    <SelectItem value="azure">Azure</SelectItem>
                                    <SelectItem value="gcp">GCP</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="anomalies-sort" className="text-xs font-medium text-muted-foreground">
                                {t.sortByLabel}
                            </label>
                            <Select
                                value={sortFilter}
                                onValueChange={(value) => syncUrlState({ sort: value, page: null })}
                            >
                                <SelectTrigger id="anomalies-sort" className="w-full">
                                    <SelectValue placeholder={t.sortPlaceholder} />
                                </SelectTrigger>
                                <SelectContent>
                                    {SORT_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {t[option.labelKey]}
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
                    <CardTitle className="text-base">{t.anomaliesListTitle}</CardTitle>
                    <CardDescription>
                        {pagination
                            ? t.resultsPageSummary
                                  .replace('{total}', String(pagination.totalItems))
                                  .replace('{page}', String(currentPage))
                                  .replace('{pages}', String(totalPages))
                            : tCommon.loading}
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
                            <p className="text-sm font-medium">{t.anomaliesEmptyTitle}</p>
                            <p className="text-xs text-muted-foreground">{t.anomaliesEmptyHint}</p>
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
                                                    <SeverityBadge severity={anomaly.severity} t={t} />
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] uppercase text-muted-foreground">
                                                        {anomaly.cloudProvider}
                                                    </span>
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                        {alias}
                                                    </span>
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground">
                                                        {statusLabel(t, anomaly.status)}
                                                    </span>
                                                </div>
                                                <p className="truncate text-sm font-medium">{anomaly.service}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {anomaly.region || t.globalRegion} ·{' '}
                                                    {new Date(anomaly.anomalyDate).toLocaleDateString(toIntlLocale())}
                                                    {anomaly.description ? ` · ${anomaly.description}` : ''}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                                                <div className="text-right text-xs">
                                                    <p className="text-muted-foreground">
                                                        {t.anomalyExpected.replace(
                                                            '{amount}',
                                                            formatCurrency(anomaly.expectedCost, anomaly.currency),
                                                        )}
                                                    </p>
                                                    <p className="font-semibold tabular-nums text-destructive">
                                                        {t.anomalyActual.replace(
                                                            '{amount}',
                                                            formatCurrency(anomaly.actualCost, anomaly.currency),
                                                        )}
                                                    </p>
                                                    <p className="tabular-nums text-destructive">
                                                        {t.anomalyDeviationImpact
                                                            .replace(
                                                                '{percent}',
                                                                Number(anomaly.deviationPercentage).toFixed(1),
                                                            )
                                                            .replace(
                                                                '{amount}',
                                                                formatCurrency(anomaly.financialImpact, anomaly.currency),
                                                            )}
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
                                                    {t.resourcesButton}
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
                                                        {t.acknowledgeShort}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        {expanded ? (
                                            <div className="mt-3 rounded-lg border bg-muted/20 px-3 py-3">
                                                {loadingContributors ? (
                                                    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                                                        <Loader2 className="size-4 animate-spin" />
                                                        {t.resourcesLoading}
                                                    </div>
                                                ) : !contributors || contributors.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground">
                                                        {contributorsEmptyMessage(anomaly, t)}
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
                                                                            {t.contributorDelta.replace(
                                                                                '{amount}',
                                                                                formatCurrency(row.delta, row.currency),
                                                                            )}
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
                                                                        {t.noConfigChange}
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
                                <span className="shrink-0 whitespace-nowrap">{tCommon.rowsPerPage}</span>
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
                                    {t.pageOfPages
                                        .replace('{page}', String(currentPage))
                                        .replace('{pages}', String(totalPages))}
                                </span>
                                <div className="flex items-center gap-1 self-start sm:self-auto">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={!hasPreviousPage || loading}
                                        onClick={() => syncUrlState({ page: 1 })}
                                        aria-label={t.firstPage}
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
                                        aria-label={t.previousPage}
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
                                        aria-label={t.nextPage}
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
                                        aria-label={t.lastPage}
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
