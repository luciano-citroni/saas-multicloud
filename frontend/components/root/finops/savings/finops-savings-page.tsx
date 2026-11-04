'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Lightbulb,
    PiggyBank,
    RefreshCw,
    RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import {
    ACCOUNT_FILTER_ALL,
    PROVIDER_FILTER_ALL,
    parseFinopsUrlFilters,
} from '@/components/root/finops/finops-filter-utils';
import { formatCurrency, priorityColor, priorityLabel } from '@/components/root/finops/overview/helpers';
import { shortResourceId } from '@/components/root/finops/overview/finops-resource-id';
import type { FinopsRecommendation } from '@/components/root/finops/overview/types';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import { fetchFinopsOrgSavings } from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { cn } from '@/lib/utils';

type SavingsRow = FinopsRecommendation & { cloudAccountId: string };

type SavingsListResponse = {
    items: SavingsRow[];
    pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    totals: {
        potentialSavings: number;
        currency: string;
        open: number;
        high: number;
        medium: number;
        low: number;
    };
};

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 30] as const;
const DEFAULT_SORT = 'saving';
const SORT_OPTIONS = [
    { value: 'saving', label: 'Economia (maior → menor)' },
    { value: 'priority', label: 'Prioridade' },
    { value: 'date', label: 'Data (mais recente)' },
] as const;
type SortOption = (typeof SORT_OPTIONS)[number]['value'];

const PRIORITY_BADGE = {
    high: { label: 'Alta', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    medium: { label: 'Média', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    low: { label: 'Baixa', className: 'bg-muted text-muted-foreground' },
} as const;

function isSortOption(value: string | null): value is SortOption {
    return SORT_OPTIONS.some((o) => o.value === value);
}

function PriorityBadge({ priority }: { priority: string }) {
    const cfg = PRIORITY_BADGE[priority as keyof typeof PRIORITY_BADGE] ?? PRIORITY_BADGE.low;
    return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cfg.className)}>
            {cfg.label}
        </span>
    );
}

export function FinopsSavingsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);

    const statusFilter = (searchParams.get('status') as 'open' | 'dismissed' | 'resolved' | 'all' | null) ?? 'open';
    const priorityRaw = (searchParams.get('priority') ?? 'all').trim().toLowerCase();
    const priorityFilter = ['all', 'high', 'medium', 'low'].includes(priorityRaw) ? priorityRaw : 'all';
    const sortParam = searchParams.get('sort');
    const sortFilter: SortOption = isSortOption(sortParam) ? sortParam : DEFAULT_SORT;
    const qFilter = searchParams.get('q') ?? '';
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
    const [data, setData] = useState<SavingsListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchDraft, setSearchDraft] = useState(qFilter);

    const scopedAccountIds = useMemo(() => cloudAccounts.map((account) => account.id), [cloudAccounts]);

    const syncUrlState = useCallback(
        (
            next: Partial<{
                account: string | null;
                provider: string | null;
                status: string | null;
                priority: string | null;
                sort: string | null;
                q: string | null;
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
            if (next.priority !== undefined) {
                if (!next.priority || next.priority === 'all') params.delete('priority');
                else params.set('priority', next.priority.toLowerCase());
            }
            if (next.sort !== undefined) {
                if (!next.sort || next.sort === DEFAULT_SORT) params.delete('sort');
                else params.set('sort', next.sort);
            }
            if (next.q !== undefined) {
                const value = next.q?.trim() ?? '';
                if (!value) params.delete('q');
                else params.set('q', value);
            }
            if (next.page !== undefined) {
                if (!next.page || next.page <= 1) params.delete('page');
                else params.set('page', String(next.page));
            }
            if (next.limit !== undefined) {
                if (!next.limit || next.limit === DEFAULT_PAGE_SIZE) params.delete('limit');
                else params.set('limit', String(next.limit));
            }

            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    useEffect(() => {
        setSearchDraft(qFilter);
    }, [qFilter]);

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

    const loadSavings = useCallback(
        async (orgId: string, accountIds: string[]) => {
            setLoading(true);
            try {
                const selectedAccountId =
                    urlFilters.accountId && accountIds.includes(urlFilters.accountId)
                        ? urlFilters.accountId
                        : undefined;

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
                        totals: { potentialSavings: 0, currency: 'USD', open: 0, high: 0, medium: 0, low: 0 },
                    });
                    return;
                }

                const response = await fetchFinopsOrgSavings(orgId, {
                    status: statusFilter,
                    priority: priorityFilter,
                    sort: sortFilter,
                    q: qFilter || undefined,
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
                setData(payload as SavingsListResponse);
            } catch {
                toast.error('Não foi possível carregar a economia potencial.');
                setData(null);
            } finally {
                setLoading(false);
            }
        },
        [
            page,
            pageSize,
            priorityFilter,
            qFilter,
            router,
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
        if (urlFilters.accountId && !scopedAccountIds.includes(urlFilters.accountId)) {
            syncUrlState({ account: null, page: null });
            return;
        }
        void loadSavings(organizationId, scopedAccountIds);
    }, [
        organizationId,
        accountsReady,
        scopedAccountIds,
        loadSavings,
        urlFilters.accountId,
        syncUrlState,
    ]);

    const accountAliases = useMemo(() => {
        const map: Record<string, string> = {};
        for (const account of cloudAccounts) map[account.id] = account.alias;
        return map;
    }, [cloudAccounts]);

    const pagination = data?.pagination;
    const totals = data?.totals;
    const items = data?.items ?? [];
    const totalPages = Math.max(1, pagination?.totalPages ?? 1);
    const currentPage = page;
    const hasPreviousPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;
    const currency = totals?.currency ?? 'USD';

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Economia potencial</CardTitle>
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
        priorityFilter !== 'all' ||
        sortFilter !== DEFAULT_SORT ||
        Boolean(qFilter);

    const clearFilters = () => {
        setSearchDraft('');
        syncUrlState({
            account: null,
            provider: null,
            status: 'open',
            priority: 'all',
            sort: DEFAULT_SORT,
            q: null,
            page: null,
        });
    };

    const applySearch = () => {
        syncUrlState({ q: searchDraft.trim() || null, page: null });
    };

    return (
        <div className="flex flex-col gap-6 pb-24">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Economia potencial</h1>
                        <p className="text-sm text-muted-foreground">
                            Recursos otimizáveis com estimativa aproximada de economia mensal.
                        </p>
                    </div>
                    <FinopsSubnav />
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        organizationId && accountsReady && void loadSavings(organizationId, scopedAccountIds)
                    }
                    disabled={loading || !accountsReady}
                >
                    <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                    Atualizar
                </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1.5">
                            <PiggyBank className="size-3.5" />
                            Economia estimada
                        </CardDescription>
                        <CardTitle className="text-2xl tabular-nums text-emerald-600">
                            {formatCurrency(totals?.potentialSavings ?? 0, currency)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Soma das recomendações abertas</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1.5">
                            <Lightbulb className="size-3.5" />
                            Oportunidades abertas
                        </CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{totals?.open ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Prioridade alta</CardDescription>
                        <CardTitle className={cn('text-2xl tabular-nums', priorityColor('high'))}>
                            {totals?.high ?? 0}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            Média {totals?.medium ?? 0} · Baixa {totals?.low ?? 0}
                        </p>
                    </CardContent>
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
                            <label htmlFor="savings-cloud-account" className="text-xs font-medium text-muted-foreground">
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
                                <SelectTrigger id="savings-cloud-account" className="w-full">
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
                            <label htmlFor="savings-status" className="text-xs font-medium text-muted-foreground">
                                Status
                            </label>
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => syncUrlState({ status: value, page: null })}
                            >
                                <SelectTrigger id="savings-status" className="w-full">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="open">Abertas</SelectItem>
                                    <SelectItem value="dismissed">Descartadas</SelectItem>
                                    <SelectItem value="resolved">Resolvidas</SelectItem>
                                    <SelectItem value="all">Todas</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="savings-priority" className="text-xs font-medium text-muted-foreground">
                                Prioridade
                            </label>
                            <Select
                                value={priorityFilter}
                                onValueChange={(value) => syncUrlState({ priority: value, page: null })}
                            >
                                <SelectTrigger id="savings-priority" className="w-full">
                                    <SelectValue placeholder="Prioridade" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas prioridades</SelectItem>
                                    <SelectItem value="high">Alta</SelectItem>
                                    <SelectItem value="medium">Média</SelectItem>
                                    <SelectItem value="low">Baixa</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="savings-provider" className="text-xs font-medium text-muted-foreground">
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
                                <SelectTrigger id="savings-provider" className="w-full">
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
                            <label htmlFor="savings-sort" className="text-xs font-medium text-muted-foreground">
                                Ordenar por
                            </label>
                            <Select
                                value={sortFilter}
                                onValueChange={(value) => syncUrlState({ sort: value, page: null })}
                            >
                                <SelectTrigger id="savings-sort" className="w-full">
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

                        <div className="space-y-1.5 sm:col-span-2 xl:col-span-1">
                            <label htmlFor="savings-q" className="text-xs font-medium text-muted-foreground">
                                Buscar recurso
                            </label>
                            <form
                                className="flex gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    applySearch();
                                }}
                            >
                                <Input
                                    id="savings-q"
                                    value={searchDraft}
                                    onChange={(event) => setSearchDraft(event.target.value)}
                                    placeholder="ID, tipo ou descrição…"
                                    className="h-9"
                                />
                                <Button type="submit" variant="outline" size="sm" className="h-9 shrink-0">
                                    Buscar
                                </Button>
                            </form>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Recursos com economia potencial</CardTitle>
                    <CardDescription>
                        {pagination
                            ? `${pagination.totalItems} resultado(s) · página ${currentPage} de ${totalPages}`
                            : 'Carregando…'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {loading && items.length === 0 ? (
                        <div className="space-y-2 px-4 py-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                            <p className="text-sm font-medium">Nenhuma oportunidade encontrada</p>
                            <p className="text-xs text-muted-foreground">
                                Ajuste os filtros ou sincronize o FinOps para gerar recomendações.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="px-4">Prioridade</TableHead>
                                        <TableHead className="px-4">Recurso</TableHead>
                                        <TableHead className="hidden px-4 md:table-cell">Ação recomendada</TableHead>
                                        <TableHead className="hidden px-4 lg:table-cell">Conta</TableHead>
                                        <TableHead className="px-4 text-right">Economia/mês</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((rec) => {
                                        const alias =
                                            accountAliases[rec.cloudAccountId] ?? rec.cloudAccountId.slice(0, 8);
                                        return (
                                            <TableRow key={rec.id}>
                                                <TableCell className="px-4">
                                                    <PriorityBadge priority={rec.priority} />
                                                </TableCell>
                                                <TableCell className="px-4">
                                                    <div className="min-w-0 space-y-0.5">
                                                        <p className="truncate text-sm font-medium">{rec.resourceType}</p>
                                                        <p
                                                            className="truncate font-mono text-xs text-muted-foreground"
                                                            title={rec.resourceId}
                                                        >
                                                            {shortResourceId(rec.resourceId)}
                                                        </p>
                                                        <p className="line-clamp-2 text-[11px] text-muted-foreground md:hidden">
                                                            {rec.recommendation || rec.description}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden px-4 md:table-cell">
                                                    <div className="min-w-0 space-y-0.5">
                                                        <p className="line-clamp-2 text-sm">{rec.recommendation}</p>
                                                        <p className="line-clamp-1 text-xs text-muted-foreground">
                                                            {rec.description}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden px-4 lg:table-cell">
                                                    <div className="space-y-0.5">
                                                        <p className="truncate text-sm">{alias}</p>
                                                        <p className="text-[11px] uppercase text-muted-foreground">
                                                            {rec.cloudProvider}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 text-right">
                                                    {rec.potentialSaving != null ? (
                                                        <p className="text-sm font-semibold tabular-nums text-emerald-600">
                                                            {formatCurrency(rec.potentialSaving, rec.currency)}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-muted-foreground">sem estimativa</p>
                                                    )}
                                                    <p className="text-[11px] text-muted-foreground lg:hidden">
                                                        {alias} · {rec.cloudProvider}
                                                    </p>
                                                    <span className="sr-only">{priorityLabel(rec.priority)}</span>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {pagination && pagination.totalItems > 0 ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                        <Select
                            value={`${pageSize}`}
                            onValueChange={(value) =>
                                syncUrlState({ limit: Number(value), page: null })
                            }
                        >
                            <SelectTrigger className="h-8 min-w-22">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PAGE_SIZE_OPTIONS.map((size) => (
                                    <SelectItem key={size} value={`${size}`}>
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
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => syncUrlState({ page: 1 })}
                                disabled={!hasPreviousPage}
                            >
                                <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => syncUrlState({ page: Math.max(currentPage - 1, 1) })}
                                disabled={!hasPreviousPage}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => syncUrlState({ page: Math.min(currentPage + 1, totalPages) })}
                                disabled={!hasNextPage}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => syncUrlState({ page: totalPages })}
                                disabled={!hasNextPage}
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
