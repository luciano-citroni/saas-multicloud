'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Pencil,
    Plus,
    RefreshCw,
    RotateCcw,
    Target,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { AiBudgetCreateDialog } from '@/components/root/finops/ai-budget-create-dialog';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { MobileFiltersDrawer } from '@/components/root/layout';
import { buildFinopsQuery, parseFinopsUrlFilters } from '@/components/root/finops/finops-filter-utils';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { NotificationGroupOption } from '@/components/root/finops/finops-budget-form';
import {
    countBudgetsAtRisk,
    formatBudgetSpendPeriodLabel,
    getBudgetEffectiveLimit,
    getBudgetRiskState,
    hasNoSpendInBudgetPeriod,
    pickHighestRiskBudget,
    type FinopsBudgetStatusItem,
} from '@/components/root/finops/finops-budget-types';
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
    deleteAiFinopsBudget,
    fetchAiFinopsBudgetStatus,
    fetchAiFinopsBudgets,
    fetchAiFinopsConnections,
    fetchAiFinopsCostUsers,
} from '@/app/actions/ai-finops';
import {
    deleteFinopsBudgetUnified,
    fetchFinopsBudgetStatuses,
    fetchOrganizationBudgetStatuses,
    fetchOrganizationFinopsBudgetStatuses,
} from '@/app/actions/finops';
import { fetchNotificationGroups } from '@/app/actions/notifications';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { cn } from '@/lib/utils';
import { useTranslations, type Translations } from '@/lib/i18n';

export type { FinopsBudgetStatusItem };

type FinopsT = Record<keyof Translations['finops'], string>;

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const ORG_SCOPE_VALUE = 'organization';
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 30] as const;
type BudgetViewPeriod = 'daily' | 'monthly' | 'all';
type BudgetKind = 'all' | 'cloud' | 'ai';

type AiBudgetRow = {
    id: string;
    name: string;
    scopeType: string;
    scopeId: string | null;
    budgetAmount: string | number;
    currency: string;
    period: string;
    alertThresholds?: number[];
    alertChannels?: string[];
    status?: string;
};

type AiConnectionOption = { id: string; name: string; providerSlug: string };
type AiCostUserOption = { externalId: string; label: string };
type AiBudgetStatus = { percent?: number; spentOfficial?: number; thresholdsHit?: number[] };

type UnifiedBudgetItem = {
    key: string;
    kind: 'cloud' | 'ai';
    id: string;
    name: string;
    period: string;
    currency: string;
    limit: number;
    spent: number;
    percent: number;
    remaining: number | null;
    channels: string[];
    thresholds: number[];
    triggered: number[];
    scopeLabel: string;
    cloudItem?: FinopsBudgetStatusItem;
    aiBudget?: AiBudgetRow;
};

function parseBudgetKind(value: string | null): BudgetKind {
    if (value === 'cloud' || value === 'ai' || value === 'all') return value;
    return 'all';
}

function asArray<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
        return (payload as { items: T[] }).items;
    }
    return [];
}

function normalizeBudgetStatusesPayload(payload: unknown): FinopsBudgetStatusItem[] {
    if (Array.isArray(payload)) return payload as FinopsBudgetStatusItem[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
        return (payload as { items: FinopsBudgetStatusItem[] }).items;
    }
    return [];
}

function normalizeNotificationGroupsPayload(
    payload: unknown,
    fallbackName: string
): NotificationGroupOption[] {
    const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown } | null)?.items)
          ? ((payload as { items: unknown[] }).items)
          : [];

    return items
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item): NotificationGroupOption => ({
            id: String(item.id ?? ''),
            name: String(item.name ?? fallbackName),
            channel: item.channel === 'whatsapp' ? 'whatsapp' : 'email',
            isActive: item.isActive !== false,
        }))
        .filter((item) => Boolean(item.id));
}

function usageTone(percentage: number, triggered: number[]): 'ok' | 'warn' | 'critical' {
    if (triggered.some((t) => t >= 100) || percentage >= 100) return 'critical';
    if (triggered.length > 0 || percentage >= 80) return 'warn';
    return 'ok';
}

function periodLabel(t: FinopsT, period: string) {
    return period === 'daily' ? t.daily : t.monthly;
}

function alertFrequencyLabel(t: FinopsT, frequency: string) {
    return frequency === 'daily' ? t.budgetFreqDaily : t.monthly.toLowerCase();
}

function alertTypeLabel(t: FinopsT, type: string | undefined) {
    if (type === 'amount') return t.budgetAlertTypeAmount;
    if (type === 'resource') return t.budgetAlertTypeResource;
    return t.budgetAlertTypePercentage;
}

function BudgetUsageBar({
    percentage,
    thresholds,
}: {
    percentage: number;
    thresholds: number[];
}) {
    const capped = Math.min(Math.max(percentage, 0), 100);
    const tone = usageTone(percentage, thresholds.filter((t) => percentage >= t));
    const barClass =
        tone === 'critical' ? 'bg-destructive' : tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn('absolute inset-y-0 left-0 rounded-full transition-all', barClass)} style={{ width: `${capped}%` }} />
            {thresholds.map((threshold) => (
                <div
                    key={threshold}
                    className="absolute inset-y-0 w-px bg-foreground/40"
                    style={{ left: `${Math.min(Math.max(threshold, 0), 100)}%` }}
                    title={`${threshold}%`}
                />
            ))}
        </div>
    );
}

export function FinopsBudgets() {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);
    const scopeFilter = searchParams.get('account') === ORG_SCOPE_VALUE ? ORG_SCOPE_VALUE : urlFilters.accountId;
    const budgetKind = parseBudgetKind(searchParams.get('kind'));
    const viewPeriod: BudgetViewPeriod =
        searchParams.get('view') === 'daily'
            ? 'daily'
            : searchParams.get('view') === 'monthly'
              ? 'monthly'
              : 'all';
    const showCloud = budgetKind === 'all' || budgetKind === 'cloud';
    const showAi = budgetKind === 'all' || budgetKind === 'ai';

    const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const limitParam = Number.parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10);
    const pageSize = PAGE_SIZE_OPTIONS.includes(limitParam as (typeof PAGE_SIZE_OPTIONS)[number])
        ? limitParam
        : DEFAULT_PAGE_SIZE;

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const midOrgId = useActiveMidOrgId(organizationId);
    const { currentRole: rawRole } = useOrganizationFromSidebar(organizationId);
    const currentRole = normalizeOrganizationRole(rawRole);
    const [sidebarAccountId, setSidebarAccountId] = useState<string | null>(null);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [statuses, setStatuses] = useState<FinopsBudgetStatusItem[]>([]);
    const [aiBudgets, setAiBudgets] = useState<AiBudgetRow[]>([]);
    const [aiStatusById, setAiStatusById] = useState<Record<string, AiBudgetStatus>>({});
    const [aiConnections, setAiConnections] = useState<AiConnectionOption[]>([]);
    const [aiCostUsers, setAiCostUsers] = useState<AiCostUserOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [emailGroups, setEmailGroups] = useState<NotificationGroupOption[]>([]);
    const [whatsappGroups, setWhatsappGroups] = useState<NotificationGroupOption[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<FinopsBudgetStatusItem | null>(null);
    const [aiDeleteTarget, setAiDeleteTarget] = useState<AiBudgetRow | null>(null);
    const [aiCreateOpen, setAiCreateOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);

    const syncUrlState = useCallback(
        (
            next: Partial<{
                account: string | null;
                kind: BudgetKind | null;
                view: BudgetViewPeriod | null;
                page: number | null;
                limit: number | null;
            }>
        ) => {
            const params = new URLSearchParams(buildFinopsQuery(searchParams, next));
            if (next.kind !== undefined) {
                if (!next.kind || next.kind === 'all') params.delete('kind');
                else params.set('kind', next.kind);
            }
            if (next.view !== undefined) {
                if (!next.view || next.view === 'all') params.delete('view');
                else params.set('view', next.view);
            }
            if (next.page !== undefined) {
                if (!next.page || next.page <= 1) params.delete('page');
                else params.set('page', String(next.page));
            }
            if (next.limit !== undefined) {
                if (!next.limit || next.limit === DEFAULT_PAGE_SIZE) params.delete('limit');
                else params.set('limit', String(next.limit));
            }
            const nextQuery = params.toString();
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    const newBudgetHref = useMemo(() => {
        const params = new URLSearchParams();
        if (scopeFilter) params.set('account', scopeFilter);
        const query = params.toString();
        return query ? `/finops/budgets/new?${query}` : '/finops/budgets/new';
    }, [scopeFilter]);

    const editBudgetHref = useCallback(
        (budgetId: string) => {
            const params = new URLSearchParams();
            if (scopeFilter) params.set('account', scopeFilter);
            const query = params.toString();
            return query
                ? `/finops/budgets/${encodeURIComponent(budgetId)}/edit?${query}`
                : `/finops/budgets/${encodeURIComponent(budgetId)}/edit`;
        },
        [scopeFilter]
    );

    useEffect(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        setSidebarAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
    }, [searchParams]);

    useEffect(() => {
        const handle = () => {
            setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
            setSidebarAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
        };
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
        window.addEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, handle);
        window.addEventListener('storage', handle);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
            window.removeEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, handle);
            window.removeEventListener('storage', handle);
        };
    }, []);

    useEffect(() => {
        if (!organizationId) return;

        const loadAccountsAndGroups = async () => {
            try {
                const [accountsResponse, emailResponse, whatsappResponse] = await Promise.all([
                    fetchOrganizationCloudAccounts(organizationId, {
                        midOrgId: midOrgId ?? getActiveMidOrgId(organizationId),
                    }),
                    fetchNotificationGroups(organizationId, 'email', { limit: 100 }),
                    fetchNotificationGroups(organizationId, 'whatsapp', { limit: 100 }),
                ]);

                if (accountsResponse.ok) {
                    const payload = await accountsResponse.json().catch(() => null);
                    const accounts = Array.isArray(payload)
                        ? payload
                        : Array.isArray((payload as { items?: unknown })?.items)
                          ? ((payload as { items: OrganizationCloudAccount[] }).items)
                          : [];
                    setCloudAccounts(accounts);
                } else {
                    setCloudAccounts([]);
                }

                const emailPayload = emailResponse.ok ? await emailResponse.json().catch(() => null) : null;
                const whatsappPayload = whatsappResponse.ok
                    ? await whatsappResponse.json().catch(() => null)
                    : null;
                setEmailGroups(normalizeNotificationGroupsPayload(emailPayload, t.groupFallbackName));
                setWhatsappGroups(normalizeNotificationGroupsPayload(whatsappPayload, t.groupFallbackName));
            } catch {
                setCloudAccounts([]);
                setEmailGroups([]);
                setWhatsappGroups([]);
            }
        };

        void loadAccountsAndGroups();
    }, [organizationId, midOrgId, t]);

    useEffect(() => {
        if (scopeFilter) return;
        const fallback = sidebarAccountId ?? cloudAccounts[0]?.id ?? ORG_SCOPE_VALUE;
        syncUrlState({ account: fallback });
    }, [scopeFilter, sidebarAccountId, cloudAccounts, syncUrlState]);

    const selectedAccount = useMemo(
        () =>
            scopeFilter && scopeFilter !== ORG_SCOPE_VALUE
                ? (cloudAccounts.find((account) => account.id === scopeFilter) ?? null)
                : null,
        [cloudAccounts, scopeFilter]
    );

    const canManage = hasRequiredOrganizationRole(currentRole, 'ADMIN');
    const isOrgScope = scopeFilter === ORG_SCOPE_VALUE;

    const loadStatuses = useCallback(
        async (orgId: string, filter: string, silent = false) => {
            if (!silent) setLoading(true);
            else setRefreshing(true);

            const parseStatuses = async (
                response: Response
            ): Promise<{ ok: true; items: FinopsBudgetStatusItem[] } | { ok: false; status: number; body: unknown }> => {
                const body = await response.json().catch(() => null);
                if (!response.ok) {
                    return { ok: false, status: response.status, body };
                }
                return { ok: true, items: normalizeBudgetStatusesPayload(body) };
            };

            const mergeById = (items: FinopsBudgetStatusItem[]) => {
                const map = new Map<string, FinopsBudgetStatusItem>();
                for (const item of items) {
                    map.set(item.budget.id, item);
                }
                return Array.from(map.values());
            };

            try {
                // "organization" = visão completa (tenant + contas).
                // Conta específica = budgets da conta + budgets do tenant (aplicam a todas as contas).
                if (filter === ORG_SCOPE_VALUE) {
                    const parsed = await parseStatuses(await fetchOrganizationFinopsBudgetStatuses(orgId, 50));
                    if (!parsed.ok) {
                        if (parsed.status === 401) {
                            toast.error(tCommon.sessionExpired);
                            router.replace('/auth/sign-in');
                            return;
                        }
                        toast.error(extractErrorMessage(parsed.body));
                        setStatuses([]);
                        return;
                    }
                    setStatuses(parsed.items);
                    return;
                }

                const [accountParsed, orgParsed] = await Promise.all([
                    parseStatuses(await fetchFinopsBudgetStatuses(orgId, filter)),
                    parseStatuses(await fetchOrganizationBudgetStatuses(orgId)),
                ]);

                if (
                    (!accountParsed.ok && accountParsed.status === 401) ||
                    (!orgParsed.ok && orgParsed.status === 401)
                ) {
                    toast.error(tCommon.sessionExpired);
                    router.replace('/auth/sign-in');
                    return;
                }

                if (!accountParsed.ok && !orgParsed.ok) {
                    toast.error(extractErrorMessage(accountParsed.body));
                    setStatuses([]);
                    return;
                }

                if (!accountParsed.ok) {
                    toast.error(extractErrorMessage(accountParsed.body));
                } else if (!orgParsed.ok) {
                    toast.error(extractErrorMessage(orgParsed.body));
                }

                setStatuses(
                    mergeById([
                        ...(orgParsed.ok ? orgParsed.items : []),
                        ...(accountParsed.ok ? accountParsed.items : []),
                    ])
                );
            } catch {
                toast.error(t.budgetLoadError);
                setStatuses([]);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [router, t, tCommon]
    );

    const loadAiBudgets = useCallback(
        async (orgId: string, mid: string | null) => {
            if (!mid) {
                setAiBudgets([]);
                setAiStatusById({});
                setAiConnections([]);
                setAiCostUsers([]);
                return;
            }
            try {
                const [budgetsRes, connectionsRes, usersRes] = await Promise.all([
                    fetchAiFinopsBudgets(orgId, mid),
                    fetchAiFinopsConnections(orgId, mid),
                    fetchAiFinopsCostUsers(orgId, { midOrganizationId: mid }),
                ]);
                const nextBudgets = budgetsRes.ok
                    ? asArray<AiBudgetRow>(await budgetsRes.json()).map((budget) => ({
                          ...budget,
                          scopeId: budget.scopeId ?? null,
                      }))
                    : [];
                setAiBudgets(nextBudgets);
                setAiConnections(
                    connectionsRes.ok
                        ? asArray<AiConnectionOption>(await connectionsRes.json())
                        : [],
                );
                setAiCostUsers(
                    usersRes.ok ? asArray<AiCostUserOption>(await usersRes.json()) : [],
                );

                const statusEntries = await Promise.all(
                    nextBudgets.map(async (budget) => {
                        const res = await fetchAiFinopsBudgetStatus(orgId, budget.id);
                        if (!res.ok) return [budget.id, {} as AiBudgetStatus] as const;
                        return [budget.id, (await res.json().catch(() => ({}))) as AiBudgetStatus] as const;
                    }),
                );
                setAiStatusById(Object.fromEntries(statusEntries));
            } catch {
                setAiBudgets([]);
                setAiStatusById({});
                setAiConnections([]);
                setAiCostUsers([]);
            }
        },
        [],
    );

    useEffect(() => {
        if (!organizationId || !scopeFilter) {
            setStatuses([]);
            setLoading(false);
            return;
        }
        void loadStatuses(organizationId, scopeFilter);
    }, [organizationId, scopeFilter, loadStatuses]);

    useEffect(() => {
        if (!organizationId || !showAi) return;
        void loadAiBudgets(organizationId, midOrgId);
    }, [organizationId, midOrgId, showAi, loadAiBudgets]);

    const refreshAll = useCallback(() => {
        if (!organizationId) return;
        if (showCloud && scopeFilter) void loadStatuses(organizationId, scopeFilter, true);
        if (showAi) void loadAiBudgets(organizationId, midOrgId);
    }, [organizationId, scopeFilter, showCloud, showAi, midOrgId, loadStatuses, loadAiBudgets]);

    const aiScopeLabel = useCallback(
        (budget: AiBudgetRow) => {
            if (budget.scopeType === 'organization') return t.aiBudgetScopeOrganization;
            if (budget.scopeType === 'provider') {
                return `${t.aiBudgetScopeProvider}: ${budget.scopeId ?? '—'}`;
            }
            if (budget.scopeType === 'connection') {
                const connection = aiConnections.find((c) => c.id === budget.scopeId);
                return `${t.aiBudgetScopeConnection}: ${connection?.name ?? budget.scopeId ?? '—'}`;
            }
            if (budget.scopeType === 'model') {
                return `${t.aiBudgetScopeModel}: ${budget.scopeId ?? '—'}`;
            }
            if (budget.scopeType === 'user') {
                const user = aiCostUsers.find((u) => u.externalId === budget.scopeId);
                return `${t.aiBudgetScopeUser}: ${user?.label ?? budget.scopeId ?? '—'}`;
            }
            return budget.scopeType;
        },
        [aiConnections, aiCostUsers, t],
    );

    const unifiedItems = useMemo(() => {
        const items: UnifiedBudgetItem[] = [];

        if (showCloud) {
            for (const item of statuses) {
                const period = item.budget.alertFrequency ?? item.budget.period;
                if (viewPeriod !== 'all' && period !== viewPeriod) continue;
                items.push({
                    key: `cloud:${item.budget.id}`,
                    kind: 'cloud',
                    id: item.budget.id,
                    name: item.budget.name,
                    period: item.budget.period,
                    currency: item.currency,
                    limit: getBudgetEffectiveLimit(item.budget),
                    spent: item.currentSpend,
                    percent: item.usagePercentage,
                    remaining: item.remainingAmount,
                    channels: item.budget.alertChannels ?? [],
                    thresholds: item.budget.alertThresholds ?? [],
                    triggered: item.triggeredAlerts ?? [],
                    scopeLabel:
                        item.budget.scope === 'organization'
                            ? t.organizationScope
                            : t.accountScope,
                    cloudItem: item,
                });
            }
        }

        if (showAi) {
            for (const budget of aiBudgets) {
                if (viewPeriod !== 'all' && budget.period !== viewPeriod) continue;
                const status = aiStatusById[budget.id];
                const limit = Number(budget.budgetAmount);
                const spent = Number(status?.spentOfficial ?? 0);
                const percent = Number(status?.percent ?? 0);
                items.push({
                    key: `ai:${budget.id}`,
                    kind: 'ai',
                    id: budget.id,
                    name: budget.name,
                    period: budget.period,
                    currency: budget.currency,
                    limit,
                    spent,
                    percent,
                    remaining: Number.isFinite(limit) ? Math.max(0, limit - spent) : null,
                    channels: budget.alertChannels ?? [],
                    thresholds: budget.alertThresholds ?? [],
                    triggered: status?.thresholdsHit ?? [],
                    scopeLabel: aiScopeLabel(budget),
                    aiBudget: budget,
                });
            }
        }

        return items.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
    }, [
        showCloud,
        showAi,
        statuses,
        aiBudgets,
        aiStatusById,
        viewPeriod,
        t,
        aiScopeLabel,
    ]);

    const totalPages = Math.max(1, Math.ceil(unifiedItems.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pagedItems = useMemo(() => {
        const start = (safePage - 1) * pageSize;
        return unifiedItems.slice(start, start + pageSize);
    }, [unifiedItems, safePage, pageSize]);
    const hasPreviousPage = safePage > 1;
    const hasNextPage = safePage < totalPages;

    useEffect(() => {
        if (page !== safePage) {
            syncUrlState({ page: safePage <= 1 ? null : safePage });
        }
    }, [page, safePage, syncUrlState]);

    const activeAlerts = useMemo(
        () =>
            unifiedItems
                .filter((item) => item.triggered.length > 0)
                .map((item) => ({
                    id: item.key,
                    name: item.name,
                    usagePercentage: item.percent,
                    triggeredAlerts: [...item.triggered].sort((a, b) => a - b),
                    currency: item.currency,
                    currentSpend: item.spent,
                    amount: item.limit,
                    kind: item.kind,
                })),
        [unifiedItems],
    );

    const cloudOnlyStatuses = useMemo(
        () =>
            unifiedItems
                .filter((item) => item.kind === 'cloud' && item.cloudItem)
                .map((item) => item.cloudItem!),
        [unifiedItems],
    );
    const highestRiskBudget = useMemo(
        () => pickHighestRiskBudget(cloudOnlyStatuses),
        [cloudOnlyStatuses],
    );
    const highestAiRisk = useMemo(() => {
        return unifiedItems
            .filter((item) => item.kind === 'ai')
            .sort((a, b) => b.percent - a.percent)[0] ?? null;
    }, [unifiedItems]);
    const highestUnified =
        (highestRiskBudget?.usagePercentage ?? -1) >= (highestAiRisk?.percent ?? -1)
            ? highestRiskBudget
                ? {
                      name: highestRiskBudget.budget.name,
                      percent: highestRiskBudget.usagePercentage,
                      spent: highestRiskBudget.currentSpend,
                      limit: getBudgetEffectiveLimit(highestRiskBudget.budget),
                      currency: highestRiskBudget.currency,
                      state: getBudgetRiskState(highestRiskBudget),
                  }
                : null
            : highestAiRisk
              ? {
                    name: highestAiRisk.name,
                    percent: highestAiRisk.percent,
                    spent: highestAiRisk.spent,
                    limit: highestAiRisk.limit,
                    currency: highestAiRisk.currency,
                    state:
                        highestAiRisk.percent >= 100
                            ? ('exceeded' as const)
                            : highestAiRisk.percent >= 80
                              ? ('near' as const)
                              : ('ok' as const),
                }
              : null;
    const atRiskCount = useMemo(() => {
        const cloudAtRisk = countBudgetsAtRisk(cloudOnlyStatuses);
        const aiAtRisk = unifiedItems.filter(
            (item) => item.kind === 'ai' && (item.percent >= 80 || item.triggered.length > 0),
        ).length;
        return cloudAtRisk + aiAtRisk;
    }, [cloudOnlyStatuses, unifiedItems]);
    const allBudgetsWithoutSpend =
        unifiedItems.length > 0 &&
        unifiedItems.every((item) =>
            item.kind === 'cloud' && item.cloudItem
                ? hasNoSpendInBudgetPeriod(item.cloudItem)
                : item.spent <= 0,
        );

    const onDelete = async (): Promise<boolean> => {
        if (!organizationId || !deleteTarget) return true;
        setDeleting(true);
        try {
            const response = await deleteFinopsBudgetUnified(organizationId, deleteTarget.budget.id);
            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body));
                return false;
            }
            toast.success(t.budgetsRemoved);
            setDeleteTarget(null);
            if (scopeFilter) void loadStatuses(organizationId, scopeFilter, true);
            return true;
        } catch {
            toast.error(t.budgetDeleteError);
            return false;
        } finally {
            setDeleting(false);
        }
    };

    const onDeleteAi = async (): Promise<boolean> => {
        if (!organizationId || !aiDeleteTarget) return true;
        setDeleting(true);
        try {
            const response = await deleteAiFinopsBudget(organizationId, aiDeleteTarget.id);
            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body));
                return false;
            }
            toast.success(t.aiBudgetRemoved);
            setAiDeleteTarget(null);
            void loadAiBudgets(organizationId, midOrgId);
            return true;
        } catch {
            toast.error(t.budgetDeleteError);
            return false;
        } finally {
            setDeleting(false);
        }
    };

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t.budgetsTitle}</CardTitle>
                    <CardDescription>{t.selectOrgSidebar}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (showCloud && loading && statuses.length === 0) {
        return <FinopsLoadingSkeleton />;
    }

    const hasActiveFilters =
        budgetKind !== 'all' || viewPeriod !== 'all' || Boolean(scopeFilter);

    const clearFilters = () => {
        syncUrlState({
            kind: 'all',
            view: 'all',
            account: null,
            page: null,
        });
    };

    const budgetsFilterFields = (
        <>
            <SearchableSelect
                mode="single"
                id="budgets-kind"
                label={t.budgetsKindLabel}
                value={budgetKind}
                options={[
                    { value: 'all', label: t.budgetsKindAll },
                    { value: 'cloud', label: t.budgetsKindCloud },
                    { value: 'ai', label: t.budgetsKindAi },
                ]}
                searchPlaceholder={tCommon.search}
                emptyText={t.filterSearchEmpty}
                clearLabel={t.clearFilters}
                onValueChange={(value) => syncUrlState({ kind: parseBudgetKind(value), page: null })}
            />

            <SearchableSelect
                mode="single"
                id="budgets-scope"
                label={t.scopeLabel}
                value={scopeFilter ?? ORG_SCOPE_VALUE}
                options={[
                    { value: ORG_SCOPE_VALUE, label: t.budgetsAllBudgets },
                    ...cloudAccounts.map((account) => ({
                        value: account.id,
                        label: `${account.alias} (${account.provider.toUpperCase()})`,
                    })),
                ]}
                searchPlaceholder={tCommon.search}
                emptyText={t.filterSearchEmpty}
                clearLabel={t.clearFilters}
                disabled={budgetKind === 'ai'}
                onValueChange={(value) => {
                    if (value !== ORG_SCOPE_VALUE) {
                        window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, value);
                    }
                    syncUrlState({ account: value, page: null });
                }}
            />

            <SearchableSelect
                mode="single"
                id="budgets-view"
                label={t.budgetsViewPlaceholder}
                value={viewPeriod}
                options={[
                    { value: 'all', label: t.budgetsAllCadences },
                    { value: 'daily', label: t.budgetsAlertTwiceDaily },
                    { value: 'monthly', label: t.budgetsAlertMonthly },
                ]}
                searchPlaceholder={tCommon.search}
                emptyText={t.filterSearchEmpty}
                clearLabel={t.clearFilters}
                onValueChange={(value) => {
                    syncUrlState({
                        view: value === 'daily' ? 'daily' : value === 'monthly' ? 'monthly' : 'all',
                        page: null,
                    });
                }}
            />
        </>
    );

    return (
        <div className="flex flex-col gap-6 pb-16">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                    <h1 className="text-xl font-semibold tracking-tight text-balance">{t.budgetsTitle}</h1>
                    <p className="text-muted-foreground max-w-2xl text-sm text-pretty">{t.budgetsDesc}</p>
                </div>
                <div
                    className={cn(
                        'grid w-full gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center',
                        canManage ? 'grid-cols-2' : 'grid-cols-1',
                    )}
                >
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-center gap-2 lg:w-auto"
                        onClick={refreshAll}
                        disabled={refreshing || (!scopeFilter && !showAi)}
                    >
                        <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                        {tCommon.refresh}
                    </Button>
                    {canManage ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" className="w-full justify-center gap-2 lg:w-auto">
                                    <Plus className="size-3.5" />
                                    {t.newBudget}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                    <Link href={newBudgetHref}>{t.budgetsKindCloud}</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={!midOrgId}
                                    onClick={() => setAiCreateOpen(true)}
                                >
                                    {t.budgetsKindAi}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </div>
            </div>

            <FinopsSubnav />

            <Card>
                <CardHeader className="gap-4">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <CardTitle className="text-base">{t.filtersTitle}</CardTitle>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {hasActiveFilters ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1.5"
                                    onClick={clearFilters}
                                >
                                    <RotateCcw className="size-3.5" />
                                    {t.clearFilters}
                                </Button>
                            ) : null}
                            <MobileFiltersDrawer
                                open={filtersDrawerOpen}
                                onOpenChange={setFiltersDrawerOpen}
                                title={t.filtersTitle}
                                triggerLabel={t.filterAdjust}
                                applyLabel={t.filterApply}
                                activeCount={hasActiveFilters ? 1 : 0}
                            >
                                {budgetsFilterFields}
                            </MobileFiltersDrawer>
                        </div>
                    </div>
                    <div className="hidden items-end gap-3 lg:grid lg:grid-cols-3">
                        {budgetsFilterFields}
                    </div>
                </CardHeader>
            </Card>

            {activeAlerts.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                {activeAlerts.length === 1
                                    ? t.budgetsOneAlertFired
                                    : t.budgetsManyAlertsFired.replace('{count}', String(activeAlerts.length))}
                            </p>
                            <ul className="space-y-1.5">
                                {activeAlerts.map((alert) => (
                                    <li key={alert.id} className="text-sm text-amber-900/90 dark:text-amber-50/90">
                                        <Badge variant="outline" className="mr-1">
                                            {alert.kind === 'ai' ? t.budgetsKindAi : t.budgetsKindCloud}
                                        </Badge>
                                        <span className="font-medium">{alert.name}</span>
                                        {': '}
                                        {t.budgetsAlertUsage
                                            .replace('{percent}', alert.usagePercentage.toFixed(0))
                                            .replace('{spent}', formatCurrency(alert.currentSpend, alert.currency))
                                            .replace('{limit}', formatCurrency(alert.amount, alert.currency))
                                            .replace(
                                                '{thresholds}',
                                                alert.triggeredAlerts.map((threshold) => `${threshold}%`).join(', ')
                                            )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {allBudgetsWithoutSpend && (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    {t.budgetsNoSpendIntro}{' '}
                    <span className="font-medium text-foreground">{t.periodLastMonth.toLowerCase()}</span>{' '}
                    {t.budgetsNoSpendMiddle}{' '}
                    <span className="font-medium text-foreground">{t.periodCurrentMonth.toLowerCase()}</span>{' '}
                    {t.budgetsNoSpendOutro}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.budgetsActiveTitle}</CardDescription>
                        <CardTitle className="text-2xl">{unifiedItems.length}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            {budgetKind === 'ai'
                                ? t.budgetsAiHint
                                : isOrgScope
                                  ? t.budgetsScopeOrgAndAccounts
                                  : t.budgetsScopeAccountAndOrg.replace(
                                        '{account}',
                                        selectedAccount?.alias ?? t.accountScope,
                                    )}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.budgetsAlertsTriggered}</CardDescription>
                        <CardTitle className={cn('text-2xl', activeAlerts.length > 0 && 'text-amber-600')}>
                            {activeAlerts.length}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">{t.budgetsAlertsHint}</p>
                    </CardContent>
                </Card>
                <Card
                    className={cn(
                        highestUnified?.state === 'near' && 'border-amber-500/50',
                        highestUnified?.state === 'exceeded' && 'border-destructive/50',
                    )}
                >
                    <CardHeader className="pb-2">
                        <CardDescription>{t.budgetsHighestRisk}</CardDescription>
                        <CardTitle
                            className={cn(
                                'text-2xl',
                                highestUnified?.state === 'near' && 'text-amber-600',
                                highestUnified?.state === 'exceeded' && 'text-destructive',
                            )}
                        >
                            {highestUnified ? `${highestUnified.percent.toFixed(0)}%` : '—'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        {highestUnified ? (
                            <>
                                <p className="truncate text-xs font-medium" title={highestUnified.name}>
                                    {highestUnified.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {t.budgetsSpendOf
                                        .replace(
                                            '{spent}',
                                            formatCurrency(highestUnified.spent, highestUnified.currency),
                                        )
                                        .replace(
                                            '{limit}',
                                            formatCurrency(highestUnified.limit, highestUnified.currency),
                                        )}
                                </p>
                                {unifiedItems.length > 1 ? (
                                    <p className="text-xs text-muted-foreground">
                                        {t.budgetsAtRiskCount
                                            .replace('{atRisk}', String(atRiskCount))
                                            .replace('{total}', String(unifiedItems.length))}
                                    </p>
                                ) : null}
                            </>
                        ) : (
                            <p className="text-xs text-muted-foreground">{t.budgetsNone}</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {showAi && !midOrgId ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{t.budgetsAiNeedMidOrgTitle}</CardTitle>
                        <CardDescription>{t.budgetsAiNeedMidOrgDesc}</CardDescription>
                    </CardHeader>
                </Card>
            ) : null}

            {unifiedItems.length === 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Target className="size-4" />
                            {t.budgetsEmptyUnifiedTitle}
                        </CardTitle>
                        <CardDescription>
                            {canManage ? t.budgetsEmptyUnifiedCanManage : t.budgetsEmptyReadOnly}
                        </CardDescription>
                    </CardHeader>
                    {canManage ? (
                        <CardContent className="flex flex-wrap gap-2">
                            <Button asChild>
                                <Link href={newBudgetHref}>
                                    <Plus className="size-3.5" />
                                    {t.budgetsNewCloud}
                                </Link>
                            </Button>
                            <Button
                                variant="outline"
                                disabled={!midOrgId}
                                onClick={() => setAiCreateOpen(true)}
                            >
                                <Plus className="size-3.5" />
                                {t.budgetsNewAi}
                            </Button>
                        </CardContent>
                    ) : null}
                </Card>
            ) : (
                <div className="grid gap-3">
                    {pagedItems.map((item) => {
                        const tone = usageTone(item.percent, item.triggered);
                        const channels = item.channels;
                        let alertTargetsLabel: string | null = null;
                        if (item.kind === 'cloud' && item.cloudItem) {
                            const groupIds = item.cloudItem.budget.alertNotificationGroupIds ?? [];
                            const allGroups = [...emailGroups, ...whatsappGroups];
                            const groupNames = groupIds
                                .map((id) => allGroups.find((group) => group.id === id)?.name)
                                .filter((name): name is string => Boolean(name));
                            const legacyEmails = item.cloudItem.budget.alertEmails ?? [];
                            alertTargetsLabel =
                                groupNames.length > 0
                                    ? groupNames.join(', ')
                                    : groupIds.length > 0
                                      ? t.budgetsGroupsCount.replace('{count}', String(groupIds.length))
                                      : legacyEmails.length > 0
                                        ? legacyEmails.join(', ')
                                        : null;
                        }

                        return (
                            <Card key={item.key}>
                                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <CardTitle className="text-base">{item.name}</CardTitle>
                                            <Badge variant={item.kind === 'ai' ? 'secondary' : 'outline'}>
                                                {item.kind === 'ai' ? t.budgetsKindAi : t.budgetsKindCloud}
                                            </Badge>
                                        </div>
                                        <CardDescription>
                                            {periodLabel(t, item.period)}
                                            {' · '}
                                            {item.scopeLabel}
                                            {item.kind === 'cloud' && item.cloudItem?.budget.service
                                                ? ` · ${item.cloudItem.budget.service}`
                                                : item.kind === 'cloud'
                                                  ? ` · ${t.budgetsAllServices}`
                                                  : ''}
                                        </CardDescription>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {item.triggered.length > 0 ? (
                                            <Badge variant="destructive" className="gap-1">
                                                <AlertTriangle className="size-3" />
                                                {t.budgetsAlertBadge.replace(
                                                    '{percent}',
                                                    String(Math.max(...item.triggered)),
                                                )}
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary">{t.budgetsWithinLimit}</Badge>
                                        )}
                                        {channels.includes('email') && (
                                            <Badge variant="outline">{tCommon.email}</Badge>
                                        )}
                                        {channels.includes('whatsapp') && (
                                            <Badge variant="outline">WhatsApp</Badge>
                                        )}
                                        {canManage && item.kind === 'cloud' ? (
                                            <>
                                                <Button variant="ghost" size="icon-sm" asChild>
                                                    <Link href={editBudgetHref(item.id)}>
                                                        <Pencil className="size-3.5" />
                                                        <span className="sr-only">{tCommon.edit}</span>
                                                    </Link>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() =>
                                                        item.cloudItem && setDeleteTarget(item.cloudItem)
                                                    }
                                                >
                                                    <Trash2 className="size-3.5" />
                                                    <span className="sr-only">{t.budgetsRemoveAction}</span>
                                                </Button>
                                            </>
                                        ) : null}
                                        {canManage && item.kind === 'ai' ? (
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() =>
                                                    item.aiBudget && setAiDeleteTarget(item.aiBudget)
                                                }
                                            >
                                                <Trash2 className="size-3.5" />
                                                <span className="sr-only">{t.budgetsRemoveAction}</span>
                                            </Button>
                                        ) : null}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex flex-wrap items-end justify-between gap-2">
                                        <div>
                                            <p
                                                className={cn(
                                                    'text-2xl font-semibold tabular-nums',
                                                    tone === 'critical' && 'text-destructive',
                                                    tone === 'warn' && 'text-amber-600',
                                                )}
                                            >
                                                {item.percent.toFixed(1)}%
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {t.budgetsSpendOf
                                                    .replace(
                                                        '{spent}',
                                                        formatCurrency(item.spent, item.currency),
                                                    )
                                                    .replace(
                                                        '{limit}',
                                                        formatCurrency(item.limit, item.currency),
                                                    )}
                                            </p>
                                            {item.kind === 'cloud' ? (
                                                <p className="text-xs text-muted-foreground">
                                                    {formatBudgetSpendPeriodLabel(item.period)}
                                                </p>
                                            ) : null}
                                        </div>
                                        {item.remaining != null ? (
                                            <p className="text-sm text-muted-foreground">
                                                {t.budgetsRemaining}{' '}
                                                <span className="font-medium text-foreground">
                                                    {formatCurrency(item.remaining, item.currency)}
                                                </span>
                                            </p>
                                        ) : null}
                                    </div>

                                    <BudgetUsageBar
                                        percentage={item.percent}
                                        thresholds={item.thresholds}
                                    />

                                    {item.kind === 'cloud' &&
                                    item.cloudItem &&
                                    hasNoSpendInBudgetPeriod(item.cloudItem) ? (
                                        <p className="text-xs text-muted-foreground">
                                            {t.budgetsNoSyncedSpend}
                                        </p>
                                    ) : null}

                                    <div className="flex flex-wrap gap-1.5">
                                        {item.thresholds.map((threshold) => {
                                            const triggered = item.triggered.includes(threshold);
                                            return (
                                                <Badge
                                                    key={threshold}
                                                    variant={triggered ? 'destructive' : 'outline'}
                                                    className="tabular-nums"
                                                >
                                                    {threshold}%
                                                    {triggered ? ` ${t.budgetsThresholdReached}` : ''}
                                                </Badge>
                                            );
                                        })}
                                    </div>

                                    {alertTargetsLabel ? (
                                        <p className="text-xs text-muted-foreground">
                                            {t.budgetsNotificationsTargets.replace(
                                                '{targets}',
                                                alertTargetsLabel,
                                            )}
                                        </p>
                                    ) : null}
                                </CardContent>
                            </Card>
                        );
                    })}

                    <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                            <span className="shrink-0 whitespace-nowrap">{tCommon.rowsPerPage}</span>
                            <Select
                                value={`${pageSize}`}
                                onValueChange={(value) => {
                                    syncUrlState({ limit: Number(value), page: null });
                                }}
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
                                {t.budgetsPageSummary
                                    .replace('{page}', String(safePage))
                                    .replace('{pages}', String(totalPages))
                                    .replace('{count}', String(unifiedItems.length))}
                            </span>
                            <div className="flex items-center gap-1 self-start sm:self-auto">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => syncUrlState({ page: null })}
                                    disabled={!hasPreviousPage}
                                >
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => syncUrlState({ page: Math.max(1, safePage - 1) })}
                                    disabled={!hasPreviousPage}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => syncUrlState({ page: safePage + 1 })}
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
                </div>
            )}

            {organizationId && midOrgId ? (
                <AiBudgetCreateDialog
                    open={aiCreateOpen}
                    onOpenChange={setAiCreateOpen}
                    tenantId={organizationId}
                    midOrgId={midOrgId}
                    connections={aiConnections}
                    costUsers={aiCostUsers}
                    onCreated={() => void loadAiBudgets(organizationId, midOrgId)}
                />
            ) : null}

            <ConfirmDeleteDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
                title={t.budgetsRemoveTitle}
                description={t.budgetsRemoveDescription.replace('{name}', deleteTarget?.budget.name ?? '')}
                resourceName={deleteTarget?.budget.name ?? ''}
                confirmLabel={t.budgetsRemoveAction}
                isConfirming={deleting}
                onConfirm={onDelete}
            />

            <ConfirmDeleteDialog
                open={Boolean(aiDeleteTarget)}
                onOpenChange={(open) => {
                    if (!open) setAiDeleteTarget(null);
                }}
                title={t.budgetsRemoveTitle}
                description={t.budgetsRemoveDescription.replace('{name}', aiDeleteTarget?.name ?? '')}
                resourceName={aiDeleteTarget?.name ?? ''}
                confirmLabel={t.budgetsRemoveAction}
                isConfirming={deleting}
                onConfirm={onDeleteAi}
            />
        </div>
    );
}
