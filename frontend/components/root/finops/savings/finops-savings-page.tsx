'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Landmark,
    Lightbulb,
    PiggyBank,
    Plus,
    RefreshCw,
    RotateCcw,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import { MobileFiltersDrawer } from '@/components/root/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { DatePicker } from '@/components/ui/date-picker';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import {
    ACCOUNT_FILTER_ALL,
    DASHBOARD_PERIODS,
    PROVIDER_FILTER_ALL,
    parseFinopsUrlFilters,
    periodLabel,
} from '@/components/root/finops/finops-filter-utils';
import { formatCurrency, priorityLabel } from '@/components/root/finops/overview/helpers';
import { shortResourceId } from '@/components/root/finops/overview/finops-resource-id';
import type { DashboardPeriod, FinopsRecommendation } from '@/components/root/finops/overview/types';
import {
    SavingsProjectionChart,
    type SavingsProjectionPoint,
} from '@/components/root/finops/savings/savings-projection-chart';
import { useIsBelowLg } from '@/hooks/use-mobile';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
    notifyMobileFiltersDrawer,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import {
    commitmentApplicableServices,
    commitmentAppliesToHint,
    commitmentRecommendationAction,
    commitmentRecommendationSubtitle,
    commitmentRecommendationTitle,
} from '@/lib/finops/commitment-labels';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import {
    createFinopsRealizedSaving,
    deleteFinopsRealizedSaving,
    dismissFinopsRecommendation,
    fetchFinopsCommitmentCandidates,
    fetchFinopsOrgSavings,
    fetchFinopsRealizedSavings,
    fetchFinopsSavingsProjection,
    realizeFinopsRecommendation,
} from '@/app/actions/finops';
import {
    candidateDisplayName,
    type CommitmentCandidate,
} from '@/lib/finops/commitment-candidates';
import { SpCandidatesList } from '@/components/root/finops/savings/sp-candidates-list';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { cn } from '@/lib/utils';
import { useTranslations, type Translations } from '@/lib/i18n';
import { formatDate } from '@/lib/i18n/format';
import { useLocale } from '@/components/providers/locale-provider';

type FinopsT = Record<keyof Translations['finops'], string>;
type DrawerDirection = 'bottom' | 'right';

const SAVINGS_FORM_SNAP_POINTS = [0.72, 1] as const;

function restoreBodyPointerEvents() {
    if (typeof document === 'undefined') return;
    document.body.style.pointerEvents = '';
}

type SavingsRow = FinopsRecommendation & { cloudAccountId: string };

function savingsRowTitle(row: SavingsRow, t: FinopsT): string {
    if (row.kind === 'reservation') return commitmentRecommendationTitle(row, t);
    return row.resourceType;
}

function savingsRowSubtitle(row: SavingsRow, t: FinopsT): string | null {
    if (row.kind === 'reservation') {
        const subtitle = commitmentRecommendationSubtitle(row, t);
        return subtitle || null;
    }
    if (!row.resourceId?.trim()) return null;
    return shortResourceId(row.resourceId);
}

function savingsRowAction(row: SavingsRow, t: FinopsT): string {
    if (row.kind === 'reservation') return commitmentRecommendationAction(row, t);
    return row.recommendation || row.description;
}

function SavingsCommitmentServices({ row, t }: { row: SavingsRow; t: FinopsT }) {
    const services = commitmentApplicableServices(row, t);
    if (services.length === 0) return null;
    const hint = commitmentAppliesToHint(row, t);
    return (
        <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">{t.commitmentAppliesTo}</p>
            <div className="flex min-w-0 flex-wrap gap-1">
                {services.map((service) => (
                    <Badge key={service} variant="secondary" className="max-w-full truncate text-[10px] font-normal">
                        {service}
                    </Badge>
                ))}
            </div>
            {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

function candidateReasonLabels(candidate: CommitmentCandidate, t: FinopsT): string[] {
    const labels: string[] = [];
    for (const code of candidate.reasonCodes ?? []) {
        if (code === 'stable_spend') labels.push(t.recommendSpReasonStable);
        else if (code === 'consistent_usage') labels.push(t.recommendSpReasonConsistent);
        else if (code === 'compute_eligible') labels.push(t.recommendSpReasonCompute);
        else if (code === 'long_running_instance') {
            labels.push(
                t.recommendSpReasonLongRunning.replace(
                    '{days}',
                    String(candidate.launchAgeDays ?? candidate.lookbackDays),
                ),
            );
        }
    }
    return labels;
}

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

type RealizedSaving = {
    id: string;
    cloudAccountId: string;
    provider: string;
    resourceNames: string[];
    monthlyAmount: number;
    currency: string;
    description: string;
    executedAt: string;
    source: string;
};

type RealizedListResponse = {
    items: RealizedSaving[];
    totals: { totalSaved: number; currency: string; count: number };
};

type ProjectionResponse = {
    currency: string;
    points: SavingsProjectionPoint[];
    totals: {
        totalSaved: number;
        potentialOpen: number;
        currentWithout: number;
        currentWith: number;
    };
};

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 30] as const;
const DEFAULT_SORT = 'saving';
const SORT_OPTIONS = [
    { value: 'saving', labelKey: 'sortSaving' },
    { value: 'priority', labelKey: 'sortPriority' },
    { value: 'date', labelKey: 'sortDate' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: keyof FinopsT }>;
type SortOption = (typeof SORT_OPTIONS)[number]['value'];

const PRIORITY_BADGE = {
    high: { labelKey: 'severityHigh', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    medium: { labelKey: 'severityMedium', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    low: { labelKey: 'severityLow', className: 'bg-muted text-muted-foreground' },
} as const satisfies Record<string, { labelKey: keyof FinopsT; className: string }>;

function isSortOption(value: string | null): value is SortOption {
    return SORT_OPTIONS.some((o) => o.value === value);
}

function resolvePeriodDates(period: DashboardPeriod): { periodStart: string; periodEnd: string } {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);

    if (period === 'last7days') start.setUTCDate(end.getUTCDate() - 6);
    else if (period === 'last30days') start.setUTCDate(end.getUTCDate() - 29);
    else if (period === 'last90days') start.setUTCDate(end.getUTCDate() - 89);
    else if (period === 'currentmonth') {
        start.setUTCFullYear(today.getUTCFullYear(), today.getUTCMonth(), 1);
        end.setTime(today.getTime());
    } else if (period === 'lastmonth') {
        start.setUTCFullYear(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
        end.setUTCFullYear(today.getUTCFullYear(), today.getUTCMonth(), 0);
    } else {
        start.setUTCFullYear(today.getUTCFullYear(), 0, 1);
        end.setTime(today.getTime());
    }

    return {
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
    };
}

function PriorityBadge({ priority, t }: { priority: string; t: FinopsT }) {
    const cfg = PRIORITY_BADGE[priority as keyof typeof PRIORITY_BADGE] ?? PRIORITY_BADGE.low;
    return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cfg.className)}>
            {t[cfg.labelKey]}
        </span>
    );
}

function createManualSchema(msgs: {
    accountRequired: string;
    resourceRequired: string;
    amountRequired: string;
    amountPositive: string;
    descriptionRequired: string;
    dateRequired: string;
}) {
    return z.object({
        cloudAccountId: z.string().uuid({ message: msgs.accountRequired }),
        resourceName: z.string().trim().min(1, msgs.resourceRequired).max(512),
        monthlyAmount: z.preprocess(
            (value) => {
                if (value === '' || value === undefined || value === null) return undefined;
                if (typeof value === 'number' && Number.isNaN(value)) return undefined;
                return typeof value === 'number' ? value : Number(value);
            },
            z.number({ error: msgs.amountRequired }).positive(msgs.amountPositive),
        ),
        description: z.string().trim().min(1, msgs.descriptionRequired).max(4000),
        executedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msgs.dateRequired),
    });
}
type ManualFormValues = z.input<ReturnType<typeof createManualSchema>>;
type ManualFormData = z.output<ReturnType<typeof createManualSchema>>;

const realizeSchema = z.object({
    monthlyAmount: z.number().positive().optional(),
    executedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().max(4000).optional(),
});
type RealizeFormData = z.infer<typeof realizeSchema>;

export function FinopsSavingsPage() {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');
    const { locale } = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);
    const periodDates = useMemo(() => resolvePeriodDates(urlFilters.period), [urlFilters.period]);

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
    const [realized, setRealized] = useState<RealizedListResponse | null>(null);
    const [projection, setProjection] = useState<ProjectionResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
    const [searchDraft, setSearchDraft] = useState(qFilter);
    const [manualOpen, setManualOpen] = useState(false);
    const [previewCandidates, setPreviewCandidates] = useState<CommitmentCandidate[]>([]);
    const [previewCandidatesLoading, setPreviewCandidatesLoading] = useState(false);
    const [realizeTarget, setRealizeTarget] = useState<SavingsRow | null>(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [manualSnapPoint, setManualSnapPoint] = useState<number | string | null>(SAVINGS_FORM_SNAP_POINTS[0]);
    const [realizeSnapPoint, setRealizeSnapPoint] = useState<number | string | null>(SAVINGS_FORM_SNAP_POINTS[0]);
    const isBelowLg = useIsBelowLg();
    const formDrawerOpen = manualOpen || Boolean(realizeTarget);
    const directionRef = useRef<DrawerDirection>(isBelowLg ? 'bottom' : 'right');
    if (!formDrawerOpen) {
        directionRef.current = isBelowLg ? 'bottom' : 'right';
    }
    const formDirection = directionRef.current;
    const isBottomForm = formDirection === 'bottom';
    const isManualFullHeight = isBottomForm && (manualSnapPoint === 1 || manualSnapPoint === '1');
    const isRealizeFullHeight = isBottomForm && (realizeSnapPoint === 1 || realizeSnapPoint === '1');

    const scopedAccountIds = useMemo(() => cloudAccounts.map((account) => account.id), [cloudAccounts]);

    useEffect(() => {
        notifyMobileFiltersDrawer(formDrawerOpen);
        return () => {
            if (formDrawerOpen) notifyMobileFiltersDrawer(false);
        };
    }, [formDrawerOpen]);

    useEffect(() => {
        if (formDrawerOpen) {
            setManualSnapPoint(SAVINGS_FORM_SNAP_POINTS[0]);
            setRealizeSnapPoint(SAVINGS_FORM_SNAP_POINTS[0]);
            return;
        }
        const timer = window.setTimeout(restoreBodyPointerEvents, 0);
        return () => window.clearTimeout(timer);
    }, [formDrawerOpen]);

    const manualSchema = useMemo(
        () =>
            createManualSchema({
                accountRequired: tCommon.required.replace('{field}', t.fieldCloudAccount),
                resourceRequired: tCommon.required.replace('{field}', t.fieldResourceName),
                amountRequired: tCommon.required.replace('{field}', t.fieldMonthlyAmount),
                amountPositive: t.fieldAmountPositive,
                descriptionRequired: tCommon.required.replace('{field}', t.fieldDescription),
                dateRequired: tCommon.required.replace('{field}', t.fieldExecutedAt),
            }),
        [t, tCommon],
    );

    const manualForm = useForm<ManualFormValues, unknown, ManualFormData>({
        resolver: zodResolver(manualSchema),
        defaultValues: {
            cloudAccountId: '',
            resourceName: '',
            monthlyAmount: undefined,
            description: '',
            executedAt: new Date().toISOString().slice(0, 10),
        },
    });

    const realizeForm = useForm<RealizeFormData>({
        resolver: zodResolver(realizeSchema),
        defaultValues: {
            executedAt: new Date().toISOString().slice(0, 10),
            monthlyAmount: undefined,
            description: '',
        },
    });

    const syncUrlState = useCallback(
        (
            next: Partial<{
                account: string | null;
                provider: string | null;
                period: string | null;
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
            if (next.period !== undefined) {
                if (!next.period || next.period === 'lastmonth') params.delete('period');
                else params.set('period', next.period);
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

    const selectedAccountIds = useMemo(
        () => urlFilters.accountIds.filter((id) => scopedAccountIds.includes(id)),
        [scopedAccountIds, urlFilters.accountIds],
    );

    const scopeOptions = useMemo(
        () => ({
            cloudAccountId: selectedAccountIds.length === 1 ? selectedAccountIds[0] : undefined,
            cloudAccountIds:
                selectedAccountIds.length > 1
                    ? selectedAccountIds
                    : selectedAccountIds.length === 0
                      ? scopedAccountIds
                      : undefined,
            provider: urlFilters.providers[0] ?? undefined,
            periodStart: periodDates.periodStart,
            periodEnd: periodDates.periodEnd,
        }),
        [periodDates, scopedAccountIds, selectedAccountIds, urlFilters.providers],
    );

    const reloadAll = useCallback(
        async (orgId: string) => {
            if (scopedAccountIds.length === 0) {
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
                setRealized({ items: [], totals: { totalSaved: 0, currency: 'USD', count: 0 } });
                setProjection({
                    currency: 'USD',
                    points: [],
                    totals: { totalSaved: 0, potentialOpen: 0, currentWithout: 0, currentWith: 0 },
                });
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const [savingsRes, realizedRes, projectionRes] = await Promise.all([
                    fetchFinopsOrgSavings(orgId, {
                        status: statusFilter,
                        priority: priorityFilter,
                        sort: sortFilter,
                        q: qFilter || undefined,
                        cloudAccountId: scopeOptions.cloudAccountId,
                        cloudAccountIds: scopeOptions.cloudAccountIds,
                        provider: scopeOptions.provider,
                        page,
                        limit: pageSize,
                    }),
                    fetchFinopsRealizedSavings(orgId, {
                        cloudAccountId: scopeOptions.cloudAccountId,
                        cloudAccountIds: scopeOptions.cloudAccountIds,
                        provider: scopeOptions.provider,
                        periodStart: scopeOptions.periodStart,
                        periodEnd: scopeOptions.periodEnd,
                        page: 1,
                        limit: 50,
                    }),
                    fetchFinopsSavingsProjection(orgId, {
                        cloudAccountId: scopeOptions.cloudAccountId,
                        cloudAccountIds: scopeOptions.cloudAccountIds,
                        provider: scopeOptions.provider,
                        periodStart: scopeOptions.periodStart,
                        periodEnd: scopeOptions.periodEnd,
                    }),
                ]);

                if (savingsRes.status === 401 || realizedRes.status === 401 || projectionRes.status === 401) {
                    toast.error(tCommon.sessionExpired);
                    router.replace('/auth/sign-in');
                    return;
                }

                const [savingsPayload, realizedPayload, projectionPayload] = await Promise.all([
                    savingsRes.json().catch(() => null),
                    realizedRes.json().catch(() => null),
                    projectionRes.json().catch(() => null),
                ]);

                if (!savingsRes.ok) {
                    toast.error(extractErrorMessage(savingsPayload));
                    setData(null);
                } else {
                    setData(savingsPayload as SavingsListResponse);
                }

                if (realizedRes.ok) setRealized(realizedPayload as RealizedListResponse);
                else setRealized({ items: [], totals: { totalSaved: 0, currency: 'USD', count: 0 } });

                if (projectionRes.ok) setProjection(projectionPayload as ProjectionResponse);
                else
                    setProjection({
                        currency: 'USD',
                        points: [],
                        totals: { totalSaved: 0, potentialOpen: 0, currentWithout: 0, currentWith: 0 },
                    });
            } catch {
                toast.error(t.loadSavingsError);
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
            scopeOptions,
            scopedAccountIds.length,
            sortFilter,
            statusFilter,
            t,
            tCommon,
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
        if (urlFilters.accountIds.some((id) => !scopedAccountIds.includes(id))) {
            const valid = urlFilters.accountIds.filter((id) => scopedAccountIds.includes(id));
            syncUrlState({ account: valid.length > 0 ? valid.join(',') : null, page: null });
            return;
        }
        void reloadAll(organizationId);
    }, [
        organizationId,
        accountsReady,
        scopedAccountIds,
        reloadAll,
        urlFilters.accountIds,
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
    const currency = realized?.totals.currency ?? totals?.currency ?? projection?.currency ?? 'USD';
    const totalSaved = realized?.totals.totalSaved ?? projection?.totals.totalSaved ?? 0;

    const openManual = () => {
        manualForm.reset({
            cloudAccountId: selectedAccountIds[0] ?? scopedAccountIds[0] ?? '',
            resourceName: '',
            monthlyAmount: undefined,
            description: '',
            executedAt: new Date().toISOString().slice(0, 10),
        });
        setManualOpen(true);
    };

    const loadPreviewCandidates = useCallback(async () => {
        if (!organizationId || !accountsReady) return;
        setPreviewCandidatesLoading(true);
        try {
            const provider = urlFilters.providers[0];
            const response = await fetchFinopsCommitmentCandidates(organizationId, {
                cloudAccountId: selectedAccountIds.length === 1 ? selectedAccountIds[0] : undefined,
                provider: provider && provider !== PROVIDER_FILTER_ALL ? provider : undefined,
                lookbackDays: 90,
                limit: 5,
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                setPreviewCandidates([]);
                return;
            }
            const nextItems = Array.isArray(body?.items) ? (body.items as CommitmentCandidate[]) : [];
            setPreviewCandidates(
                selectedAccountIds.length > 1
                    ? nextItems.filter((item) => selectedAccountIds.includes(item.cloudAccountId)).slice(0, 5)
                    : nextItems.slice(0, 5),
            );
        } catch {
            setPreviewCandidates([]);
        } finally {
            setPreviewCandidatesLoading(false);
        }
    }, [organizationId, accountsReady, selectedAccountIds, urlFilters.providers]);

    useEffect(() => {
        void loadPreviewCandidates();
    }, [loadPreviewCandidates]);

    useEffect(() => {
        if (searchParams.get('register') !== '1') return;
        const resource = searchParams.get('resource')?.trim() ?? '';
        const account = searchParams.get('account')?.trim() ?? '';
        const amountRaw = searchParams.get('amount');
        const amount = amountRaw != null ? Number(amountRaw) : undefined;
        manualForm.reset({
            cloudAccountId: account || selectedAccountIds[0] || scopedAccountIds[0] || '',
            resourceName: resource,
            monthlyAmount:
                amount != null && Number.isFinite(amount) && amount > 0 ? amount : undefined,
            description: t.recommendSpReasonCompute,
            executedAt: new Date().toISOString().slice(0, 10),
        });
        setManualOpen(true);
        const params = new URLSearchParams(searchParams.toString());
        params.delete('register');
        params.delete('resource');
        params.delete('account');
        params.delete('amount');
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    }, [
        searchParams,
        manualForm,
        selectedAccountIds,
        scopedAccountIds,
        t.recommendSpReasonCompute,
        router,
        pathname,
    ]);

    const useCandidateInRegister = (candidate: CommitmentCandidate) => {
        const reasons = candidateReasonLabels(candidate, t).join(' · ');
        const amount =
            candidate.estimatedSpMonthlySavings > 0
                ? candidate.estimatedSpMonthlySavings
                : candidate.estimatedMonthlyCost;
        manualForm.reset({
            cloudAccountId: candidate.cloudAccountId,
            resourceName: candidateDisplayName(candidate),
            monthlyAmount: amount > 0 ? Number(amount.toFixed(2)) : undefined,
            description: reasons || t.recommendSpReasonCompute,
            executedAt: new Date().toISOString().slice(0, 10),
        });
        setManualOpen(true);
    };

    const candidatesPageHref = useMemo(() => {
        const params = new URLSearchParams(searchParams.toString());
        const query = params.toString();
        return query ? `/finops/savings/candidates?${query}` : '/finops/savings/candidates';
    }, [searchParams]);

    const openRealize = (row: SavingsRow) => {
        realizeForm.reset({
            executedAt: new Date().toISOString().slice(0, 10),
            monthlyAmount: row.potentialSaving ?? undefined,
            description: savingsRowAction(row, t),
        });
        setRealizeTarget(row);
    };

    const onManualSubmit = async (formData: ManualFormData) => {
        if (!organizationId) return;
        setActionBusy(true);
        try {
            const response = await createFinopsRealizedSaving(organizationId, {
                cloudAccountId: formData.cloudAccountId,
                resourceNames: [formData.resourceName.trim()],
                monthlyAmount: formData.monthlyAmount,
                description: formData.description.trim(),
                executedAt: formData.executedAt,
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.registerSavingSuccess);
            setManualOpen(false);
            await reloadAll(organizationId);
        } finally {
            setActionBusy(false);
        }
    };

    const onRealizeSubmit = async (formData: RealizeFormData) => {
        if (!organizationId || !realizeTarget) return;
        setActionBusy(true);
        try {
            const response = await realizeFinopsRecommendation(organizationId, realizeTarget.id, {
                executedAt: formData.executedAt,
                monthlyAmount: formData.monthlyAmount,
                description: formData.description || undefined,
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.realizeSavingSuccess);
            setRealizeTarget(null);
            await reloadAll(organizationId);
        } finally {
            setActionBusy(false);
        }
    };

    const onDismiss = async (row: SavingsRow) => {
        if (!organizationId) return;
        setActionBusy(true);
        try {
            const response = await dismissFinopsRecommendation(organizationId, row.cloudAccountId, row.id);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.dismissSavingSuccess);
            await reloadAll(organizationId);
        } finally {
            setActionBusy(false);
        }
    };

    const onDeleteRealized = async (id: string) => {
        if (!organizationId) return;
        setActionBusy(true);
        try {
            const response = await deleteFinopsRealizedSaving(organizationId, id);
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.realizedDeleteSuccess);
            await reloadAll(organizationId);
        } finally {
            setActionBusy(false);
        }
    };

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t.potentialSavings}</CardTitle>
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
        urlFilters.period !== 'lastmonth' ||
        statusFilter !== 'open' ||
        priorityFilter !== 'all' ||
        sortFilter !== DEFAULT_SORT ||
        Boolean(qFilter);

    const clearFilters = () => {
        setSearchDraft('');
        syncUrlState({
            account: null,
            provider: null,
            period: 'lastmonth',
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

    const savingsFilterFields = (
        <>
            <SearchableSelect
                mode="single"
                id="savings-period"
                label={t.periodFilterLabel}
                value={urlFilters.period}
                onValueChange={(value) => syncUrlState({ period: value, page: null })}
                options={DASHBOARD_PERIODS.map((period) => ({
                    value: period,
                    label: periodLabel(period),
                }))}
            />
            <SearchableSelect
                mode="single"
                id="savings-cloud-account"
                label={t.cloudAccountLabel}
                className="sm:col-span-2 lg:col-span-1"
                value={
                    urlFilters.accountId && scopedAccountIds.includes(urlFilters.accountId)
                        ? urlFilters.accountId
                        : ACCOUNT_FILTER_ALL
                }
                onValueChange={(value) =>
                    syncUrlState({
                        account: value === ACCOUNT_FILTER_ALL ? null : value,
                        page: null,
                    })
                }
                options={[
                    { value: ACCOUNT_FILTER_ALL, label: t.allAccounts },
                    ...cloudAccounts.map((account) => ({
                        value: account.id,
                        label: account.alias,
                    })),
                ]}
            />
            <SearchableSelect
                mode="single"
                id="savings-provider"
                label={t.providerLabel}
                value={urlFilters.providers[0] ?? PROVIDER_FILTER_ALL}
                onValueChange={(value) =>
                    syncUrlState({
                        provider: value === PROVIDER_FILTER_ALL ? null : value,
                        page: null,
                    })
                }
                options={[
                    { value: PROVIDER_FILTER_ALL, label: t.allProviders },
                    { value: 'aws', label: 'AWS' },
                    { value: 'azure', label: 'Azure' },
                    { value: 'gcp', label: 'GCP' },
                ]}
            />
            <SearchableSelect
                mode="single"
                id="savings-status"
                label={tCommon.status}
                value={statusFilter}
                onValueChange={(value) => syncUrlState({ status: value, page: null })}
                options={[
                    { value: 'open', label: t.statusOpen },
                    { value: 'dismissed', label: t.statusDismissed },
                    { value: 'resolved', label: t.statusResolved },
                    { value: 'all', label: t.statusAll },
                ]}
            />
            <SearchableSelect
                mode="single"
                id="savings-priority"
                label={t.priorityLabel}
                value={priorityFilter}
                onValueChange={(value) => syncUrlState({ priority: value, page: null })}
                options={[
                    { value: 'all', label: t.allPriorities },
                    { value: 'high', label: t.severityHigh },
                    { value: 'medium', label: t.severityMedium },
                    { value: 'low', label: t.severityLow },
                ]}
            />
            <SearchableSelect
                mode="single"
                id="savings-sort"
                label={t.sortByLabel}
                value={sortFilter}
                onValueChange={(value) => syncUrlState({ sort: value, page: null })}
                options={SORT_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t[option.labelKey],
                }))}
            />
            <div className="space-y-1.5 lg:col-span-2 xl:col-span-1">
                <label htmlFor="savings-q" className="text-xs font-medium text-muted-foreground">
                    {t.searchResource}
                </label>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                    <Input
                        id="savings-q"
                        className="min-w-0 w-full"
                        value={searchDraft}
                        onChange={(event) => setSearchDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                applySearch();
                            }
                        }}
                        placeholder={t.searchResourcePlaceholder}
                    />
                    <Button type="button" variant="secondary" className="w-full shrink-0 sm:w-auto" onClick={applySearch}>
                        {tCommon.search}
                    </Button>
                </div>
            </div>
        </>
    );

    return (
        <div className="flex flex-col gap-6 pb-24">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">{t.potentialSavings}</h1>
                        <p className="text-sm text-muted-foreground">{t.savingsDesc}</p>
                    </div>
                    <FinopsSubnav />
                </div>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center">
                    <Button
                        type="button"
                        size="sm"
                        className="w-full justify-center gap-2 lg:w-auto"
                        onClick={openManual}
                    >
                        <Plus className="size-4" />
                        {t.registerSaving}
                    </Button>
                    <Button asChild variant="secondary" size="sm" className="w-full justify-center gap-2 lg:w-auto">
                        <Link href={candidatesPageHref}>
                            <Sparkles className="size-4" />
                            {t.recommendSpCandidates}
                        </Link>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-center gap-2 lg:w-auto"
                        isLoading={loading}
                        onClick={() => organizationId && void reloadAll(organizationId)}
                    >
                        <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                        {tCommon.refresh}
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.totalSaved}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums text-emerald-600">
                            {formatCurrency(totalSaved, currency)}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.savingsEstimated}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">
                            {formatCurrency(totals?.potentialSavings ?? 0, currency)}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.savingsOpenOpportunities}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{totals?.open ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t.savingsHighPriority}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{totals?.high ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card>
                <CardHeader className="gap-4">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <CardTitle className="text-base">{t.filtersTitle}</CardTitle>
                            <CardDescription className="hidden sm:block">
                                {t.savingsReservationLookbackNote}
                            </CardDescription>
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
                                    {tCommon.clearFilters}
                                </Button>
                            ) : null}
                            <MobileFiltersDrawer
                                open={filtersDrawerOpen}
                                onOpenChange={setFiltersDrawerOpen}
                                title={t.filtersTitle}
                                description={t.savingsReservationLookbackNote}
                                triggerLabel={t.filterAdjust}
                                applyLabel={t.filterApply}
                                activeCount={hasActiveFilters ? 1 : 0}
                            >
                                {savingsFilterFields}
                            </MobileFiltersDrawer>
                        </div>
                    </div>
                    <div className="hidden items-end gap-3 lg:grid lg:grid-cols-3 xl:grid-cols-4">
                        {savingsFilterFields}
                    </div>
                </CardHeader>
            </Card>

            <SavingsProjectionChart
                points={projection?.points ?? []}
                currency={projection?.currency ?? currency}
                isLoading={loading}
            />

            <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Sparkles className="size-4 text-muted-foreground" />
                            {t.recommendSpCandidatesPreviewTitle}
                        </CardTitle>
                        <CardDescription>{t.recommendSpCandidatesPreviewDesc}</CardDescription>
                    </div>
                    <Button asChild variant="outline" size="sm" className="w-full shrink-0 sm:w-auto">
                        <Link href={candidatesPageHref}>{t.recommendSpCandidatesViewAll}</Link>
                    </Button>
                </CardHeader>
                <CardContent>
                    <SpCandidatesList
                        items={previewCandidates}
                        accountAliases={accountAliases}
                        t={t}
                        isLoading={previewCandidatesLoading}
                        onUseResource={useCandidateInRegister}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="gap-1">
                    <CardTitle className="text-base">{t.savingsListTitle}</CardTitle>
                    <CardDescription className="lg:hidden">{t.savingsReservationLookbackNote}</CardDescription>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                            <Lightbulb className="h-8 w-8 text-muted-foreground" />
                            <p className="text-sm font-medium">{t.savingsEmptyTitle}</p>
                            <p className="text-xs text-muted-foreground">{t.savingsEmptyHint}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="min-w-0 px-4">{t.colResource}</TableHead>
                                        <TableHead className="hidden px-4 lg:table-cell">{t.colRecommendedAction}</TableHead>
                                        <TableHead className="px-4 text-right">{t.colSavingsMonth}</TableHead>
                                        <TableHead className="px-4 text-right">{t.colActions}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((rec) => {
                                        const alias =
                                            accountAliases[rec.cloudAccountId] ?? rec.cloudAccountId.slice(0, 8);
                                        const kind = rec.kind ?? 'waste';
                                        const title = savingsRowTitle(rec, t);
                                        const subtitle = savingsRowSubtitle(rec, t);
                                        const actionText = savingsRowAction(rec, t);
                                        return (
                                            <TableRow key={`${kind}-${rec.id}`}>
                                                <TableCell className="min-w-0 px-4">
                                                    <div className="min-w-0 space-y-1.5">
                                                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                            <PriorityBadge priority={rec.priority} t={t} />
                                                            <Badge variant="outline" className="text-[10px]">
                                                                {kind === 'reservation'
                                                                    ? t.kindReservation
                                                                    : t.kindWaste}
                                                            </Badge>
                                                        </div>
                                                        <p className="truncate text-sm font-medium">{title}</p>
                                                        {subtitle ? (
                                                            <p
                                                                className={
                                                                    kind === 'reservation'
                                                                        ? 'line-clamp-2 text-xs text-muted-foreground'
                                                                        : 'truncate font-mono text-xs text-muted-foreground'
                                                                }
                                                                title={
                                                                    kind === 'reservation'
                                                                        ? subtitle
                                                                        : rec.resourceId
                                                                }
                                                            >
                                                                {subtitle}
                                                            </p>
                                                        ) : null}
                                                        <p className="line-clamp-2 text-xs text-muted-foreground lg:hidden">
                                                            {actionText}
                                                        </p>
                                                        {kind === 'reservation' ? (
                                                            <div className="lg:hidden">
                                                                <SavingsCommitmentServices row={rec} t={t} />
                                                            </div>
                                                        ) : null}
                                                        <p className="text-[11px] text-muted-foreground lg:hidden">
                                                            {alias} · {rec.cloudProvider}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden min-w-0 px-4 lg:table-cell">
                                                    <div className="min-w-0 space-y-1.5">
                                                        <p className="line-clamp-2 text-sm">{actionText}</p>
                                                        {kind === 'waste' && rec.description ? (
                                                            <p className="line-clamp-1 text-xs text-muted-foreground">
                                                                {rec.description}
                                                            </p>
                                                        ) : null}
                                                        {kind === 'reservation' ? (
                                                            <SavingsCommitmentServices row={rec} t={t} />
                                                        ) : null}
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {alias} · {rec.cloudProvider}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 text-right align-top">
                                                    {rec.potentialSaving != null ? (
                                                        <p className="text-sm font-semibold tabular-nums text-emerald-600">
                                                            {formatCurrency(rec.potentialSaving, rec.currency)}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-muted-foreground">{t.noEstimate}</p>
                                                    )}
                                                    <span className="sr-only">{priorityLabel(rec.priority)}</span>
                                                </TableCell>
                                                <TableCell className="px-4 text-right align-top">
                                                    <div className="flex flex-col items-stretch gap-1 sm:items-end">
                                                        {kind === 'waste' && rec.status === 'open' ? (
                                                            <>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="secondary"
                                                                    className="h-8 w-full justify-center sm:w-auto"
                                                                    disabled={actionBusy}
                                                                    onClick={() => openRealize(rec)}
                                                                >
                                                                    <CheckCircle2 className="size-3.5" />
                                                                    <span className="ml-1">{t.realizeSaving}</span>
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-8 w-full justify-center sm:w-auto"
                                                                    disabled={actionBusy}
                                                                    onClick={() => void onDismiss(rec)}
                                                                >
                                                                    {t.dismissSaving}
                                                                </Button>
                                                            </>
                                                        ) : null}
                                                        {kind === 'reservation' ? (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8 w-full justify-center sm:w-auto"
                                                                asChild
                                                            >
                                                                <Link href="/finops/commitments">
                                                                    <Landmark className="size-3.5" />
                                                                    <span className="ml-1">{t.openCommitments}</span>
                                                                </Link>
                                                            </Button>
                                                        ) : null}
                                                    </div>
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
                        <span className="shrink-0 whitespace-nowrap">{tCommon.rowsPerPage}</span>
                        <Select
                            value={`${pageSize}`}
                            onValueChange={(value) => syncUrlState({ limit: Number(value), page: null })}
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
                            {t.pageOfPages
                                .replace('{page}', String(currentPage))
                                .replace('{pages}', String(totalPages))}
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

            <Card>
                <CardHeader className="gap-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <PiggyBank className="size-4" />
                        {t.realizedListTitle}
                    </CardTitle>
                    <CardDescription className="hidden sm:block">{t.totalSavedHint}</CardDescription>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                    {(realized?.items.length ?? 0) === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t.realizedListEmpty}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="min-w-0 px-4">{t.fieldResourceName}</TableHead>
                                        <TableHead className="px-4 text-right">{t.colSavingsMonth}</TableHead>
                                        <TableHead className="w-12 px-2 text-right sm:px-4">{t.colActions}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(realized?.items ?? []).map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell className="min-w-0 px-4">
                                                <p className="truncate text-sm font-medium">
                                                    {row.resourceNames.join(', ')}
                                                </p>
                                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                                    {row.description}
                                                </p>
                                                <p className="mt-1 text-[11px] text-muted-foreground">
                                                    {formatDate(row.executedAt, undefined, locale)} ·{' '}
                                                    {accountAliases[row.cloudAccountId] ?? row.cloudAccountId.slice(0, 8)}{' '}
                                                    · {row.provider}
                                                </p>
                                            </TableCell>
                                            <TableCell className="px-4 text-right align-top text-sm font-semibold tabular-nums text-emerald-600">
                                                {formatCurrency(row.monthlyAmount, row.currency)}
                                            </TableCell>
                                            <TableCell className="px-2 text-right align-top sm:px-4">
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8"
                                                    disabled={actionBusy}
                                                    aria-label={tCommon.delete}
                                                    onClick={() => void onDeleteRealized(row.id)}
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

<Drawer
                open={manualOpen}
                direction={formDirection}
                shouldScaleBackground={false}
                dismissible
                onOpenChange={(open) => {
                    setManualOpen(open);
                    if (!open) restoreBodyPointerEvents();
                }}
                {...(isBottomForm
                    ? {
                          snapPoints: [...SAVINGS_FORM_SNAP_POINTS],
                          activeSnapPoint: manualSnapPoint,
                          setActiveSnapPoint: setManualSnapPoint,
                      }
                    : {})}
            >
                <DrawerContent
                    className={cn(
                        'flex flex-col gap-0 overflow-hidden bg-background p-0',
                        isBottomForm
                            ? cn('h-full max-h-[100dvh]', isManualFullHeight ? 'rounded-none' : 'rounded-t-xl')
                            : 'h-full max-h-none w-full rounded-none sm:max-w-lg',
                    )}
                >
                    <DrawerHeader className="relative shrink-0 border-b px-4 py-3 pr-14 text-left">
                        <DrawerTitle>{t.registerSavingTitle}</DrawerTitle>
                        <DrawerDescription>{t.registerSavingDesc}</DrawerDescription>
                        <DrawerClose asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="absolute top-3 right-3"
                                aria-label={tCommon.close}
                            >
                                <X className="size-4" />
                            </Button>
                        </DrawerClose>
                    </DrawerHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                        <Form {...manualForm}>
                            <form
                                id="register-saving-form"
                                onSubmit={manualForm.handleSubmit(onManualSubmit)}
                                className="mx-auto grid w-full max-w-lg grid-cols-1 gap-5"
                            >
                                <FormField
                                    control={manualForm.control}
                                    name="cloudAccountId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fieldCloudAccount}</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue
                                                            placeholder={t.fieldCloudAccountPlaceholder}
                                                        />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {cloudAccounts.map((account) => (
                                                        <SelectItem key={account.id} value={account.id}>
                                                            {account.alias} ({account.provider})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription>{t.fieldCloudAccountHint}</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={manualForm.control}
                                    name="resourceName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fieldResourceName}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    autoComplete="off"
                                                    spellCheck={false}
                                                    placeholder={t.fieldResourceNamePlaceholder}
                                                />
                                            </FormControl>
                                            <FormDescription>{t.fieldResourceNameHint}</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={manualForm.control}
                                    name="monthlyAmount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fieldMonthlyAmount}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    inputMode="decimal"
                                                    step="0.01"
                                                    min="0"
                                                    placeholder={t.fieldMonthlyAmountPlaceholder}
                                                    value={
                                                        typeof field.value === 'number' &&
                                                        Number.isFinite(field.value)
                                                            ? field.value
                                                            : ''
                                                    }
                                                    onChange={(event) => {
                                                        const raw = event.target.value;
                                                        field.onChange(raw === '' ? undefined : Number(raw));
                                                    }}
                                                />
                                            </FormControl>
                                            <FormDescription>{t.fieldMonthlyAmountHint}</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={manualForm.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fieldDescription}</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    rows={3}
                                                    maxLength={4000}
                                                    placeholder={t.fieldDescriptionPlaceholder}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormDescription>{t.fieldDescriptionHint}</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={manualForm.control}
                                    name="executedAt"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fieldExecutedAt}</FormLabel>
                                            <FormControl>
                                                <DatePicker value={field.value} onChange={field.onChange} />
                                            </FormControl>
                                            <FormDescription>{t.fieldExecutedAtHint}</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </div>
                    <DrawerFooter
                        className={cn(
                            'shrink-0 border-t',
                            isBottomForm ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'flex flex-row justify-end gap-2',
                        )}
                    >
                        <Button
                            type="button"
                            variant="outline"
                            className={cn(isBottomForm && 'w-full')}
                            onClick={() => setManualOpen(false)}
                        >
                            {tCommon.cancel}
                        </Button>
                        <Button
                            type="submit"
                            form="register-saving-form"
                            className={cn(isBottomForm && 'w-full')}
                            isLoading={actionBusy || manualForm.formState.isSubmitting}
                        >
                            {tCommon.save}
                        </Button>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>

            <Drawer
                open={Boolean(realizeTarget)}
                direction={formDirection}
                shouldScaleBackground={false}
                dismissible
                onOpenChange={(open) => {
                    if (!open) {
                        setRealizeTarget(null);
                        restoreBodyPointerEvents();
                    }
                }}
                {...(isBottomForm
                    ? {
                          snapPoints: [...SAVINGS_FORM_SNAP_POINTS],
                          activeSnapPoint: realizeSnapPoint,
                          setActiveSnapPoint: setRealizeSnapPoint,
                      }
                    : {})}
            >
                <DrawerContent
                    className={cn(
                        'flex flex-col gap-0 overflow-hidden bg-background p-0',
                        isBottomForm
                            ? cn('h-full max-h-[100dvh]', isRealizeFullHeight ? 'rounded-none' : 'rounded-t-xl')
                            : 'h-full max-h-none w-full rounded-none sm:max-w-lg',
                    )}
                >
                    <DrawerHeader className="relative shrink-0 border-b px-4 py-3 pr-14 text-left">
                        <DrawerTitle>{t.realizeSavingTitle}</DrawerTitle>
                        <DrawerDescription>{t.totalSavedHint}</DrawerDescription>
                        <DrawerClose asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="absolute top-3 right-3"
                                aria-label={tCommon.close}
                            >
                                <X className="size-4" />
                            </Button>
                        </DrawerClose>
                    </DrawerHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                        <Form {...realizeForm}>
                            <form
                                id="realize-saving-form"
                                onSubmit={realizeForm.handleSubmit(onRealizeSubmit)}
                                className="mx-auto grid w-full max-w-lg grid-cols-1 gap-4"
                            >
                                <FormField
                                    control={realizeForm.control}
                                    name="monthlyAmount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fieldMonthlyAmount}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={field.value ?? ''}
                                                    onChange={(event) =>
                                                        field.onChange(
                                                            event.target.value === ''
                                                                ? undefined
                                                                : Number(event.target.value),
                                                        )
                                                    }
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={realizeForm.control}
                                    name="executedAt"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fieldExecutedAt}</FormLabel>
                                            <FormControl>
                                                <DatePicker value={field.value} onChange={field.onChange} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={realizeForm.control}
                                    name="description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fieldDescription}</FormLabel>
                                            <FormControl>
                                                <Textarea rows={3} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </div>
                    <DrawerFooter
                        className={cn(
                            'shrink-0 border-t',
                            isBottomForm ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'flex flex-row justify-end gap-2',
                        )}
                    >
                        <Button
                            type="button"
                            variant="outline"
                            className={cn(isBottomForm && 'w-full')}
                            onClick={() => setRealizeTarget(null)}
                        >
                            {tCommon.cancel}
                        </Button>
                        <Button
                            type="submit"
                            form="realize-saving-form"
                            className={cn(isBottomForm && 'w-full')}
                            isLoading={actionBusy || realizeForm.formState.isSubmitting}
                        >
                            {t.realizeSaving}
                        </Button>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        </div>
    );
}
