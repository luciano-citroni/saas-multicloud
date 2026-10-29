'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { FinopsFilterBar } from '@/components/root/finops/finops-filter-bar';
import {
    ACCOUNT_FILTER_ALL,
    buildFinopsQuery,
    parseFinopsUrlFilters,
} from '@/components/root/finops/finops-filter-utils';
import { ChartViewToggle } from '@/components/root/finops/overview/chart-view-toggle';
import type { ChartType } from '@/components/root/finops/overview/cost-trend-chart';
import {
    FINOPS_CHART_COLORS,
    FINOPS_CHART_GRID,
    FINOPS_CHART_PRIMARY,
    finopsChartInitialDimension,
    finopsChartSurfaceClassName,
    finopsChartTickProps,
    finopsChartTooltipStyles,
} from '@/components/root/finops/overview/finops-chart-theme';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { DashboardPeriod, OrgFinopsOverview } from '@/components/root/finops/overview/types';
import { ACTIVE_ORG_STORAGE_KEY, ACTIVE_ORG_CHANGED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { fetchFinopsOrgOverview } from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

type ProviderRow = {
    provider: string;
    totalCost: number;
    accounts: number;
    openAnomalies: number;
    openRecs: number;
};

export function FinopsMulticloud() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const tf = useTranslations('finops');
    const tc = useTranslations('common');

    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [sidebarAccountId, setSidebarAccountId] = useState<string | null>(null);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [overview, setOverview] = useState<OrgFinopsOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [providerChartType, setProviderChartType] = useState<ChartType>('bar');

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
        window.addEventListener('storage', handle);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
            window.removeEventListener('storage', handle);
        };
    }, []);

    useEffect(() => {
        if (!organizationId) return;
        const load = async () => {
            try {
                const response = await fetchOrganizationCloudAccounts(organizationId);
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
    }, [organizationId]);

    const loadOverview = useCallback(
        async (orgId: string, silent = false) => {
            if (!silent) setLoading(true);
            try {
                const response = await fetchFinopsOrgOverview(orgId, {
                    period: urlFilters.period,
                    cloudAccountId: urlFilters.accountId ?? undefined,
                });
                if (response.status === 401) {
                    toast.error(tc.sessionExpired);
                    router.replace('/auth/sign-in');
                    return;
                }
                if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    toast.error(extractErrorMessage(payload));
                    setOverview(null);
                    return;
                }
                setOverview((await response.json().catch(() => null)) as OrgFinopsOverview | null);
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
        void loadOverview(organizationId);
    }, [organizationId, loadOverview]);

    const providerRows = useMemo(() => {
        const map = new Map<string, ProviderRow>();
        for (const account of overview?.accounts ?? []) {
            const provider = (account.provider || 'other').toLowerCase();
            if (urlFilters.provider && provider !== urlFilters.provider) continue;
            const current = map.get(provider) ?? {
                provider,
                totalCost: 0,
                accounts: 0,
                openAnomalies: 0,
                openRecs: 0,
            };
            current.totalCost += Number(account.totalCost ?? 0);
            current.accounts += 1;
            current.openAnomalies += Number(account.openAnomalies ?? 0);
            current.openRecs += Number(account.openRecs ?? 0);
            map.set(provider, current);
        }
        return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
    }, [overview?.accounts, urlFilters.provider]);

    const currency = overview?.totals.currency ?? 'USD';
    const chartData = providerRows.map((row) => ({
        name: row.provider.toUpperCase(),
        cost: row.totalCost,
    }));

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
                        <h1 className="text-xl font-semibold tracking-tight">Multicloud</h1>
                        <p className="text-sm text-muted-foreground">
                            Comparação de custos e riscos entre provedores cloud
                        </p>
                    </div>
                    <FinopsSubnav />
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={refreshing}
                    onClick={async () => {
                        setRefreshing(true);
                        await loadOverview(organizationId, true);
                        setRefreshing(false);
                    }}
                >
                    <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                    Atualizar
                </Button>
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

            <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Provedores com custo</CardDescription>
                        <CardTitle className="text-2xl">{providerRows.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Custo consolidado</CardDescription>
                        <CardTitle className="text-2xl">
                            {formatCurrency(
                                providerRows.reduce((sum, row) => sum + row.totalCost, 0),
                                currency
                            )}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Anomalias abertas</CardDescription>
                        <CardTitle className="text-2xl">
                            {providerRows.reduce((sum, row) => sum + row.openAnomalies, 0)}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle>Custo por provedor</CardTitle>
                        <CardDescription>
                            {overview?.period
                                ? `${overview.period.startDate} → ${overview.period.endDate}`
                                : 'Período selecionado'}
                        </CardDescription>
                    </div>
                    <ChartViewToggle value={providerChartType} onChange={setProviderChartType} />
                </CardHeader>
                <CardContent>
                    {chartData.length === 0 ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">Sem dados para comparar</p>
                    ) : (
                        <div className={cn('h-72 w-full min-w-0', finopsChartSurfaceClassName)}>
                            <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
                                {providerChartType === 'bar' ? (
                                    <BarChart data={chartData} margin={{ left: 8, right: 16, bottom: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={FINOPS_CHART_GRID} vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            tick={finopsChartTickProps}
                                            axisLine={{ stroke: FINOPS_CHART_GRID }}
                                            tickLine={{ stroke: FINOPS_CHART_GRID }}
                                        />
                                        <YAxis
                                            tick={finopsChartTickProps}
                                            tickFormatter={(value) => formatCurrency(Number(value), currency)}
                                            width={90}
                                            axisLine={{ stroke: FINOPS_CHART_GRID }}
                                            tickLine={{ stroke: FINOPS_CHART_GRID }}
                                        />
                                        <Tooltip
                                            formatter={(value) => formatCurrency(Number(value), currency)}
                                            contentStyle={finopsChartTooltipStyles.contentStyle}
                                            labelStyle={finopsChartTooltipStyles.labelStyle}
                                            itemStyle={finopsChartTooltipStyles.itemStyle}
                                            cursor={finopsChartTooltipStyles.cursor}
                                        />
                                        <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                                            {chartData.map((_, index) => (
                                                <Cell
                                                    key={index}
                                                    fill={FINOPS_CHART_COLORS[index % FINOPS_CHART_COLORS.length]}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                ) : (
                                    <LineChart data={chartData} margin={{ left: 8, right: 16, bottom: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={FINOPS_CHART_GRID} vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            tick={finopsChartTickProps}
                                            axisLine={{ stroke: FINOPS_CHART_GRID }}
                                            tickLine={{ stroke: FINOPS_CHART_GRID }}
                                        />
                                        <YAxis
                                            tick={finopsChartTickProps}
                                            tickFormatter={(value) => formatCurrency(Number(value), currency)}
                                            width={90}
                                            axisLine={{ stroke: FINOPS_CHART_GRID }}
                                            tickLine={{ stroke: FINOPS_CHART_GRID }}
                                        />
                                        <Tooltip
                                            formatter={(value) => formatCurrency(Number(value), currency)}
                                            contentStyle={finopsChartTooltipStyles.contentStyle}
                                            labelStyle={finopsChartTooltipStyles.labelStyle}
                                            itemStyle={finopsChartTooltipStyles.itemStyle}
                                            cursor={finopsChartTooltipStyles.cursor}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="cost"
                                            stroke={FINOPS_CHART_PRIMARY}
                                            strokeWidth={2}
                                            dot={{ r: 4, fill: FINOPS_CHART_PRIMARY, strokeWidth: 0 }}
                                        />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Detalhamento multicloud</CardTitle>
                    <CardDescription>Contas, custo e oportunidades por provedor</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-sm">
                            <thead>
                                <tr className="border-b text-left text-muted-foreground">
                                    <th className="pb-2 font-medium">Provedor</th>
                                    <th className="pb-2 font-medium">Contas</th>
                                    <th className="pb-2 text-right font-medium">Custo</th>
                                    <th className="pb-2 text-right font-medium">Anomalias</th>
                                    <th className="pb-2 text-right font-medium">Recomendações</th>
                                    <th className="pb-2 text-right font-medium">Participação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {providerRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                                            Nenhum provedor com dados no período
                                        </td>
                                    </tr>
                                ) : (
                                    providerRows.map((row) => {
                                        const total = providerRows.reduce((sum, item) => sum + item.totalCost, 0);
                                        const share = total > 0 ? (row.totalCost / total) * 100 : 0;
                                        return (
                                            <tr key={row.provider} className="border-b last:border-0">
                                                <td className="py-2.5 font-medium uppercase">{row.provider}</td>
                                                <td className="py-2.5">{row.accounts}</td>
                                                <td className="py-2.5 text-right tabular-nums">
                                                    {formatCurrency(row.totalCost, currency)}
                                                </td>
                                                <td className="py-2.5 text-right">{row.openAnomalies}</td>
                                                <td className="py-2.5 text-right">{row.openRecs}</td>
                                                <td className="py-2.5 text-right tabular-nums">{share.toFixed(1)}%</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
