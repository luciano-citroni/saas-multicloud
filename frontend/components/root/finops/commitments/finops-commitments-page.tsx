'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Info,
    Landmark,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
    XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DatePicker, preventDismissOnDatePicker } from '@/components/ui/date-picker';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { FinopsFilterBar } from '@/components/root/finops/finops-filter-bar';
import {
    ACCOUNT_FILTER_ALL,
    PROVIDER_FILTER_ALL,
    buildFinopsQuery,
    parseFinopsUrlFilters,
} from '@/components/root/finops/finops-filter-utils';
import type { DashboardPeriod } from '@/components/root/finops/overview/types';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import {
    createFinopsCreditGrant,
    deleteFinopsCreditGrant,
    fetchFinopsCreditServices,
    fetchFinopsCommitmentsCredits,
    fetchFinopsCommitmentsOverview,
    fetchFinopsCommitmentsRecommendations,
    fetchFinopsCommitmentsUtilization,
    updateFinopsCreditGrant,
    type CreateCreditGrantPayload,
} from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { cn } from '@/lib/utils';
import { useTranslations, type Translations } from '@/lib/i18n';
import { formatDate } from '@/lib/i18n/format';
import { useLocale } from '@/components/providers/locale-provider';
import type { AppLocale } from '@/lib/locale';

type FinopsT = Record<keyof Translations['finops'], string>;

type CreditGrant = {
    id: string;
    cloudAccountId: string;
    provider: string;
    name: string;
    totalAmount: number;
    consumedAmount: number;
    remainingAmount: number;
    eligibleSpend: number;
    usageByService: { service: string; amount: number }[];
    usageSource: 'services' | 'credits' | 'provider';
    currency: string;
    startsAt: string;
    expiresAt: string | null;
    notes: string | null;
    services: string[];
    appliesToAllServices?: boolean;
    source?: 'manual' | 'imported';
    status: 'active' | 'expiring' | 'expired' | 'exhausted';
};

type CreditConsumption = {
    id: string;
    cloudAccountId: string;
    provider: string;
    amount: number;
    currency: string;
    date: string;
    label: string;
};

type UtilizationItem = {
    id: string;
    cloudAccountId: string;
    provider: string;
    commitmentType: 'savings_plan' | 'reservation' | 'cud';
    externalId: string;
    name: string | null;
    utilizationPercent: number | null;
    coveragePercent: number | null;
    usedCommitment: number | null;
    unusedCommitment: number | null;
    hourlyCommitment: number | null;
    monthlyCommitment: number | null;
    term: string | null;
    currency: string;
    syncedAt: string;
};

type RecommendationItem = {
    id: string;
    cloudAccountId: string;
    provider: string;
    commitmentType: 'savings_plan' | 'reservation' | 'cud';
    term: string | null;
    paymentOption: string | null;
    estimatedMonthlySavings: number | null;
    estimatedSavingsPercentage: number | null;
    recommendedHourlyCommitment: number | null;
    eligible: boolean;
    ineligibleReason: string | null;
    summary: string | null;
    currency: string;
};

type OverviewResponse = {
    credits: {
        totalGranted: number;
        totalRemaining: number;
        consumedInPeriod: number;
        expiringSoon: number;
        currency: string;
    };
    commitments: {
        avgUtilizationPercent: number | null;
        avgCoveragePercent: number | null;
        unusedCommitment: number | null;
        potentialMonthlySavings: number;
        canReserveMore: boolean;
        shouldNotReserveMore: boolean;
        eligibleRecommendations: number;
        snapshotCount: number;
        currency: string;
    };
};

const grantSchema = z.object({
    cloudAccountId: z.string().uuid('Conta obrigatória'),
    name: z.string().min(1, 'Nome é obrigatório'),
    totalAmount: z.number().positive('Valor deve ser positivo'),
    currency: z.string().min(3).max(10),
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    expiresAt: z.string().optional(),
    notes: z.string().max(2000).optional(),
    services: z.array(z.string().min(1)).min(1, 'Selecione ao menos um serviço'),
});

type GrantFormData = z.infer<typeof grantSchema>;

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
    } else if (period === 'lastmonth') {
        start.setUTCFullYear(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
        end.setUTCFullYear(today.getUTCFullYear(), today.getUTCMonth(), 0);
    } else {
        // ytd
        start.setUTCFullYear(today.getUTCFullYear(), 0, 1);
    }

    return {
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
    };
}

function pct(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
}

function commitmentTypeLabel(type: string, t: FinopsT): string {
    if (type === 'savings_plan') return t.commitmentsTypeSp;
    if (type === 'reservation') return t.commitmentsTypeReservation;
    if (type === 'cud') return t.commitmentsTypeCud;
    return type;
}

function statusLabel(status: CreditGrant['status'], t: FinopsT) {
    if (status === 'active') return t.creditsStatusActive;
    if (status === 'expiring') return t.creditsStatusExpiring;
    if (status === 'expired') return t.creditsStatusExpired;
    return t.creditsStatusExhausted;
}

function providerBadgeClass(provider: string) {
    const normalized = provider.trim().toLowerCase();
    if (normalized === 'aws') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    if (normalized === 'azure') return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    if (normalized === 'gcp') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    return 'border-border bg-muted text-muted-foreground';
}

function paymentLabel(option: string | null, t: FinopsT): string | null {
    if (!option) return null;
    const normalized = option.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (normalized === 'NO_UPFRONT') return t.paymentNoUpfront;
    if (normalized === 'PARTIAL_UPFRONT') return t.paymentPartialUpfront;
    if (normalized === 'ALL_UPFRONT') return t.paymentAllUpfront;
    return option.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

function paymentBadgeClass(option: string | null) {
    const normalized = (option ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (normalized === 'NO_UPFRONT') return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    if (normalized === 'PARTIAL_UPFRONT') return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300';
    if (normalized === 'ALL_UPFRONT') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    return 'border-border bg-muted text-muted-foreground';
}

function termLabel(term: string | null, t: FinopsT): string | null {
    if (!term) return null;
    const normalized = term.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (normalized === 'ONE_YEAR' || normalized === '1_YEAR' || normalized === 'P1Y') return t.termOneYear;
    if (normalized === 'THREE_YEARS' || normalized === '3_YEARS' || normalized === 'P3Y') return t.termThreeYears;
    return term.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

function termBadgeClass(term: string | null) {
    const normalized = (term ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (normalized === 'ONE_YEAR' || normalized === '1_YEAR' || normalized === 'P1Y') {
        return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
    }
    if (normalized === 'THREE_YEARS' || normalized === '3_YEARS' || normalized === 'P3Y') {
        return 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300';
    }
    return 'border-border bg-muted text-muted-foreground';
}

function TermBadge({ term, t }: { term: string | null; t: FinopsT }) {
    const label = termLabel(term, t);
    if (!label) return <span className="text-muted-foreground">—</span>;
    return (
        <Badge variant="outline" className={cn('border', termBadgeClass(term))}>
            {label}
        </Badge>
    );
}

function PaymentBadge({ option, t }: { option: string | null; t: FinopsT }) {
    const label = paymentLabel(option, t);
    if (!label) return <span className="text-muted-foreground">—</span>;
    return (
        <Badge variant="outline" className={cn('border', paymentBadgeClass(option))}>
            {label}
        </Badge>
    );
}

function ProviderBadge({ provider }: { provider: string }) {
    return (
        <Badge variant="outline" className={cn('border uppercase', providerBadgeClass(provider))}>
            {provider}
        </Badge>
    );
}

function formatCalendarDate(value: string | null | undefined, locale: AppLocale): string {
    if (!value) return '—';
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return formatDate(value, undefined, locale);
    return formatDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])), undefined, locale);
}

const CREDIT_PAGE_SIZES = [5, 10, 20, 30] as const;
type CreditListTab = 'active' | 'history';

function parseCreditTab(value: string | null): CreditListTab {
    return value === 'history' ? 'history' : 'active';
}

function creditPageSize(value: string | null): (typeof CREDIT_PAGE_SIZES)[number] {
    const parsed = Number(value);
    return CREDIT_PAGE_SIZES.includes(parsed as (typeof CREDIT_PAGE_SIZES)[number])
        ? (parsed as (typeof CREDIT_PAGE_SIZES)[number])
        : 10;
}

function isOpenGrant(status: CreditGrant['status']): boolean {
    return status === 'active' || status === 'expiring';
}

function statusClass(status: CreditGrant['status']) {
    if (status === 'active') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (status === 'expiring') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    if (status === 'expired') return 'bg-muted text-muted-foreground';
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
}

export function FinopsCommitmentsPage() {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');
    const { locale } = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);
    const periodDates = useMemo(() => resolvePeriodDates(urlFilters.period), [urlFilters.period]);
    const creditTab = parseCreditTab(searchParams.get('credits'));
    const creditsLimit = creditPageSize(searchParams.get('creditsLimit'));
    const creditsPage = Math.max(1, Number(searchParams.get('creditsPage')) || 1);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const midOrgId = useActiveMidOrgId(organizationId);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<OverviewResponse | null>(null);
    const [grants, setGrants] = useState<CreditGrant[]>([]);
    const [consumptions, setConsumptions] = useState<CreditConsumption[]>([]);
    const [utilization, setUtilization] = useState<UtilizationItem[]>([]);
    const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
    const [grantDialogOpen, setGrantDialogOpen] = useState(false);
    const [editingGrant, setEditingGrant] = useState<CreditGrant | null>(null);
    const [serviceOptions, setServiceOptions] = useState<string[]>([]);
    const [servicesLoading, setServicesLoading] = useState(false);
    const [serviceQuery, setServiceQuery] = useState('');
    const [expandedGrantId, setExpandedGrantId] = useState<string | null>(null);

    const form = useForm<GrantFormData>({
        resolver: zodResolver(grantSchema),
        defaultValues: {
            cloudAccountId: '',
            name: '',
            totalAmount: 0,
            currency: 'USD',
            startsAt: new Date().toISOString().slice(0, 10),
            expiresAt: '',
            notes: '',
            services: [],
        },
    });
    const watchedAccountId = form.watch('cloudAccountId');

    const updateUrl = useCallback(
        (patch: Partial<{ period: DashboardPeriod; account: string | null; provider: string | null }>) => {
            const query = buildFinopsQuery(searchParams, {
                period: patch.period ?? urlFilters.period,
                account: patch.account === undefined ? urlFilters.accountId : patch.account,
                provider: patch.provider === undefined ? urlFilters.provider : patch.provider,
            });
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams, urlFilters],
    );

    const setCreditList = useCallback(
        (patch: { tab?: CreditListTab; page?: number | null; limit?: number | null }) => {
            const params = new URLSearchParams(searchParams.toString());
            const tab = patch.tab ?? creditTab;
            if (tab === 'active') params.delete('credits');
            else params.set('credits', tab);

            const limit = patch.limit === undefined ? creditsLimit : patch.limit;
            if (!limit || limit === 10) params.delete('creditsLimit');
            else params.set('creditsLimit', String(limit));

            const page = patch.page === undefined ? creditsPage : patch.page;
            if (!page || page <= 1) params.delete('creditsPage');
            else params.set('creditsPage', String(page));

            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [creditTab, creditsLimit, creditsPage, pathname, router, searchParams],
    );

    const visibleGrants = useMemo(
        () =>
            grants.filter((grant) =>
                creditTab === 'history' ? !isOpenGrant(grant.status) : isOpenGrant(grant.status),
            ),
        [creditTab, grants],
    );
    const creditTotalPages = Math.max(1, Math.ceil(visibleGrants.length / creditsLimit));
    const creditCurrentPage = Math.min(creditsPage, creditTotalPages);
    const pagedGrants = visibleGrants.slice(
        (creditCurrentPage - 1) * creditsLimit,
        creditCurrentPage * creditsLimit,
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
        try {
            const res = await fetchOrganizationCloudAccounts(orgId, {
                midOrgId: activeMidOrgId ?? getActiveMidOrgId(orgId),
            });
            if (!res.ok) return;
            const body = (await res.json()) as OrganizationCloudAccount[] | { items?: OrganizationCloudAccount[] };
            setCloudAccounts(Array.isArray(body) ? body : (body.items ?? []));
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        if (!organizationId) return;
        void loadAccounts(organizationId, midOrgId);
    }, [organizationId, midOrgId, loadAccounts]);

    const loadData = useCallback(async () => {
        if (!organizationId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const filter = {
            cloudAccountId: urlFilters.accountId ?? undefined,
            provider: urlFilters.provider ?? undefined,
            periodStart: periodDates.periodStart,
            periodEnd: periodDates.periodEnd,
        };

        try {
            const [overviewRes, creditsRes, utilRes, recsRes] = await Promise.all([
                fetchFinopsCommitmentsOverview(organizationId, filter),
                fetchFinopsCommitmentsCredits(organizationId, filter),
                fetchFinopsCommitmentsUtilization(organizationId, filter),
                fetchFinopsCommitmentsRecommendations(organizationId, filter),
            ]);

            if (!overviewRes.ok || !creditsRes.ok || !utilRes.ok || !recsRes.ok) {
                const errBody = await (overviewRes.ok ? creditsRes : overviewRes).json().catch(() => ({}));
                toast.error(extractErrorMessage(errBody) || t.commitmentsLoadError);
                return;
            }

            const overviewBody = (await overviewRes.json()) as OverviewResponse;
            const creditsBody = (await creditsRes.json()) as {
                grants: CreditGrant[];
                consumptions: CreditConsumption[];
            };
            const utilBody = (await utilRes.json()) as { items: UtilizationItem[] };
            const recsBody = (await recsRes.json()) as { items: RecommendationItem[] };

            setOverview(overviewBody);
            setGrants(creditsBody.grants ?? []);
            setConsumptions(creditsBody.consumptions ?? []);
            setUtilization(utilBody.items ?? []);
            setRecommendations(recsBody.items ?? []);
        } catch {
            toast.error(t.commitmentsLoadError);
        } finally {
            setLoading(false);
        }
    }, [organizationId, urlFilters.accountId, urlFilters.provider, periodDates, t.commitmentsLoadError]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!grantDialogOpen || !organizationId || !watchedAccountId) {
            setServiceOptions([]);
            return;
        }

        let cancelled = false;
        setServicesLoading(true);
        void fetchFinopsCreditServices(organizationId, watchedAccountId)
            .then(async (response) => {
                const body = (await response.json().catch(() => ({}))) as { services?: string[] };
                if (cancelled) return;
                setServiceOptions(response.ok ? (body.services ?? []) : []);
            })
            .catch(() => {
                if (!cancelled) setServiceOptions([]);
            })
            .finally(() => {
                if (!cancelled) setServicesLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [grantDialogOpen, organizationId, watchedAccountId]);

    const openCreateGrant = () => {
        setEditingGrant(null);
        form.reset({
            cloudAccountId: urlFilters.accountId ?? cloudAccounts[0]?.id ?? '',
            name: '',
            totalAmount: 0,
            currency: 'USD',
            startsAt: new Date().toISOString().slice(0, 10),
            expiresAt: '',
            notes: '',
            services: [],
        });
        setServiceQuery('');
        setGrantDialogOpen(true);
    };

    const openEditGrant = (grant: CreditGrant) => {
        setEditingGrant(grant);
        form.reset({
            cloudAccountId: grant.cloudAccountId,
            name: grant.name,
            totalAmount: grant.totalAmount,
            currency: grant.currency,
            startsAt: grant.startsAt,
            expiresAt: grant.expiresAt ?? '',
            notes: grant.notes ?? '',
            services: grant.services ?? [],
        });
        setServiceQuery('');
        setGrantDialogOpen(true);
    };

    const onSubmitGrant = async (data: GrantFormData) => {
        if (!organizationId) return;
        const payload: CreateCreditGrantPayload = {
            cloudAccountId: data.cloudAccountId,
            name: data.name,
            totalAmount: data.totalAmount,
            currency: data.currency || 'USD',
            startsAt: data.startsAt,
            expiresAt: data.expiresAt ? data.expiresAt : null,
            notes: data.notes?.trim() || null,
            services: data.services,
        };

        const response = editingGrant
            ? await updateFinopsCreditGrant(organizationId, editingGrant.id, {
                  name: payload.name,
                  totalAmount: payload.totalAmount,
                  currency: payload.currency,
                  startsAt: payload.startsAt,
                  expiresAt: payload.expiresAt,
                  notes: payload.notes,
                  services: payload.services,
              })
            : await createFinopsCreditGrant(organizationId, payload);

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            toast.error(extractErrorMessage(body) || t.creditsGrantSaveError);
            return;
        }

        toast.success(t.creditsGrantSaved);
        setGrantDialogOpen(false);
        await loadData();
    };

    const onDeleteGrant = async (grant: CreditGrant) => {
        if (!organizationId) return;
        if (!window.confirm(t.creditsGrantDeleteConfirm)) return;
        const response = await deleteFinopsCreditGrant(organizationId, grant.id);
        if (!response.ok && response.status !== 204) {
            const body = await response.json().catch(() => ({}));
            toast.error(extractErrorMessage(body) || t.creditsGrantDeleteError);
            return;
        }
        toast.success(t.creditsGrantDeleted);
        await loadData();
    };

    const accountAlias = useCallback(
        (id: string) => cloudAccounts.find((a) => a.id === id)?.alias ?? id.slice(0, 8),
        [cloudAccounts],
    );

    if (!organizationId) {
        return (
            <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
                <FinopsSubnav />
                <Card>
                    <CardHeader>
                        <CardTitle>{t.selectOrgTitle}</CardTitle>
                        <CardDescription>{t.selectOrgDesc}</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    if (loading && !overview) {
        return (
            <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
                <FinopsSubnav />
                <FinopsLoadingSkeleton />
            </div>
        );
    }

    const credits = overview?.credits;
    const commitments = overview?.commitments;

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Landmark className="size-5 text-muted-foreground" />
                        <h1 className="text-xl font-semibold tracking-tight">{t.commitmentsTitle}</h1>
                    </div>
                    <p className="max-w-2xl text-sm text-muted-foreground">{t.commitmentsDesc}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadData()} isLoading={loading}>
                    <RefreshCw className="size-3.5" />
                    {tCommon.refresh}
                </Button>
            </div>

            <FinopsSubnav />

            <FinopsFilterBar
                period={urlFilters.period}
                accountId={urlFilters.accountId}
                provider={urlFilters.provider}
                service={null}
                cloudAccounts={cloudAccounts}
                serviceOptions={[]}
                onPeriodChange={(period) => updateUrl({ period })}
                onAccountChange={(account) => updateUrl({ account })}
                onProviderChange={(provider) => updateUrl({ provider })}
                onServiceChange={() => undefined}
                onClear={() =>
                    updateUrl({
                        period: 'lastmonth',
                        account: ACCOUNT_FILTER_ALL,
                        provider: PROVIDER_FILTER_ALL,
                    })
                }
            />

            {/* Credits KPIs */}
            <section className="space-y-3">
                <div>
                    <h2 className="text-base font-semibold">{t.creditsSectionTitle}</h2>
                    <p className="text-sm text-muted-foreground">{t.creditsSectionDesc}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        label={t.creditsTotalGranted}
                        value={formatCurrency(credits?.totalGranted ?? 0, credits?.currency)}
                    />
                    <KpiCard
                        label={t.creditsConsumedPeriod}
                        value={formatCurrency(credits?.consumedInPeriod ?? 0, credits?.currency)}
                    />
                    <KpiCard
                        label={t.creditsRemaining}
                        value={formatCurrency(credits?.totalRemaining ?? 0, credits?.currency)}
                    />
                    <KpiCard label={t.creditsExpiringSoon} value={String(credits?.expiringSoon ?? 0)} />
                </div>

                <Card>
                    <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <CardTitle className="text-base">{t.creditsGrantsTitle}</CardTitle>
                            <Tabs
                                value={creditTab}
                                onValueChange={(value) => {
                                    setExpandedGrantId(null);
                                    setCreditList({
                                        tab: value === 'history' ? 'history' : 'active',
                                        page: null,
                                    });
                                }}
                            >
                                <TabsList>
                                    <TabsTrigger value="active">{t.creditsTabActive}</TabsTrigger>
                                    <TabsTrigger value="history">{t.creditsTabHistory}</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        <Button size="sm" onClick={openCreateGrant}>
                            <Plus className="size-3.5" />
                            {t.creditsAddGrant}
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {visibleGrants.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {creditTab === 'history'
                                    ? t.creditsNoHistoryGrants
                                    : grants.length === 0
                                      ? t.creditsNoGrants
                                      : t.creditsNoActiveGrants}
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t.creditsGrantName}</TableHead>
                                        <TableHead>{t.providerLabel}</TableHead>
                                        <TableHead>{t.creditsGrantAccount}</TableHead>
                                        <TableHead>{t.creditsGrantServices}</TableHead>
                                        <TableHead>{t.creditsGrantAmount}</TableHead>
                                        <TableHead>{t.creditsGrantUsed}</TableHead>
                                        <TableHead>{t.creditsRemaining}</TableHead>
                                        <TableHead>{t.creditsGrantStartsAt}</TableHead>
                                        <TableHead>{t.creditsGrantExpiresAt}</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-[90px]" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pagedGrants.map((grant) => {
                                        const services = grant.services ?? [];
                                        const expanded = expandedGrantId === grant.id;
                                        return (
                                        <Fragment key={grant.id}>
                                        <TableRow>
                                            <TableCell className="font-medium">{grant.name}</TableCell>
                                            <TableCell>
                                                <ProviderBadge provider={grant.provider} />
                                            </TableCell>
                                            <TableCell>{accountAlias(grant.cloudAccountId)}</TableCell>
                                            <TableCell>
                                                <ServiceToggle
                                                    services={services}
                                                    appliesToAll={grant.appliesToAllServices === true}
                                                    expanded={expanded}
                                                    allLabel={t.creditsGrantAllServices}
                                                    countLabel={t.creditsGrantServicesCount}
                                                    onToggle={() =>
                                                        setExpandedGrantId((current) =>
                                                            current === grant.id ? null : grant.id,
                                                        )
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {formatCurrency(grant.totalAmount, grant.currency)}
                                            </TableCell>
                                            <TableCell>
                                                <GrantUsageCell grant={grant} t={t} />
                                            </TableCell>
                                            <TableCell>
                                                {formatCurrency(grant.remainingAmount, grant.currency)}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap tabular-nums">
                                                {formatCalendarDate(grant.startsAt, locale)}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap tabular-nums">
                                                {formatCalendarDate(grant.expiresAt, locale)}
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={cn(
                                                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                                        statusClass(grant.status),
                                                    )}
                                                >
                                                    {statusLabel(grant.status, t)}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {grant.source === 'imported' ? null : (
                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            onClick={() => openEditGrant(grant)}
                                                            aria-label={t.creditsEditGrant}
                                                        >
                                                            <Pencil className="size-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            onClick={() => void onDeleteGrant(grant)}
                                                            aria-label={t.creditsDeleteGrant}
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                        {expanded ? (
                                            <TableRow>
                                                <TableCell colSpan={11} className="bg-muted/30 p-4">
                                                    <GrantProductsTable
                                                        services={services}
                                                        appliesToAll={grant.appliesToAllServices === true}
                                                        title={t.creditsGrantProductsTitle}
                                                        allLabel={t.creditsGrantAllServices}
                                                        emptyLabel={t.creditsGrantProductsEmpty}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ) : null}
                                        </Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                        {visibleGrants.length > 0 ? (
                            <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-end sm:gap-6">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <span className="shrink-0 whitespace-nowrap">{tCommon.rowsPerPage}</span>
                                    <Select
                                        value={String(creditsLimit)}
                                        onValueChange={(value) => setCreditList({ limit: Number(value), page: null })}
                                    >
                                        <SelectTrigger className="h-8 min-w-22">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CREDIT_PAGE_SIZES.map((size) => (
                                                <SelectItem key={size} value={String(size)}>
                                                    {size}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <span className="text-sm font-medium">
                                    {t.pageOfPages
                                        .replace('{page}', String(creditCurrentPage))
                                        .replace('{pages}', String(creditTotalPages))}
                                </span>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={creditCurrentPage <= 1}
                                        onClick={() => setCreditList({ page: 1 })}
                                        aria-label={t.firstPage}
                                    >
                                        <ChevronsLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={creditCurrentPage <= 1}
                                        onClick={() => setCreditList({ page: creditCurrentPage - 1 })}
                                        aria-label={t.previousPage}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={creditCurrentPage >= creditTotalPages}
                                        onClick={() => setCreditList({ page: creditCurrentPage + 1 })}
                                        aria-label={t.nextPage}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={creditCurrentPage >= creditTotalPages}
                                        onClick={() => setCreditList({ page: creditTotalPages })}
                                        aria-label={t.lastPage}
                                    >
                                        <ChevronsRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{t.creditsConsumptionTitle}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {consumptions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t.creditsNoConsumption}</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>{t.creditsGrantAccount}</TableHead>
                                        <TableHead>Label</TableHead>
                                        <TableHead>{t.creditsConsumedPeriod}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {consumptions.slice(0, 30).map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell>{row.date}</TableCell>
                                            <TableCell>
                                                <span className="text-xs uppercase text-muted-foreground">
                                                    {row.provider}
                                                </span>{' '}
                                                {accountAlias(row.cloudAccountId)}
                                            </TableCell>
                                            <TableCell>{row.label}</TableCell>
                                            <TableCell>
                                                {formatCurrency(row.amount, row.currency)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </section>

            {/* Commitments */}
            <section className="space-y-3">
                <div>
                    <h2 className="text-base font-semibold">{t.commitmentsSectionTitle}</h2>
                    <p className="text-sm text-muted-foreground">{t.commitmentsSectionDesc}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MeterCard
                        label={t.commitmentsUtilization}
                        valueLabel={pct(commitments?.avgUtilizationPercent)}
                        percent={commitments?.avgUtilizationPercent}
                        tone={
                            commitments?.avgUtilizationPercent == null
                                ? 'neutral'
                                : commitments.avgUtilizationPercent >= 80
                                  ? 'good'
                                  : commitments.avgUtilizationPercent < 60
                                    ? 'warn'
                                    : 'neutral'
                        }
                    />
                    <MeterCard
                        label={t.commitmentsCoverage}
                        valueLabel={pct(commitments?.avgCoveragePercent)}
                        percent={commitments?.avgCoveragePercent}
                        tone={
                            commitments?.avgCoveragePercent == null
                                ? 'neutral'
                                : commitments.avgCoveragePercent >= 50
                                  ? 'good'
                                  : 'warn'
                        }
                    />
                    <KpiCard
                        label={t.commitmentsUnused}
                        value={
                            commitments?.unusedCommitment != null
                                ? formatCurrency(commitments.unusedCommitment, commitments.currency)
                                : '—'
                        }
                    />
                    <KpiCard
                        label={t.commitmentsPotentialSavings}
                        value={formatCurrency(
                            commitments?.potentialMonthlySavings ?? 0,
                            commitments?.currency,
                        )}
                    />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <Card
                        className={cn(
                            commitments?.canReserveMore &&
                                'border-emerald-500/40 bg-emerald-500/5',
                        )}
                    >
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <CheckCircle2 className="size-4 text-emerald-600" />
                                {t.commitmentsCanReserveMore}
                            </CardTitle>
                            <CardDescription>{t.commitmentsCanReserveHint}</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm">
                            {commitments?.canReserveMore
                                ? `${commitments.eligibleRecommendations} ${t.commitmentsEligible.toLowerCase()}`
                                : '—'}
                        </CardContent>
                    </Card>
                    <Card
                        className={cn(
                            commitments?.shouldNotReserveMore &&
                                'border-amber-500/40 bg-amber-500/5',
                        )}
                    >
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <XCircle className="size-4 text-amber-600" />
                                {t.commitmentsShouldNotReserveMore}
                            </CardTitle>
                            <CardDescription>{t.commitmentsShouldNotReserveHint}</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm">
                            {commitments?.shouldNotReserveMore ? pct(commitments.avgUtilizationPercent) : '—'}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{t.commitmentsSnapshotsTitle}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {utilization.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t.commitmentsNoSnapshots}</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t.providerLabel}</TableHead>
                                        <TableHead>{t.creditsGrantAccount}</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>{t.commitmentsUtilization}</TableHead>
                                        <TableHead>{t.commitmentsCoverage}</TableHead>
                                        <TableHead>{t.commitmentsUnused}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {utilization.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell>
                                                <ProviderBadge provider={row.provider} />
                                            </TableCell>
                                            <TableCell>{accountAlias(row.cloudAccountId)}</TableCell>
                                            <TableCell>
                                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">
                                                    {commitmentTypeLabel(row.commitmentType, t)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="max-w-[220px] truncate">
                                                {row.name ?? row.externalId}
                                            </TableCell>
                                            <TableCell>{pct(row.utilizationPercent)}</TableCell>
                                            <TableCell>{pct(row.coveragePercent)}</TableCell>
                                            <TableCell>
                                                {row.unusedCommitment != null
                                                    ? formatCurrency(row.unusedCommitment, row.currency)
                                                    : '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">{t.commitmentsRecsTitle}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {recommendations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t.commitmentsNoRecs}</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t.providerLabel}</TableHead>
                                        <TableHead>{t.creditsGrantAccount}</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>{t.commitmentsTerm}</TableHead>
                                        <TableHead>{t.commitmentsPayment}</TableHead>
                                        <TableHead>{t.commitmentsEstSavings}</TableHead>
                                        <TableHead>
                                            <span className="inline-flex items-center gap-1">
                                                {t.commitmentsHourly}
                                                <HoverCard openDelay={200}>
                                                    <HoverCardTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                                                            aria-label={t.commitmentsHourlyHelp}
                                                        >
                                                            <Info className="size-3.5" />
                                                        </button>
                                                    </HoverCardTrigger>
                                                    <HoverCardContent className="w-72 text-left text-xs leading-relaxed font-normal">
                                                        {t.commitmentsHourlyHelp}
                                                    </HoverCardContent>
                                                </HoverCard>
                                            </span>
                                        </TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recommendations.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell>
                                                <ProviderBadge provider={row.provider} />
                                            </TableCell>
                                            <TableCell>{accountAlias(row.cloudAccountId)}</TableCell>
                                            <TableCell>
                                                {commitmentTypeLabel(row.commitmentType, t)}
                                            </TableCell>
                                            <TableCell>
                                                <TermBadge term={row.term} t={t} />
                                            </TableCell>
                                            <TableCell>
                                                <PaymentBadge option={row.paymentOption} t={t} />
                                            </TableCell>
                                            <TableCell>
                                                {row.estimatedMonthlySavings != null
                                                    ? formatCurrency(
                                                          row.estimatedMonthlySavings,
                                                          row.currency,
                                                      )
                                                    : '—'}
                                            </TableCell>
                                            <TableCell>
                                                {row.recommendedHourlyCommitment != null
                                                    ? formatCurrency(
                                                          row.recommendedHourlyCommitment,
                                                          row.currency,
                                                      )
                                                    : '—'}
                                            </TableCell>
                                            <TableCell className="w-64 max-w-64 whitespace-normal align-top">
                                                {row.eligible ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                                        <CheckCircle2 className="size-3.5 shrink-0" />
                                                        {t.commitmentsEligible}
                                                    </span>
                                                ) : (
                                                    <div className="space-y-0.5">
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                                                            <XCircle className="size-3.5 shrink-0" />
                                                            {t.commitmentsIneligible}
                                                        </span>
                                                        {row.ineligibleReason && (
                                                            <p className="text-xs break-words text-muted-foreground">
                                                                {row.ineligibleReason}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </section>

            <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
                <DialogContent
                    className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
                    onInteractOutside={preventDismissOnDatePicker}
                    onPointerDownOutside={preventDismissOnDatePicker}
                    onFocusOutside={preventDismissOnDatePicker}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {editingGrant ? t.creditsEditGrant : t.creditsAddGrant}
                        </DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmitGrant)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="cloudAccountId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t.creditsGrantAccount}</FormLabel>
                                        <Select
                                            value={field.value}
                                            onValueChange={(value) => {
                                                field.onChange(value);
                                                if (!editingGrant) form.setValue('services', []);
                                            }}
                                            disabled={Boolean(editingGrant)}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={t.creditsGrantAccount} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {cloudAccounts.map((account) => (
                                                    <SelectItem key={account.id} value={account.id}>
                                                        {account.provider.toUpperCase()} — {account.alias}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t.creditsGrantName}</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="totalAmount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.creditsGrantAmount}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={Number.isFinite(field.value) ? field.value : ''}
                                                    onChange={(event) => {
                                                        const next = event.target.valueAsNumber;
                                                        field.onChange(Number.isFinite(next) ? next : 0);
                                                    }}
                                                    onBlur={field.onBlur}
                                                    name={field.name}
                                                    ref={field.ref}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="currency"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Currency</FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="startsAt"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.creditsGrantStartsAt}</FormLabel>
                                            <DatePicker
                                                name={field.name}
                                                value={field.value}
                                                onChange={field.onChange}
                                                onBlur={field.onBlur}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="expiresAt"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.creditsGrantExpiresAt}</FormLabel>
                                            <DatePicker
                                                name={field.name}
                                                value={field.value}
                                                onChange={field.onChange}
                                                onBlur={field.onBlur}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={form.control}
                                name="services"
                                render={({ field }) => {
                                    const query = serviceQuery.trim().toLowerCase();
                                    const options = [...new Set([...(field.value ?? []), ...serviceOptions])]
                                        .filter((service) => service.toLowerCase().includes(query))
                                        .sort((left, right) => left.localeCompare(right));
                                    return (
                                        <FormItem>
                                            <FormLabel>{t.creditsGrantServices}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    value={serviceQuery}
                                                    onChange={(event) => setServiceQuery(event.target.value)}
                                                    placeholder={t.creditsGrantServicesSearch}
                                                />
                                            </FormControl>
                                            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                                                {servicesLoading ? (
                                                    <p className="px-1 py-2 text-sm text-muted-foreground">
                                                        {tCommon.loading}
                                                    </p>
                                                ) : options.length === 0 ? (
                                                    <p className="px-1 py-2 text-sm text-muted-foreground">
                                                        {serviceOptions.length === 0
                                                            ? t.creditsGrantServicesEmpty
                                                            : '—'}
                                                    </p>
                                                ) : (
                                                    options.map((service) => {
                                                        const checked = field.value.includes(service);
                                                        return (
                                                            <label
                                                                key={service}
                                                                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/60"
                                                            >
                                                                <Checkbox
                                                                    checked={checked}
                                                                    onCheckedChange={(value) => {
                                                                        field.onChange(
                                                                            value === true
                                                                                ? [...field.value, service]
                                                                                : field.value.filter(
                                                                                      (item) => item !== service,
                                                                                  ),
                                                                        );
                                                                    }}
                                                                />
                                                                <span className="truncate">{service}</span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {t.creditsGrantServicesHint}
                                            </p>
                                            <FormMessage />
                                        </FormItem>
                                    );
                                }}
                            />
                            <FormField
                                control={form.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t.creditsGrantNotes}</FormLabel>
                                        <FormControl>
                                            <Textarea rows={3} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setGrantDialogOpen(false)}
                                >
                                    {tCommon.cancel}
                                </Button>
                                <Button type="submit" isLoading={form.formState.isSubmitting}>
                                    {tCommon.save}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ServiceToggle({
    services,
    appliesToAll = false,
    expanded,
    allLabel,
    countLabel,
    onToggle,
}: {
    services: string[];
    appliesToAll?: boolean;
    expanded: boolean;
    allLabel: string;
    countLabel: string;
    onToggle: () => void;
}) {
    if (!appliesToAll && services.length === 0) {
        return <span className="text-muted-foreground">—</span>;
    }
    const label = appliesToAll ? allLabel : countLabel.replace('{count}', String(services.length));
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 font-normal"
            aria-expanded={expanded}
            onClick={onToggle}
        >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {label}
        </Button>
    );
}

function GrantProductsTable({
    services,
    appliesToAll,
    title,
    allLabel,
    emptyLabel,
}: {
    services: string[];
    appliesToAll: boolean;
    title: string;
    allLabel: string;
    emptyLabel: string;
}) {
    if (appliesToAll && services.length === 0) {
        return <p className="text-sm text-muted-foreground">{allLabel}</p>;
    }
    if (services.length === 0) {
        return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
    }
    return (
        <div className="max-h-72 overflow-auto rounded-md border bg-background">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>{title}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {services.map((service, index) => (
                        <TableRow key={`${index}-${service}`}>
                            <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>{service}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function GrantUsageCell({ grant, t }: { grant: CreditGrant; t: FinopsT }) {
    const rows = grant.usageByService ?? [];
    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
                <button
                    type="button"
                    className="tabular-nums underline decoration-dotted underline-offset-4"
                >
                    {formatCurrency(grant.consumedAmount, grant.currency)}
                </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80 text-left text-xs leading-relaxed font-normal">
                <p className="font-medium">{t.creditsGrantUsageTitle}</p>
                <p className="mt-1 text-muted-foreground">
                    {grant.usageSource === 'provider'
                        ? t.creditsGrantUsageFromProvider
                        : grant.usageSource === 'services'
                          ? t.creditsGrantServicesHint
                          : t.creditsGrantUsageFromBills}
                </p>
                {grant.usageSource === 'services' && rows.length === 0 ? (
                    <p className="mt-2 text-muted-foreground">{t.creditsGrantUsageEmpty}</p>
                ) : rows.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                        {rows.map((row) => (
                            <li key={row.service} className="flex justify-between gap-3">
                                <span className="truncate">{row.service}</span>
                                <span className="shrink-0 tabular-nums">
                                    {formatCurrency(row.amount, grant.currency)}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : null}
                {grant.usageSource === 'services' ? (
                    <p className="mt-2 text-muted-foreground">
                        {t.creditsGrantUsageEligible}: {formatCurrency(grant.eligibleSpend ?? 0, grant.currency)}
                    </p>
                ) : null}
                {grant.usageSource === 'services' && (grant.eligibleSpend ?? 0) > grant.totalAmount ? (
                    <p className="mt-1 text-muted-foreground">{t.creditsGrantUsageCapped}</p>
                ) : null}
            </HoverCardContent>
        </HoverCard>
    );
}

function KpiCard({ label, value }: { label: string; value: string }) {
    return (
        <Card className="justify-between gap-3">
            <CardHeader className="pb-0">
                <CardDescription className="text-xs font-medium">{label}</CardDescription>
                <CardTitle className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0" />
        </Card>
    );
}

function MeterCard({
    label,
    valueLabel,
    percent,
    tone = 'neutral',
}: {
    label: string;
    valueLabel: string;
    percent: number | null | undefined;
    tone?: 'neutral' | 'good' | 'warn';
}) {
    const value = percent != null && Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    return (
        <Card className="justify-between gap-3">
            <CardHeader className="pb-0">
                <CardDescription className="text-xs font-medium">{label}</CardDescription>
                <CardTitle className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{valueLabel}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <Progress
                    value={value}
                    className={cn(
                        'h-2',
                        tone === 'good' && '[&_[data-slot=progress-indicator]]:bg-emerald-600',
                        tone === 'warn' && '[&_[data-slot=progress-indicator]]:bg-amber-500',
                    )}
                />
            </CardContent>
        </Card>
    );
}
