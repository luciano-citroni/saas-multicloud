'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileText, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
    Bar,
    BarChart,
    CartesianGrid,
    LabelList,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import {
    fetchCommercialReport,
    sendCommercialReport,
} from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { CommercialReportDelivery } from '@/components/root/finops/commercial/commercial-report-delivery';
import { CommercialFinancePanels } from '@/components/root/finops/commercial/commercial-finance-panels';
import { commercialProjectionDetail } from '@/components/root/finops/commercial/projection-detail';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import {
    FINOPS_CHART_COLORS,
    FINOPS_CHART_GRID,
    FINOPS_CHART_PRIMARY,
    finopsChartInitialDimension,
    finopsChartTickProps,
    finopsChartTooltipStyles,
} from '@/components/root/finops/overview/finops-chart-theme';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLocale } from '@/components/providers/locale-provider';
import { useIsBelowLg } from '@/hooks/use-mobile';
import { collapseResourceLabels } from '@/lib/finops/resource-label';
import { friendlyServiceLabel } from '@/lib/finops/service-label';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { toIntlLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/lib/locale';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';

type Point = { date: string; cost: number };
type NamedAmount = { name: string; amount: number; alternate?: string };
type ViewCurrency = 'USD' | 'BRL';

export type CommercialReport = {
    organizationName: string;
    generatedAt: string;
    referenceMonth: string;
    months: Array<{ key: string; days: number }>;
    sourceCurrency: string;
    displayCurrency: string;
    exchangeRate: number | null;
    previousExchangeRate: number | null;
    exchangeRateChangePct: number | null;
    providers: string[];
    kpis: {
        totalCost: number;
        totalChangePct: number | null;
        avgDailyCost: number;
        avgDailyChangePct: number | null;
        previousAvgDaily: number;
        daysInMonth: number;
        accountsWithSpend: number;
        accountsTotal: number;
        projection: number | null;
        projectionBaseDays: number;
        projectionMonth: string;
        projectionSource?: 'provider' | 'mixed' | 'linear';
        otherCurrencyTotal: number | null;
    };
    totalEvolution: Array<{ month: string; cost: number; changePct: number | null }>;
    avgDailyEvolution: Array<{ month: string; avg: number; changePct: number | null }>;
    accountEvolution: Array<{ accountId: string; alias: string; costs: number[] }>;
    subscriptionTable: Array<{
        accountId: string;
        alias: string;
        costs: number[];
        change12: number | null;
        change23: number | null;
    }>;
    dailyPrevious: Point[];
    dailyReference: Point[];
    inProgress: {
        month: string;
        points: Point[];
        omittedDays: number;
        projection: number | null;
        baseDays: number;
    };
    reductions: NamedAmount[];
    reductionSum: number;
    increases: NamedAmount[];
    increaseSum: number;
    topServices: Array<{ service: string; cost: number }>;
    topResources: Array<{ name: string; cost: number }>;
    costByAccount: Array<{ accountId: string; alias: string; cost: number }>;
    accountByService: {
        services: string[];
        rows: Array<{ accountId: string; alias: string; costs: number[] }>;
    };
    anomalies: {
        total: number;
        acknowledged: number;
        items: Array<{
            service: string;
            accountAlias: string;
            provider: string;
            date: string;
            severity: 'low' | 'medium' | 'high' | 'critical';
            status: 'open' | 'acknowledged' | 'resolved';
            impact: number;
        }>;
    };
    credits: {
        hasCredits: boolean;
        granted: number;
        consumed: number;
        remaining: number;
        deductedFromTotal?: false;
    };
    commitments: {
        hasData: boolean;
        avgUtilizationPercent: number | null;
        avgCoveragePercent: number | null;
        unusedCommitment: number | null;
        potentialMonthlySavings: number | null;
        savingsPlanCount: number;
        reservationCount: number;
        cudCount: number;
    };
    delivery: {
        enabled: boolean;
        emails: string[];
        alertChannels?: Array<'email' | 'whatsapp'>;
        alertNotificationGroupIds?: string[];
        currency?: 'USD' | 'BRL';
        lastSentAt: string | null;
    };
};

function closedMonths(count = 18): string[] {
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    const [year, month] = today.slice(0, 7).split('-').map(Number);
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(Date.UTC(year, month - 1 - (index + 1), 1));
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    });
}

function monthTitle(month: string, locale: string): string {
    const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${month}-01T12:00:00Z`),
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatPct(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

function Variation({ value }: { value: number | null }) {
    const text = formatPct(value);
    if (value == null) return <span>{text}</span>;
    return <span className={value < 0 ? 'text-emerald-600' : value > 0 ? 'text-red-600' : undefined}>{text}</span>;
}

function ChartCard({
    title,
    description,
    span = 'half',
    group = 'after',
    contentClassName,
    children,
}: {
    title: string;
    description?: string;
    span?: 'half' | 'third' | 'full';
    group?: 'before' | 'after';
    contentClassName?: string;
    children: React.ReactNode;
}) {
    return (
        <Card data-pdf-chart="" data-pdf-span={span} data-pdf-group={group} className="min-w-0 break-inside-avoid">
            <CardHeader className="gap-1.5">
                <CardTitle className="text-base text-balance">{title}</CardTitle>
                {description ? <CardDescription className="text-pretty">{description}</CardDescription> : null}
            </CardHeader>
            <CardContent className={cn('min-w-0', contentClassName ?? 'h-64 lg:h-72')}>{children}</CardContent>
        </Card>
    );
}

function parseViewCurrency(value: string | null): ViewCurrency {
    return value === 'USD' ? 'USD' : 'BRL';
}

export function CommercialReportPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tf = useTranslations('finops');
    const tc = useTranslations('common');
    const { locale } = useLocale();
    const intl = toIntlLocale(locale);
    const months = useMemo(() => closedMonths(), []);
    const monthParam = searchParams.get('month');
    const selectedMonth = monthParam && months.includes(monthParam) ? monthParam : months[0];
    const viewCurrency = parseViewCurrency(searchParams.get('currency'));

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const midOrgId = useActiveMidOrgId(organizationId);
    const { currentRole: rawRole } = useOrganizationFromSidebar(organizationId);
    const canManage = hasRequiredOrganizationRole(normalizeOrganizationRole(rawRole), 'MEMBER');
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [accountsReady, setAccountsReady] = useState(false);
    const [report, setReport] = useState<CommercialReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const scopedAccountIds = useMemo(() => cloudAccounts.map((account) => account.id), [cloudAccounts]);

    const updateFilters = useCallback(
        (patch: { month?: string; currency?: ViewCurrency }) => {
            const params = new URLSearchParams(searchParams.toString());
            const nextMonth = patch.month ?? selectedMonth;
            if (nextMonth) params.set('month', nextMonth);
            const nextCurrency = patch.currency ?? viewCurrency;
            params.set('currency', nextCurrency);
            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams, selectedMonth, viewCurrency],
    );

    useEffect(() => {
        const read = () => setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        read();
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, read);
        window.addEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, read);
        window.addEventListener('storage', read);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, read);
            window.removeEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, read);
            window.removeEventListener('storage', read);
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
            setCloudAccounts(items);
        } catch {
            setCloudAccounts([]);
        } finally {
            setAccountsReady(true);
        }
    }, []);

    useEffect(() => {
        if (!organizationId) return;
        void loadAccounts(organizationId, midOrgId);
    }, [organizationId, midOrgId, loadAccounts]);

    useEffect(() => {
        const hasValidMonth = Boolean(monthParam && months.includes(monthParam));
        const hasCurrency = searchParams.get('currency') === 'USD' || searchParams.get('currency') === 'BRL';
        if (hasValidMonth && hasCurrency) return;
        updateFilters({
            month: selectedMonth,
            currency: viewCurrency,
        });
    }, [monthParam, months, searchParams, selectedMonth, updateFilters, viewCurrency]);

    const load = useCallback(async () => {
        if (!organizationId || !selectedMonth || !accountsReady) return;
        setLoading(true);
        try {
            if (scopedAccountIds.length === 0) {
                setReport(null);
                return;
            }
            const response = await fetchCommercialReport(organizationId, selectedMonth, {
                cloudAccountIds: scopedAccountIds,
            });
            const payload = await response.json().catch(() => null);
            if (response.status === 401) {
                toast.error(tc.sessionExpired);
                router.replace('/auth/sign-in');
                return;
            }
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                setReport(null);
                return;
            }
            const next = payload as CommercialReport;
            setReport(next);
        } catch {
            toast.error(tf.commercialLoadError);
        } finally {
            setLoading(false);
        }
    }, [
        accountsReady,
        organizationId,
        router,
        scopedAccountIds,
        selectedMonth,
        tc.sessionExpired,
        tf.commercialLoadError,
    ]);

    useEffect(() => {
        void load();
    }, [load]);

    const labelOf = useCallback((month: string) => monthTitle(month, intl), [intl]);

    const activeCurrency: ViewCurrency =
        report?.exchangeRate != null && report.exchangeRate > 0
            ? viewCurrency
            : report?.displayCurrency === 'USD'
              ? 'USD'
              : 'BRL';

    const exportPdf = async () => {
        if (!report || !organizationId) return;
        setExportingPdf(true);
        try {
            const params = new URLSearchParams({
                organizationId,
                month: report.referenceMonth,
                currency: activeCurrency,
                locale: locale === 'en' ? 'en' : 'pt',
            });
            if (scopedAccountIds.length > 0) {
                params.set('cloudAccountIds', scopedAccountIds.join(','));
            }
            const response = await fetch(`/api/finops/commercial-report/pdf?${params.toString()}`, { cache: 'no-store' });
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body));
                return;
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const disposition = response.headers.get('Content-Disposition') ?? '';
            const named = disposition.match(/filename="([^"]+)"/)?.[1];
            link.href = url;
            link.download = named || `finops-commercial-${report.referenceMonth}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            toast.success(tf.reportPdfSuccess);
        } catch {
            toast.error(tf.pdfGenerateError);
        } finally {
            setExportingPdf(false);
        }
    };

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{tf.selectOrgTitle}</CardTitle>
                    <CardDescription>{tf.selectOrgDesc}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (accountsReady && scopedAccountIds.length === 0) {
        return (
            <div className="flex flex-col gap-6">
                <FinopsSubnav />
                <Card>
                    <CardHeader>
                        <CardTitle>{tf.commercialTitle}</CardTitle>
                        <CardDescription>{tf.noCloudAccountsInTenant}</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="commercial-report flex flex-col gap-6">
            <style>{`
                @media print {
                    @page { size: A4 landscape; margin: 10mm; }
                    html, body, [data-slot="sidebar-wrapper"], [data-slot="sidebar-inset"] {
                        background: var(--background) !important;
                        color: var(--foreground) !important;
                        print-color-adjust: exact;
                        -webkit-print-color-adjust: exact;
                    }
                    [data-slot="sidebar"],
                    [data-slot="sidebar-container"],
                    [data-slot="sidebar-gap"],
                    [data-slot="sidebar-inset"] > header,
                    .commercial-no-print {
                        display: none !important;
                    }
                    [data-slot="sidebar-wrapper"],
                    [data-slot="sidebar-inset"] {
                        display: block !important;
                        margin: 0 !important;
                        width: 100% !important;
                        min-height: 0 !important;
                        overflow: visible !important;
                        box-shadow: none !important;
                        border-radius: 0 !important;
                    }
                    .commercial-report,
                    .commercial-report * {
                        print-color-adjust: exact;
                        -webkit-print-color-adjust: exact;
                    }
                    .commercial-report [data-slot="card"] {
                        break-inside: avoid;
                        box-shadow: none !important;
                    }
                    .commercial-report [data-slot="card-content"].h-64,
                    .commercial-report [data-slot="card-content"].h-72,
                    .commercial-report [data-slot="card-content"].lg\\:h-72,
                    .commercial-report .recharts-responsive-container {
                        height: 18rem !important;
                        min-height: 18rem !important;
                        width: 100% !important;
                    }
                }
            `}</style>
            <div className="commercial-no-print flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">{tf.commercialTitle}</h1>
                        <p className="text-sm text-muted-foreground">{tf.commercialDesc}</p>
                    </div>
                    <FinopsSubnav />
                </div>
                <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-end">
                    <div className="col-span-2 space-y-1 sm:col-span-1 lg:w-auto">
                        <Label htmlFor="commercial-month">{tf.commercialMonth}</Label>
                        <select
                            id="commercial-month"
                            className="border-input bg-background h-8 w-full rounded-lg border px-2 text-sm lg:w-auto"
                            value={selectedMonth}
                            onChange={(event) => updateFilters({ month: event.target.value })}
                        >
                            {months.map((month) => (
                                <option key={month} value={month}>
                                    {labelOf(month)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="col-span-2 space-y-1 sm:col-span-1 lg:w-auto">
                        <Label>{tf.commercialCurrencyLabel}</Label>
                        <div className="flex h-8 w-full overflow-hidden rounded-lg border lg:w-auto">
                            <button
                                type="button"
                                className={`flex-1 px-3 text-sm lg:flex-none ${activeCurrency === 'BRL' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                                disabled={report?.exchangeRate == null && report?.displayCurrency !== 'BRL'}
                                onClick={() => updateFilters({ currency: 'BRL' })}
                            >
                                {tf.commercialCurrencyBrl}
                            </button>
                            <button
                                type="button"
                                className={`flex-1 border-l px-3 text-sm lg:flex-none ${activeCurrency === 'USD' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                                disabled={report?.exchangeRate == null && report?.displayCurrency !== 'USD'}
                                onClick={() => updateFilters({ currency: 'USD' })}
                            >
                                {tf.commercialCurrencyUsd}
                            </button>
                        </div>
                    </div>
                    <Button
                        className="col-span-2 w-full justify-center lg:w-auto"
                        onClick={() => void exportPdf()}
                        disabled={!report}
                        isLoading={exportingPdf}
                    >
                        <FileText className="size-4" />
                        {tf.commercialExportPdf}
                    </Button>
                </div>
            </div>

            {loading && !report ? <FinopsLoadingSkeleton /> : null}
            {report ? (
                <ReportBody report={report} labelOf={labelOf} copy={tf} viewCurrency={activeCurrency} />
            ) : null}

            {canManage ? (
                <Card className="commercial-no-print">
                    <CardHeader>
                        <CardTitle>{tf.commercialDeliveryTitle}</CardTitle>
                        <CardDescription>{tf.commercialEmailsHint}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
                        <CommercialReportDelivery
                            organizationId={organizationId}
                            delivery={report?.delivery}
                            sourceCurrency={report?.displayCurrency === 'USD' ? 'USD' : 'BRL'}
                            canConvert={report?.exchangeRate != null && report.exchangeRate > 0}
                            onSaved={load}
                        />
                        <Button
                            type="button"
                            size="sm"
                            className="w-full justify-center gap-2 lg:w-auto"
                            isLoading={sending}
                            onClick={async () => {
                                if (!selectedMonth) return;
                                setSending(true);
                                try {
                                    const response = await sendCommercialReport(organizationId, selectedMonth);
                                    const payload = await response.json().catch(() => null);
                                    if (!response.ok) {
                                        toast.error(extractErrorMessage(payload));
                                        return;
                                    }
                                    toast.success(tf.commercialSent);
                                    await load();
                                } finally {
                                    setSending(false);
                                }
                            }}
                        >
                            <Mail className="size-4" />
                            {tf.commercialSendNow}
                        </Button>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}

function ReportBody({
    report,
    labelOf,
    copy,
    viewCurrency,
}: {
    report: CommercialReport;
    labelOf: (month: string) => string;
    copy: ReturnType<typeof useTranslations<'finops'>>;
    viewCurrency: ViewCurrency;
}) {
    const { locale } = useLocale();
    const source = report.displayCurrency === 'USD' || report.displayCurrency === 'BRL' ? report.displayCurrency : viewCurrency;
    const rate = report.exchangeRate != null && report.exchangeRate > 0 ? report.exchangeRate : null;
    const toCurrency = (value: number, target: ViewCurrency): number => {
        if (source === target || rate == null) return value;
        if (source === 'USD' && target === 'BRL') return value * rate;
        if (source === 'BRL' && target === 'USD') return value / rate;
        return value;
    };
    const money = (value: number) => formatCurrency(toCurrency(value, viewCurrency), viewCurrency);
    const otherCurrency: ViewCurrency = viewCurrency === 'BRL' ? 'USD' : 'BRL';
    const ranked = (rows: Array<{ name: string; amount: number }>): NamedAmount[] =>
        rows.map((row) => ({
            name: row.name,
            amount: toCurrency(row.amount, viewCurrency),
            alternate: rate != null ? formatCurrency(toCurrency(row.amount, otherCurrency), otherCurrency) : undefined,
        }));
    const resourceRank = (rows: Array<{ name: string; amount: number }>) => ranked(collapseResourceLabels(rows, locale));
    const previousMonth = report.months[1]?.key ?? report.referenceMonth;
    const previousCost = report.totalEvolution.find((item) => item.month === previousMonth)?.cost;
    const costDelta = previousCost == null ? null : report.kpis.totalCost - previousCost;
    const signedMoney = (value: number) => {
        const formatted = money(Math.abs(value));
        if (value > 0.004) return `+${formatted}`;
        if (value < -0.004) return `-${formatted}`;
        return formatted;
    };
    const convert = (value: number) => toCurrency(value, viewCurrency);
    const evolution = report.totalEvolution.map((item) => ({
        label: labelOf(item.month),
        cost: convert(item.cost),
        change: formatPct(item.changePct),
    }));
    const avgEvolution = report.avgDailyEvolution.map((item) => ({
        label: labelOf(item.month),
        avg: convert(item.avg),
        change: formatPct(item.changePct),
    }));
    const monthKeys = report.months.map((month) => month.key);
    const accountSeries = report.accountEvolution.map((row) => ({
        alias: row.alias,
        [monthKeys[0]]: convert(row.costs[0] ?? 0),
        [monthKeys[1]]: convert(row.costs[1] ?? 0),
        [monthKeys[2]]: convert(row.costs[2] ?? 0),
    }));
    const serviceSeries = report.accountByService.rows.map((row) => {
        const entry: Record<string, string | number> = { alias: row.alias };
        report.accountByService.services.forEach((service, index) => {
            entry[service] = convert(row.costs[index] ?? 0);
        });
        entry.total = report.accountByService.services.reduce((sum, service) => sum + Number(entry[service] ?? 0), 0);
        return entry;
    });
    const totals = report.subscriptionTable.reduce(
        (acc, row) => [acc[0] + row.costs[0], acc[1] + row.costs[1], acc[2] + row.costs[2]],
        [0, 0, 0],
    );
    const providers = report.providers.length > 0 ? report.providers.join(' · ') : '—';
    const openTitle =
        report.inProgress.projection != null
            ? copy.commercialDailyOpen
                  .replace('{month}', labelOf(report.inProgress.month))
                  .replace('{projection}', money(report.inProgress.projection))
            : copy.commercialDailyOpenEmpty.replace('{month}', labelOf(report.inProgress.month));

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h2 className="text-lg font-semibold">{copy.commercialHeading}</h2>
                <p className="text-muted-foreground text-sm">
                    {report.organizationName} · {providers} · {labelOf(report.referenceMonth)} · {copy.commercialSource}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
                <Kpi
                    title={copy.commercialKpiTotal}
                    value={money(report.kpis.totalCost)}
                    detail={copy.commercialVs.replace('{value}', formatPct(report.kpis.totalChangePct)).replace('{month}', labelOf(previousMonth))}
                />
                <Kpi title={copy.commercialKpiAvg} value={money(report.kpis.avgDailyCost)} detail={`${copy.commercialDays.replace('{count}', String(report.kpis.daysInMonth))} · ${copy.commercialVs.replace('{value}', formatPct(report.kpis.avgDailyChangePct)).replace('{month}', labelOf(previousMonth))}`} />
                <Kpi
                    title={copy.commercialKpiChange.replace('{month}', labelOf(previousMonth))}
                    value={formatPct(report.kpis.totalChangePct)}
                    detail={costDelta == null ? undefined : signedMoney(costDelta)}
                />
                <Kpi title={copy.commercialKpiAccounts} value={String(report.kpis.accountsWithSpend)} detail={copy.commercialAccountsOf.replace('{used}', String(report.kpis.accountsWithSpend)).replace('{total}', String(report.kpis.accountsTotal))} />
                <Kpi title={copy.commercialKpiProjection.replace('{month}', labelOf(report.kpis.projectionMonth))} value={report.kpis.projection != null ? money(report.kpis.projection) : '—'} detail={commercialProjectionDetail(report.kpis.projectionSource, report.providers, report.kpis.projectionBaseDays, copy)} />
                {viewCurrency === 'BRL' ? (
                    <Kpi
                        title={copy.commercialKpiFx}
                        value={report.exchangeRate != null ? report.exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
                        detail={report.exchangeRate != null ? `${copy.commercialFxUnit} · ${formatPct(report.exchangeRateChangePct)} · ${formatCurrency(toCurrency(report.kpis.totalCost, otherCurrency), otherCurrency)}` : copy.commercialNoRate}
                    />
                ) : null}
            </div>

            <CommercialFinancePanels credits={report.credits} commitments={report.commitments} money={money} />

            <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
                <ChartCard title={copy.commercialTotalEvolution} group="before">
                    <ColumnChart data={evolution} dataKey="cost" seriesName={copy.seriesCost} currency={viewCurrency} />
                </ChartCard>
                <ChartCard title={copy.commercialAvgEvolution} group="before">
                    <ColumnChart data={avgEvolution} dataKey="avg" seriesName={copy.seriesDailyAvg} currency={viewCurrency} />
                </ChartCard>
            </div>

            <ChartCard
                title={copy.commercialAccountEvolution}
                group="before"
                span="full"
                description={report.months.map((month) => labelOf(month.key)).join(' · ')}
                contentClassName="h-auto min-h-64 lg:min-h-72"
            >
                <GroupedAccountChart
                    data={accountSeries}
                    seriesKeys={monthKeys}
                    seriesLabels={monthKeys.map((month) => labelOf(month))}
                    currency={viewCurrency}
                />
            </ChartCard>

            <Card className="min-w-0 break-inside-avoid">
                <CardHeader>
                    <CardTitle className="text-base text-balance">
                        {copy.commercialDetail
                            .replace('{from}', labelOf(report.months[0].key))
                            .replace('{to}', labelOf(report.referenceMonth))}
                    </CardTitle>
                    <CardDescription>{copy.commercialVariationNote}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="divide-y rounded-xl border lg:hidden">
                        {report.subscriptionTable.map((row) => (
                            <div key={row.accountId} className="space-y-2 px-3 py-3">
                                <p className="text-sm font-medium">{row.alias}</p>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <p className="text-muted-foreground">{labelOf(report.months[0].key)}</p>
                                        <p className="tabular-nums">{money(row.costs[0])}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">{labelOf(report.months[1].key)}</p>
                                        <p className="tabular-nums">{money(row.costs[1])}</p>
                                        <p className="text-muted-foreground">
                                            <Variation value={row.change12} />
                                        </p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-muted-foreground">{labelOf(report.months[2].key)}</p>
                                        <p className="tabular-nums">{money(row.costs[2])}</p>
                                        <p className="text-muted-foreground">
                                            <Variation value={row.change23} />
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div className="space-y-2 bg-muted/30 px-3 py-3">
                            <p className="text-sm font-medium">{copy.commercialTotalRow}</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <p className="text-muted-foreground">{labelOf(report.months[0].key)}</p>
                                    <p className="tabular-nums">{money(totals[0])}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">{labelOf(report.months[1].key)}</p>
                                    <p className="tabular-nums">{money(totals[1])}</p>
                                    <p className="text-muted-foreground">
                                        <Variation value={change(totals[1], totals[0])} />
                                    </p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-muted-foreground">{labelOf(report.months[2].key)}</p>
                                    <p className="tabular-nums">{money(totals[2])}</p>
                                    <p className="text-muted-foreground">
                                        <Variation value={change(totals[2], totals[1])} />
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="hidden lg:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{copy.commercialColAccount}</TableHead>
                                    <TableHead>{labelOf(report.months[0].key)}</TableHead>
                                    <TableHead>{labelOf(report.months[1].key)}</TableHead>
                                    <TableHead>{copy.commercialColVar}</TableHead>
                                    <TableHead>{labelOf(report.months[2].key)}</TableHead>
                                    <TableHead>{copy.commercialColVar}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {report.subscriptionTable.map((row) => (
                                    <TableRow key={row.accountId}>
                                        <TableCell>{row.alias}</TableCell>
                                        <TableCell>{money(row.costs[0])}</TableCell>
                                        <TableCell>{money(row.costs[1])}</TableCell>
                                        <TableCell>
                                            <Variation value={row.change12} />
                                        </TableCell>
                                        <TableCell>{money(row.costs[2])}</TableCell>
                                        <TableCell>
                                            <Variation value={row.change23} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell>{copy.commercialTotalRow}</TableCell>
                                    <TableCell>{money(totals[0])}</TableCell>
                                    <TableCell>{money(totals[1])}</TableCell>
                                    <TableCell>
                                        <Variation value={change(totals[1], totals[0])} />
                                    </TableCell>
                                    <TableCell>{money(totals[2])}</TableCell>
                                    <TableCell>
                                        <Variation value={change(totals[2], totals[1])} />
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
                <ChartCard
                    span="third"
                    title={copy.commercialDailyClosed.replace('{month}', labelOf(previousMonth))}
                    description={copy.commercialAvgDaily.replace('{amount}', money(report.kpis.previousAvgDaily))}
                >
                    <DailyChart
                        points={report.dailyPrevious.map((point) => ({ ...point, cost: convert(point.cost) }))}
                        currency={viewCurrency}
                        seriesName={copy.seriesCost}
                    />
                </ChartCard>
                <ChartCard
                    span="third"
                    title={copy.commercialDailyClosed.replace('{month}', labelOf(report.referenceMonth))}
                    description={copy.commercialAvgDaily.replace('{amount}', money(report.kpis.avgDailyCost))}
                >
                    <DailyChart
                        points={report.dailyReference.map((point) => ({ ...point, cost: convert(point.cost) }))}
                        currency={viewCurrency}
                        seriesName={copy.seriesCost}
                    />
                </ChartCard>
                <ChartCard span="third" title={openTitle}>
                    <DailyChart
                        points={report.inProgress.points.map((point) => ({ ...point, cost: convert(point.cost) }))}
                        currency={viewCurrency}
                        seriesName={copy.seriesCost}
                    />
                </ChartCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
                <ChartCard
                    title={copy.commercialReductions
                        .replace('{current}', labelOf(report.referenceMonth))
                        .replace('{previous}', labelOf(previousMonth))}
                    description={`${copy.commercialReductionSum.replace('{amount}', money(report.reductionSum))} ${copy.commercialGroupedNote}`}
                    contentClassName="h-auto"
                >
                    <RankChart
                        rows={resourceRank(report.reductions)}
                        currency={viewCurrency}
                        seriesName={copy.seriesCost}
                        empty={copy.commercialNoResources}
                        axisWidth={168}
                    />
                </ChartCard>
                <ChartCard
                    title={copy.commercialIncreases
                        .replace('{current}', labelOf(report.referenceMonth))
                        .replace('{previous}', labelOf(previousMonth))}
                    description={`${copy.commercialIncreaseSum.replace('{amount}', money(report.increaseSum))} ${copy.commercialGroupedNote}`}
                    contentClassName="h-auto"
                >
                    <RankChart
                        rows={resourceRank(report.increases)}
                        currency={viewCurrency}
                        seriesName={copy.seriesCost}
                        empty={copy.commercialNoResources}
                        axisWidth={168}
                    />
                </ChartCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
                <ChartCard title={copy.commercialTopServices} contentClassName="h-auto">
                    <RankChart
                        rows={ranked(
                            report.topServices.map((item) => ({
                                name: friendlyServiceLabel(item.service, locale),
                                amount: item.cost,
                            })),
                        )}
                        currency={viewCurrency}
                        seriesName={copy.seriesCost}
                    />
                </ChartCard>
                <ChartCard title={copy.commercialTopResources} contentClassName="h-auto">
                    <RankChart
                        rows={resourceRank(report.topResources.map((item) => ({ name: item.name, amount: item.cost })))}
                        currency={viewCurrency}
                        seriesName={copy.seriesCost}
                        empty={copy.commercialNoResources}
                        axisWidth={168}
                    />
                </ChartCard>
            </div>

            <ChartCard span="full" title={copy.commercialCostByAccount} contentClassName="h-auto">
                <RankChart
                    rows={ranked(report.costByAccount.map((item) => ({ name: item.alias, amount: item.cost })))}
                    currency={viewCurrency}
                    seriesName={copy.seriesCost}
                />
            </ChartCard>

            <ChartCard
                span="full"
                title={copy.commercialAccountService}
                contentClassName="h-auto min-h-64 lg:min-h-72"
            >
                <StackedAccountServiceChart
                    data={serviceSeries}
                    services={report.accountByService.services}
                    currency={viewCurrency}
                    locale={locale}
                />
            </ChartCard>

            <Card className="break-inside-avoid">
                <CardHeader>
                    <CardTitle className="text-base">{copy.commercialAnomaliesTitle}</CardTitle>
                    <CardDescription>{copy.commercialAnomaliesDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <p className="text-muted-foreground text-xs">{copy.commercialAnomaliesOccurred}</p>
                            <p className="text-xl font-semibold">{report.anomalies.total}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground text-xs">{copy.commercialAnomaliesAcknowledged}</p>
                            <p className="text-xl font-semibold">{report.anomalies.acknowledged}</p>
                        </div>
                    </div>
                    {report.anomalies.items.length === 0 ? (
                        <p className="text-muted-foreground text-sm">{copy.commercialAnomaliesEmpty}</p>
                    ) : (
                        <>
                            <div className="divide-y rounded-xl border lg:hidden">
                                {report.anomalies.items.map((item, index) => (
                                    <div
                                        key={`${item.date}-${item.accountAlias}-${item.service}-${index}`}
                                        className="space-y-1.5 px-3 py-3"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                                                {anomalySeverityLabel(item.severity, copy)}
                                            </span>
                                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                {anomalyStatusLabel(item.status, copy)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDay(item.date, toIntlLocale(locale))}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium break-words">
                                            {friendlyServiceLabel(item.service, locale)}
                                        </p>
                                        <div className="flex items-center justify-between gap-3 text-xs">
                                            <span className="min-w-0 truncate text-muted-foreground">
                                                {item.accountAlias || item.provider.toUpperCase()}
                                            </span>
                                            <span className="shrink-0 font-semibold tabular-nums">
                                                {money(item.impact)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="hidden lg:block">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{copy.commercialAnomalyColService}</TableHead>
                                            <TableHead>{copy.commercialAnomalyColAccount}</TableHead>
                                            <TableHead>{copy.commercialAnomalyColDate}</TableHead>
                                            <TableHead>{copy.commercialAnomalyColSeverity}</TableHead>
                                            <TableHead>{copy.commercialAnomalyColStatus}</TableHead>
                                            <TableHead className="text-right">
                                                {copy.commercialAnomalyColImpact}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {report.anomalies.items.map((item, index) => (
                                            <TableRow
                                                key={`${item.date}-${item.accountAlias}-${item.service}-${index}`}
                                            >
                                                <TableCell>
                                                    {friendlyServiceLabel(item.service, locale)}
                                                </TableCell>
                                                <TableCell>
                                                    {item.accountAlias || item.provider.toUpperCase()}
                                                </TableCell>
                                                <TableCell>
                                                    {formatDay(item.date, toIntlLocale(locale))}
                                                </TableCell>
                                                <TableCell>
                                                    {anomalySeverityLabel(item.severity, copy)}
                                                </TableCell>
                                                <TableCell>{anomalyStatusLabel(item.status, copy)}</TableCell>
                                                <TableCell className="text-right">{money(item.impact)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            {report.anomalies.items.length < report.anomalies.total ? (
                                <p className="text-muted-foreground text-xs">
                                    {copy.commercialAnomaliesMore
                                        .replace('{shown}', String(report.anomalies.items.length))
                                        .replace('{total}', String(report.anomalies.total))}
                                </p>
                            ) : null}
                        </>
                    )}
                </CardContent>
            </Card>

            <p className="text-muted-foreground text-sm">
                {copy.commercialHowToRead.replace('{month}', labelOf(report.referenceMonth)).replace('{currency}', viewCurrency === 'BRL' ? copy.commercialAmountCurrencyBrl : copy.commercialAmountCurrencyUsd)}
            </p>
        </div>
    );
}

function formatDay(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${iso.slice(0, 10)}T12:00:00Z`),
    );
}

function anomalyStatusLabel(
    status: CommercialReport['anomalies']['items'][number]['status'],
    copy: ReturnType<typeof useTranslations<'finops'>>,
): string {
    if (status === 'acknowledged') return copy.commercialStatusAcknowledged;
    if (status === 'resolved') return copy.commercialStatusResolved;
    return copy.commercialStatusOpen;
}

function anomalySeverityLabel(
    severity: CommercialReport['anomalies']['items'][number]['severity'],
    copy: ReturnType<typeof useTranslations<'finops'>>,
): string {
    if (severity === 'critical') return copy.severityCritical;
    if (severity === 'high') return copy.severityHigh;
    if (severity === 'low') return copy.severityLow;
    return copy.severityMedium;
}

function change(current: number, previous: number): number | null {
    if (Math.abs(previous) < 0.000001) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

function Kpi({ title, value, detail }: { title: string; value: string; detail?: string }) {
    return (
        <Card className="h-28 gap-1.5 break-inside-avoid justify-between py-2.5">
            <CardHeader className="gap-1 pb-0">
                <CardDescription className="line-clamp-2 min-h-8 text-xs leading-4">{title}</CardDescription>
                <CardTitle className="text-xl font-semibold leading-none tracking-tight tabular-nums">{value}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground line-clamp-2 text-xs leading-4">{detail}</CardContent>
        </Card>
    );
}

const chartValueLabelStyle = { fontSize: 11, fontWeight: 600, fill: 'var(--foreground)' } as const;

function formatChartValue(value: unknown, currency: string): string {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    return formatCurrency(amount, currency);
}

function compactTickProps(compact: boolean) {
    return compact ? { ...finopsChartTickProps, fontSize: 10 } : finopsChartTickProps;
}

function ColumnChart({
    data,
    dataKey,
    seriesName,
    currency,
}: {
    data: Array<Record<string, string | number>>;
    dataKey: string;
    seriesName: string;
    currency: string;
}) {
    const compact = useIsBelowLg();
    return (
        <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
            <BarChart
                data={data}
                margin={{ top: compact ? 8 : 28, right: compact ? 4 : 8, left: 0, bottom: 0 }}
            >
                <CartesianGrid stroke={FINOPS_CHART_GRID} vertical={false} />
                <XAxis dataKey="label" tick={compactTickProps(compact)} interval={0} />
                <YAxis
                    tick={compactTickProps(compact)}
                    tickFormatter={(value) => formatChartValue(value, currency)}
                    width={compact ? 44 : 72}
                />
                <Tooltip {...finopsChartTooltipStyles} formatter={(value) => formatChartValue(value, currency)} />
                <Bar dataKey={dataKey} name={seriesName} fill={FINOPS_CHART_PRIMARY} radius={4}>
                    {!compact ? (
                        <LabelList
                            dataKey={dataKey}
                            position="top"
                            offset={8}
                            formatter={(value) => formatChartValue(value, currency)}
                            style={chartValueLabelStyle}
                        />
                    ) : null}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function DailyChart({
    points,
    currency,
    seriesName,
}: {
    points: Point[];
    currency: string;
    seriesName: string;
}) {
    const compact = useIsBelowLg();
    const data = points.map((point) => ({ ...point, label: point.date.slice(8) }));
    return (
        <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
            <LineChart data={data} margin={{ top: 8, right: compact ? 4 : 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={FINOPS_CHART_GRID} vertical={false} />
                <XAxis
                    dataKey="label"
                    tick={compactTickProps(compact)}
                    interval={compact ? 'equidistantPreserveStart' : 0}
                    minTickGap={compact ? 12 : 4}
                />
                <YAxis
                    tick={compactTickProps(compact)}
                    tickFormatter={(value) => formatChartValue(value, currency)}
                    width={compact ? 44 : 72}
                />
                <Tooltip
                    {...finopsChartTooltipStyles}
                    formatter={(value) => formatChartValue(value, currency)}
                    labelFormatter={(_, payload) => String(payload?.[0]?.payload?.date ?? '')}
                />
                <Line
                    type="monotone"
                    dataKey="cost"
                    name={seriesName}
                    stroke={FINOPS_CHART_PRIMARY}
                    dot={false}
                    strokeWidth={2}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}

function RankChart({
    rows,
    currency,
    seriesName,
    empty,
    axisWidth = 128,
}: {
    rows: NamedAmount[];
    currency: string;
    seriesName: string;
    empty?: string;
    axisWidth?: number;
}) {
    const compact = useIsBelowLg();
    if (rows.length === 0) {
        return (
            <p className="text-muted-foreground flex min-h-40 items-center justify-center text-center text-sm">
                {empty}
            </p>
        );
    }

    const resolvedAxisWidth = compact ? Math.min(axisWidth, 88) : axisWidth;
    const maxChars = compact ? 12 : resolvedAxisWidth >= 160 ? 24 : 18;
    const height = Math.max(compact ? 220 : 288, rows.length * (compact ? 34 : 38) + 24);

    return (
        <div className="w-full min-w-0" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
                <BarChart
                    data={rows}
                    layout="vertical"
                    margin={{ left: 4, right: compact ? 8 : 88, top: 8, bottom: 0 }}
                >
                    <CartesianGrid stroke={FINOPS_CHART_GRID} horizontal={false} />
                    <XAxis
                        type="number"
                        tick={compactTickProps(compact)}
                        tickFormatter={(value) => formatChartValue(value, currency)}
                    />
                    <YAxis
                        type="category"
                        dataKey="name"
                        width={resolvedAxisWidth}
                        tick={compactTickProps(compact)}
                        tickFormatter={(value: string) =>
                            value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value
                        }
                    />
                    <Tooltip
                        {...finopsChartTooltipStyles}
                        formatter={(value, _name, item) => {
                            const formatted = formatChartValue(value, currency);
                            const alternate = (item as { payload?: { alternate?: string } } | undefined)?.payload
                                ?.alternate;
                            return alternate ? `${formatted} · ${alternate}` : formatted;
                        }}
                    />
                    <Bar dataKey="amount" name={seriesName} fill={FINOPS_CHART_PRIMARY} radius={4}>
                        {!compact ? (
                            <LabelList
                                dataKey="amount"
                                position="right"
                                offset={6}
                                formatter={(value) => formatChartValue(value, currency)}
                                style={chartValueLabelStyle}
                            />
                        ) : null}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

function GroupedAccountChart({
    data,
    seriesKeys,
    seriesLabels,
    currency,
}: {
    data: Array<Record<string, string | number>>;
    seriesKeys: string[];
    seriesLabels: string[];
    currency: string;
}) {
    const compact = useIsBelowLg();
    const height = Math.max(compact ? 240 : 288, data.length * (compact ? 44 : 52) + 48);

    return (
        <div className="w-full min-w-0" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ left: 4, right: compact ? 8 : 88, top: 8, bottom: compact ? 28 : 8 }}
                >
                    <CartesianGrid stroke={FINOPS_CHART_GRID} horizontal={false} />
                    <XAxis type="number" tick={compactTickProps(compact)} hide={compact} />
                    <YAxis
                        type="category"
                        dataKey="alias"
                        width={compact ? 72 : 110}
                        tick={compactTickProps(compact)}
                        tickFormatter={(value: string) =>
                            compact && value.length > 10 ? `${value.slice(0, 9)}…` : value
                        }
                    />
                    <Tooltip
                        {...finopsChartTooltipStyles}
                        formatter={(value) => formatCurrency(Number(value), currency)}
                    />
                    <Legend
                        wrapperStyle={compact ? { fontSize: 11, paddingTop: 4 } : undefined}
                        iconSize={compact ? 8 : 14}
                    />
                    {seriesKeys.map((key, index) => (
                        <Bar
                            key={key}
                            dataKey={key}
                            name={seriesLabels[index] ?? key}
                            fill={FINOPS_CHART_COLORS[index % FINOPS_CHART_COLORS.length]}
                        >
                            {!compact ? (
                                <LabelList
                                    dataKey={key}
                                    position="right"
                                    offset={6}
                                    formatter={(value) => formatChartValue(value, currency)}
                                    style={chartValueLabelStyle}
                                />
                            ) : null}
                        </Bar>
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

function StackedAccountServiceChart({
    data,
    services,
    currency,
    locale,
}: {
    data: Array<Record<string, string | number>>;
    services: string[];
    currency: string;
    locale: AppLocale;
}) {
    const compact = useIsBelowLg();
    const height = Math.max(compact ? 240 : 288, data.length * (compact ? 40 : 48) + (compact ? 64 : 32));

    return (
        <div className="w-full min-w-0" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
                <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ left: 4, right: compact ? 8 : 88, top: 8, bottom: compact ? 36 : 8 }}
                >
                    <CartesianGrid stroke={FINOPS_CHART_GRID} horizontal={false} />
                    <XAxis type="number" tick={compactTickProps(compact)} hide={compact} />
                    <YAxis
                        type="category"
                        dataKey="alias"
                        width={compact ? 72 : 110}
                        tick={compactTickProps(compact)}
                        tickFormatter={(value: string) =>
                            compact && value.length > 10 ? `${value.slice(0, 9)}…` : value
                        }
                    />
                    <Tooltip
                        {...finopsChartTooltipStyles}
                        formatter={(value) => formatCurrency(Number(value), currency)}
                    />
                    <Legend
                        wrapperStyle={compact ? { fontSize: 10, paddingTop: 4 } : undefined}
                        iconSize={compact ? 8 : 14}
                    />
                    {services.map((service, index) => (
                        <Bar
                            key={service}
                            dataKey={service}
                            name={friendlyServiceLabel(service, locale)}
                            stackId="services"
                            fill={FINOPS_CHART_COLORS[index % FINOPS_CHART_COLORS.length]}
                        >
                            {!compact && index === services.length - 1 ? (
                                <LabelList
                                    dataKey="total"
                                    position="right"
                                    offset={6}
                                    formatter={(value) => formatChartValue(value, currency)}
                                    style={chartValueLabelStyle}
                                />
                            ) : null}
                        </Bar>
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
