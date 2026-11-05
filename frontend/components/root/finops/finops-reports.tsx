'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { FinopsFilterBar } from '@/components/root/finops/finops-filter-bar';
import {
    ACCOUNT_FILTER_ALL,
    buildFinopsQuery,
    downloadCsv,
    parseFinopsUrlFilters,
    periodLabel,
} from '@/components/root/finops/finops-filter-utils';
import { formatCurrency, formatDate } from '@/components/root/finops/overview/helpers';
import type { DashboardPeriod, OrgFinopsOptimize, OrgFinopsOverview } from '@/components/root/finops/overview/types';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import { fetchFinopsOrgOptimize, fetchFinopsOrgOverview } from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

export function FinopsReports() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tf = useTranslations('finops');
    const tc = useTranslations('common');

    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const midOrgId = useActiveMidOrgId(organizationId);
    const [sidebarAccountId, setSidebarAccountId] = useState<string | null>(null);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [overview, setOverview] = useState<OrgFinopsOverview | null>(null);
    const [optimize, setOptimize] = useState<OrgFinopsOptimize | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [generatedAt, setGeneratedAt] = useState<string | null>(null);

    const syncUrlState = useCallback(
        (next: Partial<{ period: DashboardPeriod; account: string | null; provider: string | null; service: string | null }>) => {
            const nextQuery = buildFinopsQuery(searchParams, next);
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams]
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
        const load = async () => {
            try {
                const response = await fetchOrganizationCloudAccounts(organizationId, {
                    midOrgId: midOrgId ?? getActiveMidOrgId(organizationId),
                });
                if (!response.ok) {
                    setCloudAccounts([]);
                    return;
                }
                const payload = await response.json().catch(() => null);
                const accounts = Array.isArray(payload)
                    ? payload
                    : Array.isArray((payload as { items?: unknown })?.items)
                      ? (payload as { items: OrganizationCloudAccount[] }).items
                      : [];
                setCloudAccounts(accounts);
            } catch {
                setCloudAccounts([]);
            }
        };
        void load();
    }, [organizationId, midOrgId]);

    const loadReportData = useCallback(
        async (orgId: string, silent = false) => {
            if (!silent) setLoading(true);
            try {
                const [overviewRes, optimizeRes] = await Promise.all([
                    fetchFinopsOrgOverview(orgId, {
                        period: urlFilters.period,
                        cloudAccountId: urlFilters.accountId ?? undefined,
                    }),
                    fetchFinopsOrgOptimize(orgId, {
                        status: 'open',
                        cloudAccountId: urlFilters.accountId ?? undefined,
                        limit: 100,
                    }),
                ]);

                if (overviewRes.status === 401 || optimizeRes.status === 401) {
                    toast.error(tc.sessionExpired);
                    router.replace('/auth/sign-in');
                    return;
                }

                if (!overviewRes.ok) {
                    const payload = await overviewRes.json().catch(() => null);
                    toast.error(extractErrorMessage(payload));
                    setOverview(null);
                } else {
                    setOverview((await overviewRes.json().catch(() => null)) as OrgFinopsOverview | null);
                }

                if (optimizeRes.ok) {
                    setOptimize((await optimizeRes.json().catch(() => null)) as OrgFinopsOptimize | null);
                } else {
                    setOptimize(null);
                }

                setGeneratedAt(new Date().toISOString());
            } catch {
                if (!silent) toast.error(tf.loadError);
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [router, tc.sessionExpired, tf.loadError, urlFilters.accountId, urlFilters.period]
    );

    useEffect(() => {
        if (!organizationId) {
            setLoading(false);
            return;
        }
        void loadReportData(organizationId);
    }, [organizationId, loadReportData]);

    const filteredAccounts = useMemo(() => {
        const accounts = overview?.accounts ?? [];
        if (!urlFilters.provider) return accounts;
        return accounts.filter((account) => account.provider.toLowerCase() === urlFilters.provider);
    }, [overview?.accounts, urlFilters.provider]);

    const filteredServices = useMemo(() => {
        const services = overview?.costByService ?? [];
        if (!urlFilters.service) return services;
        return services.filter((item) => item.service === urlFilters.service);
    }, [overview?.costByService, urlFilters.service]);

    const filteredOptimizeItems = useMemo(() => {
        let items = optimize?.items ?? [];
        if (urlFilters.provider) {
            items = items.filter((item) => item.cloudProvider.toLowerCase() === urlFilters.provider);
        }
        if (urlFilters.service) {
            items = items.filter(
                (item) => (item.service ?? '').includes(urlFilters.service!) || item.title.includes(urlFilters.service!)
            );
        }
        return items;
    }, [optimize?.items, urlFilters.provider, urlFilters.service]);

    const currency = overview?.totals.currency ?? 'USD';
    const totalCost = urlFilters.provider
        ? filteredAccounts.reduce((sum, account) => sum + Number(account.totalCost ?? 0), 0)
        : urlFilters.service
          ? filteredServices.reduce((sum, item) => sum + Number(item.currentMonthCost ?? 0), 0)
          : (overview?.totals.cost ?? 0);

    const accountAlias =
        urlFilters.accountId != null
            ? (cloudAccounts.find((account) => account.id === urlFilters.accountId)?.alias ?? urlFilters.accountId)
            : tf.reportAllAccounts;

    const accountAliases = useMemo(() => {
        const map: Record<string, string> = {};
        for (const account of cloudAccounts) map[account.id] = account.alias;
        for (const account of overview?.accounts ?? []) {
            if (!map[account.id]) map[account.id] = account.alias;
        }
        return map;
    }, [cloudAccounts, overview?.accounts]);

    const handleExport = () => {
        if (!overview) {
            toast.error(tf.reportPreviewRequired);
            return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const orgSlug = (organizationId ?? 'org').slice(0, 8);
        const rows: string[][] = [
            [tf.reportCsvTitle],
            [tf.reportGeneratedOn, generatedAt ? formatDate(generatedAt) : today],
            [tf.reportOrganization, organizationId ?? ''],
            [tf.reportPeriod, periodLabel(urlFilters.period)],
            [tf.reportRange, `${overview.period.startDate} → ${overview.period.endDate}`],
            [tf.reportAccount, accountAlias],
            [tf.reportProvider, urlFilters.provider?.toUpperCase() ?? tf.reportAll],
            [tf.reportService, urlFilters.service ?? tf.reportAll],
            [],
            [tf.reportExecutiveSummary],
            [tf.reportTotalCost, String(totalCost), currency],
            [tf.reportMomPct, String(overview.totals.momGrowth)],
            [tf.reportMonthForecast, overview.totals.forecastedCost != null ? String(overview.totals.forecastedCost) : ''],
            [tf.potentialSavings, String(overview.totals.potentialSavings)],
            [tf.reportOpenAnomalies, String(filteredOptimizeItems.filter((item) => item.kind === 'anomaly').length)],
            [
                tf.reportOpenRecs,
                String(filteredOptimizeItems.filter((item) => item.kind === 'recommendation').length),
            ],
            [],
            [tf.reportCostsByAccount],
            [tf.reportColAlias, tf.reportProvider, tf.reportColCost, tf.reportColAnomalies, tf.reportColRecs],
            ...filteredAccounts.map((account) => [
                account.alias,
                account.provider,
                String(account.totalCost),
                String(account.openAnomalies),
                String(account.openRecs),
            ]),
            [],
            [tf.reportCostsByService],
            [tf.reportService, tf.reportColCurrentCost, tf.reportColPreviousCost, tf.reportMomPct, tf.reportColTrend],
            ...filteredServices.map((item) => [
                item.service,
                String(item.currentMonthCost),
                String(item.previousMonthCost),
                String(item.changePercentage),
                item.trend,
            ]),
            [],
            [tf.reportOpportunities],
            [tf.reportColType, tf.reportAccount, tf.reportColTitle, tf.reportProvider, tf.reportColImpact, tf.reportColSeverity, tc.status],
            ...filteredOptimizeItems.map((item) => [
                item.kind,
                accountAliases[item.cloudAccountId] ?? item.cloudAccountId,
                item.title,
                item.cloudProvider,
                String(item.impact),
                item.severityOrPriority,
                item.status,
            ]),
        ];

        downloadCsv(`finops-report-${orgSlug}-${today}.csv`, rows);
        toast.success(tf.reportCsvSuccess);
    };

    const handleExportPdf = async () => {
        if (!overview || !generatedAt) {
            toast.error(tf.reportPreviewRequired);
            return;
        }

        setExportingPdf(true);
        try {
            const today = new Date().toISOString().slice(0, 10);
            const orgSlug = (organizationId ?? 'org').slice(0, 8);
            // Import dinâmico evita puxar o build Node do jsPDF no SSR.
            const { exportFinopsReportPdf } = await import('@/components/root/finops/export-finops-report-pdf');
            await exportFinopsReportPdf({
                overview,
                accounts: filteredAccounts,
                services: filteredServices,
                optimizeItems: filteredOptimizeItems,
                accountAliases,
                totalCost,
                currency,
                periodLabel: periodLabel(urlFilters.period),
                accountLabel: accountAlias,
                providerLabel: urlFilters.provider?.toUpperCase() ?? tf.reportAll,
                serviceLabel: urlFilters.service ?? tf.reportAll,
                generatedAt,
                fileName: `finops-report-${orgSlug}-${today}.pdf`,
            });
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

    if (loading && !overview) return <FinopsLoadingSkeleton />;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">{tf.reportsTitle}</h1>
                        <p className="text-sm text-muted-foreground">{tf.reportsDesc}</p>
                    </div>
                    <FinopsSubnav />
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={refreshing}
                        onClick={async () => {
                            setRefreshing(true);
                            await loadReportData(organizationId, true);
                            setRefreshing(false);
                        }}
                    >
                        <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                        {tc.refresh}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExport} disabled={!overview}>
                        <Download className="size-4" />
                        {tf.exportCsv}
                    </Button>
                    <Button size="sm" onClick={() => void handleExportPdf()} disabled={!overview} isLoading={exportingPdf}>
                        <FileText className="size-4" />
                        {tf.exportPdf}
                    </Button>
                </div>
            </div>

            <FinopsFilterBar
                period={urlFilters.period}
                accountId={urlFilters.accountId}
                provider={urlFilters.provider}
                service={urlFilters.service}
                cloudAccounts={cloudAccounts}
                serviceOptions={(overview?.costByService ?? []).map((item) => item.service)}
                sidebarAccountId={sidebarAccountId}
                onPeriodChange={(period) => syncUrlState({ period })}
                onAccountChange={(accountId) => syncUrlState({ account: accountId ?? ACCOUNT_FILTER_ALL })}
                onProviderChange={(provider) => syncUrlState({ provider })}
                onServiceChange={(service) => syncUrlState({ service })}
                onClear={() =>
                    syncUrlState({
                        period: 'lastmonth',
                        account: ACCOUNT_FILTER_ALL,
                        provider: null,
                        service: null,
                    })
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="size-5" />
                        {tf.reportPreview}
                    </CardTitle>
                    <CardDescription>
                        {generatedAt ? tf.reportGeneratedAt.replace('{date}', formatDate(generatedAt)) : tf.reportWaitingData}
                        {overview?.period ? ` · ${overview.period.startDate} → ${overview.period.endDate}` : ''}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {!overview ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">{tf.reportNoData}</p>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-xl border p-4">
                                    <p className="text-xs text-muted-foreground">{tf.reportTotalCost}</p>
                                    <p className="text-xl font-semibold">{formatCurrency(totalCost, currency)}</p>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <p className="text-xs text-muted-foreground">{tf.reportMom}</p>
                                    <p className="text-xl font-semibold">
                                        {Number(overview.totals.momGrowth).toFixed(1)}%
                                    </p>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <p className="text-xs text-muted-foreground">{tf.reportForecastEstimate}</p>
                                    <p className="text-xl font-semibold">
                                        {overview.totals.forecastedCost != null
                                            ? formatCurrency(overview.totals.forecastedCost, currency)
                                            : '—'}
                                    </p>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <p className="text-xs text-muted-foreground">{tf.potentialSavings}</p>
                                    <p className="text-xl font-semibold text-emerald-600">
                                        {formatCurrency(overview.totals.potentialSavings, currency)}
                                    </p>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <h3 className="mb-2 text-sm font-semibold">{tf.reportByAccount}</h3>
                                <table className="w-full min-w-[480px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-2 font-medium">{tf.reportAccount}</th>
                                            <th className="pb-2 font-medium">{tf.reportProvider}</th>
                                            <th className="pb-2 text-right font-medium">{tf.reportColCost}</th>
                                            <th className="pb-2 text-right font-medium">{tf.reportShareOfTotal}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAccounts.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                                                    {tf.noAccountInFilter}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredAccounts.map((account) => {
                                                const share = totalCost > 0 ? (Number(account.totalCost) / totalCost) * 100 : 0;
                                                return (
                                                    <tr key={account.id} className="border-b last:border-0">
                                                        <td className="py-2 font-medium">{account.alias}</td>
                                                        <td className="py-2 uppercase text-muted-foreground">
                                                            {account.provider}
                                                        </td>
                                                        <td className="py-2 text-right tabular-nums">
                                                            {formatCurrency(account.totalCost, currency)}
                                                        </td>
                                                        <td className="py-2 text-right tabular-nums">{share.toFixed(1)}%</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="overflow-x-auto">
                                <h3 className="mb-2 text-sm font-semibold">
                                    {tf.reportByService}
                                    {filteredServices.length > 0 ? (
                                        <span className="ml-2 font-normal text-muted-foreground">
                                            ({filteredServices.length})
                                        </span>
                                    ) : null}
                                </h3>
                                <table className="w-full min-w-[480px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-2 font-medium">{tf.reportService}</th>
                                            <th className="pb-2 text-right font-medium">{tf.reportCurrent}</th>
                                            <th className="pb-2 text-right font-medium">{tf.reportPrevious}</th>
                                            <th className="pb-2 text-right font-medium">{tf.reportVariation}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredServices.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                                                    {tf.noServiceInFilter}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredServices.map((item) => (
                                                <tr key={item.service} className="border-b last:border-0">
                                                    <td className="py-2 font-medium">{item.service}</td>
                                                    <td className="py-2 text-right tabular-nums">
                                                        {formatCurrency(item.currentMonthCost, item.currency)}
                                                    </td>
                                                    <td className="py-2 text-right tabular-nums">
                                                        {formatCurrency(item.previousMonthCost, item.currency)}
                                                    </td>
                                                    <td className="py-2 text-right tabular-nums">
                                                        {item.changePercentage.toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="overflow-x-auto">
                                <h3 className="mb-2 text-sm font-semibold">{tf.reportOpportunities}</h3>
                                <table className="w-full min-w-[720px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-2 font-medium">{tf.reportColType}</th>
                                            <th className="pb-2 font-medium">{tf.reportAccount}</th>
                                            <th className="pb-2 font-medium">{tf.reportColTitle}</th>
                                            <th className="pb-2 font-medium">{tf.reportProvider}</th>
                                            <th className="pb-2 text-right font-medium">{tf.reportColImpact}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredOptimizeItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                                                    {tf.noOpenOpportunity}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredOptimizeItems.map((item) => (
                                                <tr key={`${item.kind}-${item.id}`} className="border-b last:border-0">
                                                    <td className="py-2 capitalize">{item.kind}</td>
                                                    <td className="py-2 font-medium">
                                                        {accountAliases[item.cloudAccountId] ?? item.cloudAccountId.slice(0, 8)}
                                                    </td>
                                                    <td className="py-2">{item.title}</td>
                                                    <td className="py-2 uppercase text-muted-foreground">
                                                        {item.cloudProvider}
                                                    </td>
                                                    <td className="py-2 text-right tabular-nums">
                                                        {formatCurrency(item.impact, item.currency)}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
