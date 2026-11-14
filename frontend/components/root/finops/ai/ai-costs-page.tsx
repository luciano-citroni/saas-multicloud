'use client';

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileText, Filter, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
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
    exportAiFinopsExecutiveCsv,
    exportAiFinopsExecutivePdf,
    exportAiFinopsUsage,
    fetchAiFinopsConnections,
    fetchAiFinopsCostUsers,
    fetchAiFinopsDashboard,
    fetchAiFinopsExecutive,
    fetchAiFinopsExplorer,
    fetchAiFinopsHeatmap,
    fetchAiFinopsMom,
    fetchAiFinopsRecommendations,
    fetchAiFinopsReconciliation,
    fetchAiFinopsUsage,
    generateAiFinopsRecommendations,
} from '@/app/actions/ai-finops';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { downloadCsv, periodLabel } from '@/components/root/finops/finops-filter-utils';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import {
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
type AiPeriod = 'last7days' | 'last30days' | 'last90days' | 'currentmonth';

type DashboardPayload = {
    note?: string;
    period?: { start: string; end: string };
    totals?: {
        officialCost: number;
        estimatedGatewayCost: number;
        totalTokens: number;
        requestCount: number;
        activeModels: number;
    };
    series?: {
        daily: Array<{ date: string; officialCost: number; estimatedCost: number; totalTokens: number }>;
        byProvider: Array<{ provider: string; officialCost: number; estimatedCost: number }>;
        byModel: Array<{ model: string; officialCost: number; estimatedCost: number }>;
    };
};

type ExecutivePayload = {
    topConsumers?: Array<{ key: string; label?: string; officialCost: number; estimatedCost: number }>;
    topModels?: Array<{ key: string; label?: string; officialCost: number; estimatedCost: number }>;
    topProviders?: Array<{ key: string; label?: string; officialCost: number; estimatedCost: number }>;
};

type MomPayload = {
    deltas?: {
        totalTokens: number | null;
        officialCost: number | null;
        estimatedGatewayCost: number | null;
        requestCount: number | null;
    };
};

type AiConnection = {
    id: string;
    name: string;
    providerSlug: string;
};

type AiCostUser = {
    externalId: string;
    label: string;
};

type RankRow = { name: string; amount: number };

const AI_PERIODS: AiPeriod[] = ['last7days', 'last30days', 'last90days', 'currentmonth'];
const CONNECTION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_USER_ID_RE = /^[A-Za-z0-9._:-]{1,255}$/;
const AI_PROVIDER_SLUG_RE = /^[a-z0-9_]{1,64}$/;

function asArray<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
        return (payload as { items: T[] }).items;
    }
    return [];
}

function parseAiPeriod(value: string | null): AiPeriod {
    if (value === 'last7days' || value === 'last30days' || value === 'last90days' || value === 'currentmonth') {
        return value;
    }
    return 'last30days';
}

function parseConnectionIds(value: string | null): string[] {
    if (!value || value === 'all') return [];
    const ids = value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => CONNECTION_UUID_RE.test(part));
    return Array.from(new Set(ids));
}

function serializeConnectionIds(ids: string[]): string | undefined {
    const unique = Array.from(new Set(ids.filter((id) => CONNECTION_UUID_RE.test(id))));
    return unique.length > 0 ? unique.join(',') : undefined;
}

function parseProviderUserIds(value: string | null): string[] {
    if (!value || value === 'all') return [];
    const ids = value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => PROVIDER_USER_ID_RE.test(part));
    return Array.from(new Set(ids));
}

function serializeProviderUserIds(ids: string[]): string | undefined {
    const unique = Array.from(new Set(ids.filter((id) => PROVIDER_USER_ID_RE.test(id))));
    return unique.length > 0 ? unique.join(',') : undefined;
}

function resolveAiPeriodDates(period: AiPeriod): { startDate: string; endDate: string } {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = new Date(today);
    const start = new Date(today);

    if (period === 'last7days') start.setUTCDate(end.getUTCDate() - 6);
    else if (period === 'last30days') start.setUTCDate(end.getUTCDate() - 29);
    else if (period === 'last90days') start.setUTCDate(end.getUTCDate() - 89);
    else start.setUTCDate(1);

    return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
    };
}

function formatDelta(
    value: number | null | undefined,
    template: string,
): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return template.replace('{sign}', sign).replace('{value}', value.toFixed(1));
}

function formatMoney(value: number): string {
    return formatCurrency(value, 'USD');
}

function formatChartValue(value: unknown): string {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    return formatMoney(amount);
}

const chartValueLabelStyle = { fontSize: 11, fontWeight: 600, fill: 'var(--foreground)' } as const;

export function AiCostsPage() {
    const t = useTranslations('finops');
    const tc = useTranslations('common');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const periodParam = searchParams.get('period');
    const connectionParam = searchParams.get('connection');
    const userParam = searchParams.get('user');
    const aiProviderParam = searchParams.get('aiProvider');
    const selectedPeriod = parseAiPeriod(periodParam);
    const selectedConnectionIds = useMemo(
        () => parseConnectionIds(connectionParam),
        [connectionParam],
    );
    const selectedUserIds = useMemo(() => parseProviderUserIds(userParam), [userParam]);
    const selectedProvider =
        aiProviderParam && AI_PROVIDER_SLUG_RE.test(aiProviderParam) ? aiProviderParam : null;
    const periodDates = useMemo(() => resolveAiPeriodDates(selectedPeriod), [selectedPeriod]);

    const [tenantId, setTenantId] = useState<string | null>(null);
    const [midOrgId, setMidOrgId] = useState<string | null>(null);
    const [connections, setConnections] = useState<AiConnection[]>([]);
    const [costUsers, setCostUsers] = useState<AiCostUser[]>([]);
    const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
    const [executive, setExecutive] = useState<ExecutivePayload | null>(null);
    const [mom, setMom] = useState<MomPayload | null>(null);
    const [usageItems, setUsageItems] = useState<Array<Record<string, unknown>>>([]);
    const [explorerItems, setExplorerItems] = useState<Array<Record<string, unknown>>>([]);
    const [heatmapCells, setHeatmapCells] = useState<Array<Record<string, unknown>>>([]);
    const [reconcileItems, setReconcileItems] = useState<Array<Record<string, unknown>>>([]);
    const [recommendations, setRecommendations] = useState<Array<Record<string, unknown>>>([]);
    const [loading, setLoading] = useState(true);
    const [pending, startTransition] = useTransition();

    const updateFilters = useCallback(
        (patch: {
            period?: AiPeriod;
            connections?: string[];
            users?: string[];
            provider?: string | null;
        }) => {
            const params = new URLSearchParams(searchParams.toString());
            const nextPeriod = patch.period ?? selectedPeriod;
            params.set('period', nextPeriod);
            const nextProvider =
                patch.provider !== undefined ? patch.provider : selectedProvider;
            if (!nextProvider) params.delete('aiProvider');
            else params.set('aiProvider', nextProvider);
            const nextConnections = patch.connections ?? selectedConnectionIds;
            const serializedConnections = serializeConnectionIds(nextConnections);
            if (!serializedConnections) params.delete('connection');
            else params.set('connection', serializedConnections);
            const nextUsers = patch.users ?? selectedUserIds;
            const serializedUsers = serializeProviderUserIds(nextUsers);
            if (!serializedUsers) params.delete('user');
            else params.set('user', serializedUsers);
            // Drop cloud-only filters that FinopsSubnav may carry over.
            params.delete('account');
            params.delete('provider');
            params.delete('service');
            params.delete('tab');
            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [
            pathname,
            router,
            searchParams,
            selectedConnectionIds,
            selectedPeriod,
            selectedProvider,
            selectedUserIds,
        ],
    );

    useEffect(() => {
        const periodOk = AI_PERIODS.includes(periodParam as AiPeriod);
        const rawConnectionParts = connectionParam
            ? connectionParam.split(',').map((part) => part.trim()).filter(Boolean)
            : [];
        const connectionOk =
            !connectionParam ||
            connectionParam === 'all' ||
            (rawConnectionParts.length > 0 &&
                rawConnectionParts.every((part) => CONNECTION_UUID_RE.test(part)));
        const rawUserParts = userParam
            ? userParam.split(',').map((part) => part.trim()).filter(Boolean)
            : [];
        const userOk =
            !userParam ||
            userParam === 'all' ||
            (rawUserParts.length > 0 &&
                rawUserParts.every((part) => PROVIDER_USER_ID_RE.test(part)));
        const providerOk = !aiProviderParam || AI_PROVIDER_SLUG_RE.test(aiProviderParam);
        if (periodOk && connectionOk && userOk && providerOk && periodParam) return;
        updateFilters({
            period: selectedPeriod,
            connections: connectionOk ? selectedConnectionIds : [],
            users: userOk ? selectedUserIds : [],
            provider: providerOk ? selectedProvider : null,
        });
    }, [
        aiProviderParam,
        connectionParam,
        periodParam,
        selectedConnectionIds,
        selectedPeriod,
        selectedProvider,
        selectedUserIds,
        updateFilters,
        userParam,
    ]);

    const buildCostQuery = useCallback(
        (extra: Record<string, string | undefined> = {}) => {
            const query: Record<string, string | undefined> = {
                startDate: periodDates.startDate,
                endDate: periodDates.endDate,
                ...extra,
            };
            if (midOrgId) query.midOrganizationId = midOrgId;
            if (selectedProvider) query.provider = selectedProvider;
            const serializedConnections = serializeConnectionIds(selectedConnectionIds);
            if (serializedConnections) query.connectionIds = serializedConnections;
            const serializedUsers = serializeProviderUserIds(selectedUserIds);
            if (serializedUsers) query.providerUserExternalIds = serializedUsers;
            return query;
        },
        [
            midOrgId,
            periodDates.endDate,
            periodDates.startDate,
            selectedConnectionIds,
            selectedProvider,
            selectedUserIds,
        ],
    );

    const load = useCallback(() => {
        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const mid = getActiveMidOrgId(orgId);
        setTenantId(orgId);
        setMidOrgId(mid);
        if (!orgId) {
            setLoading(false);
            return;
        }

        startTransition(async () => {
            setLoading(true);
            try {
                const serializedConnections = serializeConnectionIds(selectedConnectionIds);
                const serializedUsers = serializeProviderUserIds(selectedUserIds);
                const filterQuery = {
                    startDate: periodDates.startDate,
                    endDate: periodDates.endDate,
                    ...(mid ? { midOrganizationId: mid } : {}),
                    ...(selectedProvider ? { provider: selectedProvider } : {}),
                    ...(serializedConnections ? { connectionIds: serializedConnections } : {}),
                };
                const costQuery = {
                    ...filterQuery,
                    ...(serializedUsers ? { providerUserExternalIds: serializedUsers } : {}),
                };

                const [
                    connectionsRes,
                    usersRes,
                    dashRes,
                    execRes,
                    momRes,
                    usageRes,
                    explorerRes,
                    heatRes,
                    reconRes,
                    recsRes,
                ] = await Promise.all([
                    fetchAiFinopsConnections(orgId, mid ?? undefined),
                    fetchAiFinopsCostUsers(orgId, filterQuery),
                    fetchAiFinopsDashboard(orgId, costQuery),
                    fetchAiFinopsExecutive(orgId, costQuery),
                    fetchAiFinopsMom(orgId, mid ?? undefined),
                    fetchAiFinopsUsage(orgId, { ...costQuery, limit: '25' }),
                    fetchAiFinopsExplorer(orgId, { ...costQuery, groupBy: 'model' }),
                    fetchAiFinopsHeatmap(orgId, costQuery),
                    fetchAiFinopsReconciliation(orgId, costQuery),
                    fetchAiFinopsRecommendations(orgId, mid ?? undefined),
                ]);

                if (connectionsRes.ok) {
                    setConnections(asArray<AiConnection>(await connectionsRes.json()));
                } else {
                    setConnections([]);
                }

                if (usersRes.ok) {
                    setCostUsers(asArray<AiCostUser>(await usersRes.json()));
                } else {
                    setCostUsers([]);
                }

                if (!dashRes.ok) {
                    toast.error(extractErrorMessage(await dashRes.json().catch(() => ({}))));
                    setDashboard(null);
                } else {
                    setDashboard((await dashRes.json()) as DashboardPayload);
                }

                setExecutive(execRes.ok ? ((await execRes.json()) as ExecutivePayload) : null);
                setMom(momRes.ok ? ((await momRes.json()) as MomPayload) : null);

                const usageBody = usageRes.ok ? await usageRes.json().catch(() => ({ items: [] })) : { items: [] };
                setUsageItems(asArray<Record<string, unknown>>(usageBody));

                const explorerBody = explorerRes.ok
                    ? await explorerRes.json().catch(() => ({ items: [] }))
                    : { items: [] };
                setExplorerItems(asArray<Record<string, unknown>>(explorerBody));

                const heatBody = heatRes.ok ? await heatRes.json().catch(() => ({ cells: [] })) : { cells: [] };
                setHeatmapCells(
                    Array.isArray(heatBody.cells) ? heatBody.cells : asArray<Record<string, unknown>>(heatBody),
                );

                const reconBody = reconRes.ok
                    ? await reconRes.json().catch(() => ({ items: [] }))
                    : { items: [] };
                setReconcileItems(asArray<Record<string, unknown>>(reconBody));

                setRecommendations(recsRes.ok ? asArray(await recsRes.json()) : []);
            } catch {
                toast.error(t.loadError);
                setDashboard(null);
            } finally {
                setLoading(false);
            }
        });
    }, [
        periodDates.endDate,
        periodDates.startDate,
        selectedConnectionIds,
        selectedProvider,
        selectedUserIds,
        t.loadError,
    ]);

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onChange);
        return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onChange);
    }, [load]);

    const kpis = useMemo((): Array<{ title: string; value: string; detail?: string }> => {
        return [
            {
                title: t.aiKpiOfficialCost,
                value: formatMoney(dashboard?.totals?.officialCost ?? 0),
                detail: formatDelta(mom?.deltas?.officialCost, t.aiMomDelta),
            },
            {
                title: t.aiKpiGatewayEst,
                value: formatMoney(dashboard?.totals?.estimatedGatewayCost ?? 0),
                detail: formatDelta(mom?.deltas?.estimatedGatewayCost, t.aiMomDelta),
            },
            {
                title: t.aiKpiTokens,
                value: String(dashboard?.totals?.totalTokens ?? 0),
                detail: formatDelta(mom?.deltas?.totalTokens, t.aiMomDelta),
            },
            {
                title: t.aiKpiRequests,
                value: String(dashboard?.totals?.requestCount ?? 0),
                detail: formatDelta(mom?.deltas?.requestCount, t.aiMomDelta),
            },
            {
                title: t.aiKpiActiveModels,
                value: String(dashboard?.totals?.activeModels ?? 0),
                detail: dashboard?.period
                    ? `${dashboard.period.start} → ${dashboard.period.end}`
                    : undefined,
            },
        ];
    }, [dashboard, mom, t]);

    const topConsumers = useMemo(
        () =>
            (executive?.topConsumers ?? []).map((row) => ({
                name: row.label || row.key,
                amount: Number(row.officialCost ?? 0) || Number(row.estimatedCost ?? 0),
            })),
        [executive],
    );
    const topModels = useMemo(
        () =>
            (executive?.topModels ?? []).map((row) => ({
                name: row.label || row.key,
                amount: Number(row.officialCost ?? 0) || Number(row.estimatedCost ?? 0),
            })),
        [executive],
    );
    const topProviders = useMemo(
        () =>
            (executive?.topProviders ?? []).map((row) => ({
                name: row.label || row.key,
                amount: Number(row.officialCost ?? 0) || Number(row.estimatedCost ?? 0),
            })),
        [executive],
    );

    const exportWithFilters = (fn: () => Promise<void>) => {
        if (!tenantId) return;
        startTransition(async () => {
            await fn();
        });
    };

    const hasActiveFilters =
        selectedPeriod !== 'last30days' ||
        Boolean(selectedProvider) ||
        selectedConnectionIds.length > 0 ||
        selectedUserIds.length > 0;

    const providerOptions = useMemo(() => {
        return Array.from(
            new Set(connections.map((connection) => connection.providerSlug).filter(Boolean)),
        ).sort();
    }, [connections]);

    const filteredConnections = useMemo(() => {
        if (!selectedProvider) return connections;
        return connections.filter((connection) => connection.providerSlug === selectedProvider);
    }, [connections, selectedProvider]);

    const selectedConnectionLabel = useMemo(() => {
        if (selectedConnectionIds.length === 0) return '';
        if (selectedConnectionIds.length === 1) {
            const only = selectedConnectionIds[0];
            return (
                connections.find((connection) => connection.id === only)?.name ?? only.slice(0, 8)
            );
        }
        return t.aiConnectionsSelected.replace('{count}', String(selectedConnectionIds.length));
    }, [connections, selectedConnectionIds, t.aiConnectionsSelected]);

    const selectedUserLabel = useMemo(() => {
        if (selectedUserIds.length === 0) return '';
        if (selectedUserIds.length === 1) {
            const only = selectedUserIds[0];
            return costUsers.find((user) => user.externalId === only)?.label ?? only;
        }
        return t.aiUsersSelected.replace('{count}', String(selectedUserIds.length));
    }, [costUsers, selectedUserIds, t.aiUsersSelected]);

    const onProviderChange = (value: string) => {
        const nextProvider = value === 'all' ? null : value;
        const nextConnections =
            nextProvider == null
                ? selectedConnectionIds
                : selectedConnectionIds.filter((id) => {
                      const connection = connections.find((item) => item.id === id);
                      return connection?.providerSlug === nextProvider;
                  });
        updateFilters({ provider: nextProvider, connections: nextConnections });
    };

    if (!tenantId && !loading) {
        return (
            <div className="flex flex-col gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{t.selectOrgTitle}</CardTitle>
                        <CardDescription>{t.selectOrgDesc}</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-16">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                    <div className="text-muted-foreground flex items-center gap-2">
                        <Sparkles className="size-4" />
                        <span className="text-xs font-medium tracking-wide uppercase">FinOps</span>
                    </div>
                    <h1 className="text-xl font-semibold tracking-tight text-balance">{t.aiTitle}</h1>
                    <p className="text-muted-foreground max-w-2xl text-sm text-pretty">
                        {t.aiDesc}{' '}
                        <Link className="text-foreground font-medium underline-offset-2 hover:underline" href="/ai-governance">
                            {t.aiGovernanceLink}
                        </Link>
                        .
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/finops/budgets?kind=ai">{t.aiManageBudgets}</Link>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!tenantId || pending}
                        onClick={() =>
                            exportWithFilters(async () => {
                                if (!tenantId) return;
                                const res = await exportAiFinopsExecutiveCsv(tenantId, buildCostQuery());
                                const body = await res.json().catch(() => ({}));
                                if (!res.ok) {
                                    toast.error(extractErrorMessage(body));
                                    return;
                                }
                                const rows = String(body.csv ?? '')
                                    .split('\n')
                                    .map((line: string) => line.split(','));
                                downloadCsv(body.filename ?? 'ai-finops-executive.csv', rows);
                                toast.success(t.aiExecCsvExported);
                            })
                        }
                    >
                        <FileText className="size-3.5" />
                        {t.aiExportCsv}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!tenantId || pending}
                        onClick={() =>
                            exportWithFilters(async () => {
                                if (!tenantId) return;
                                const res = await exportAiFinopsExecutivePdf(tenantId, buildCostQuery());
                                if (!res.ok) {
                                    toast.error(extractErrorMessage(await res.json().catch(() => ({}))));
                                    return;
                                }
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `ai-finops-executive-${periodDates.endDate}.pdf`;
                                a.click();
                                URL.revokeObjectURL(url);
                                toast.success(t.aiExecPdfExported);
                            })
                        }
                    >
                        <FileText className="size-3.5" />
                        {t.aiExportPdf}
                    </Button>
                    <Button variant="outline" size="sm" isLoading={pending} onClick={load}>
                        <RefreshCw className="size-3.5" />
                        {tc.refresh}
                    </Button>
                </div>
            </div>

            <FinopsSubnav />

            <section className="space-y-3 rounded-xl border p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Filter className="text-muted-foreground size-4" />
                        {t.filtersTitle}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground text-xs tabular-nums">
                            {periodDates.startDate} → {periodDates.endDate}
                        </span>
                        {hasActiveFilters ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                    updateFilters({
                                        period: 'last30days',
                                        provider: null,
                                        connections: [],
                                        users: [],
                                    })
                                }
                            >
                                <RotateCcw className="size-3.5" />
                                {t.clearFilters}
                            </Button>
                        ) : null}
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SearchableSelect
                        mode="single"
                        label={t.budgetPeriod}
                        value={selectedPeriod}
                        options={AI_PERIODS.map((period) => ({
                            value: period,
                            label: periodLabel(period),
                        }))}
                        onValueChange={(value) => updateFilters({ period: parseAiPeriod(value) })}
                    />
                    <SearchableSelect
                        mode="single"
                        label={t.aiProvider}
                        value={selectedProvider ?? 'all'}
                        placeholder={t.aiAllProviders}
                        options={[
                            { value: 'all', label: t.aiAllProviders },
                            ...providerOptions.map((slug) => ({ value: slug, label: slug })),
                        ]}
                        onValueChange={onProviderChange}
                    />
                    <SearchableSelect
                        mode="multiple"
                        label={t.aiConnection}
                        value={selectedConnectionIds}
                        allLabel={t.aiAllConnections}
                        clearLabel={t.aiClearConnections}
                        emptyText={t.aiNoConnectionsFilter}
                        selectedCountLabel={t.aiConnectionsSelected}
                        options={filteredConnections.map((connection) => ({
                            value: connection.id,
                            label: `${connection.name} (${connection.providerSlug})`,
                        }))}
                        onValueChange={(connections) => updateFilters({ connections })}
                    />
                    <SearchableSelect
                        mode="multiple"
                        label={t.aiUser}
                        value={selectedUserIds}
                        allLabel={t.aiAllUsers}
                        clearLabel={t.aiClearUsers}
                        emptyText={t.aiNoUsers}
                        selectedCountLabel={t.aiUsersSelected}
                        options={costUsers.map((user) => ({
                            value: user.externalId,
                            label: user.label,
                        }))}
                        onValueChange={(users) => updateFilters({ users })}
                    />
                </div>

                {hasActiveFilters ? (
                    <p className="text-muted-foreground text-xs">
                        {periodLabel(selectedPeriod)}
                        {selectedProvider ? ` · ${selectedProvider}` : ''}
                        {selectedConnectionLabel ? ` · ${selectedConnectionLabel}` : ''}
                        {selectedUserLabel ? ` · ${selectedUserLabel}` : ''}
                    </p>
                ) : null}
            </section>

            {loading && !dashboard ? <FinopsLoadingSkeleton /> : null}

            {dashboard ? (
                <>
                    <section className="space-y-3">
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">{t.aiOverviewTitle}</h2>
                            <p className="text-muted-foreground text-sm">{t.aiOverviewNoteTokens}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            {kpis.map((kpi) => (
                                <Kpi
                                    key={kpi.title}
                                    title={kpi.title}
                                    value={kpi.value}
                                    detail={kpi.detail}
                                />
                            ))}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">{t.aiTrendsTitle}</h2>
                            <p className="text-muted-foreground text-sm">{t.aiTrendsDesc}</p>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <ChartCard title={t.aiDailyCost} description={t.aiDailyCostDesc}>
                                <DailyCostChart
                                    points={dashboard?.series?.daily ?? []}
                                    officialLabel={t.aiSeriesOfficial}
                                    gatewayLabel={t.aiSeriesGateway}
                                />
                            </ChartCard>
                            <ChartCard title={t.aiByProvider}>
                                <ProviderCostChart
                                    rows={dashboard?.series?.byProvider ?? []}
                                    officialLabel={t.aiSeriesOfficial}
                                    gatewayLabel={t.aiSeriesGateway}
                                    empty={t.aiEmptyProviderSpend}
                                />
                            </ChartCard>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-3">
                            <ChartCard title={t.aiTopConsumers} span="third">
                                <RankChart
                                    rows={topConsumers}
                                    empty={t.aiEmptyConsumers}
                                    seriesName={t.aiSeriesCost}
                                />
                            </ChartCard>
                            <ChartCard title={t.aiTopModels} span="third">
                                <RankChart
                                    rows={topModels}
                                    empty={t.aiEmptyModels}
                                    seriesName={t.aiSeriesCost}
                                />
                            </ChartCard>
                            <ChartCard title={t.aiTopProviders} span="third">
                                <RankChart
                                    rows={topProviders}
                                    empty={t.aiEmptyProviders}
                                    seriesName={t.aiSeriesCost}
                                />
                            </ChartCard>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">{t.aiDetailsTitle}</h2>
                            <p className="text-muted-foreground text-sm">{t.aiDetailsDesc}</p>
                        </div>
                    <Tabs defaultValue="usage" className="gap-4">
                        <TabsList className="bg-muted/40 h-auto w-full flex-wrap justify-start gap-1 p-1">
                            <TabsTrigger value="usage">{t.aiTabUsage}</TabsTrigger>
                            <TabsTrigger value="explorer">{t.aiTabExplorer}</TabsTrigger>
                            <TabsTrigger value="reconcile">{t.aiTabReconcile}</TabsTrigger>
                            <TabsTrigger value="recommendations">{t.aiTabRecommendations}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="usage" className="space-y-3">
                            <Button
                                variant="outline"
                                disabled={!tenantId || pending}
                                onClick={() =>
                                    exportWithFilters(async () => {
                                        if (!tenantId) return;
                                        const res = await exportAiFinopsUsage(tenantId, buildCostQuery());
                                        const body = await res.json().catch(() => ({ items: [] }));
                                        if (!res.ok) {
                                            toast.error(extractErrorMessage(body));
                                            return;
                                        }
                                        const rows: string[][] = [
                                            [
                                                'occurredAt',
                                                'usageSource',
                                                'provider',
                                                'model',
                                                'userId',
                                                'providerUserExternalId',
                                                'teamId',
                                                'applicationId',
                                                'totalTokens',
                                                'officialCost',
                                                'estimatedCost',
                                            ],
                                            ...asArray<Record<string, unknown>>(body).map((item) => [
                                                String(item.occurredAt ?? ''),
                                                String(item.usageSource ?? ''),
                                                String(item.provider ?? ''),
                                                String(item.model ?? ''),
                                                String(item.userId ?? ''),
                                                String(item.providerUserExternalId ?? ''),
                                                String(item.teamId ?? ''),
                                                String(item.applicationId ?? ''),
                                                String(item.totalTokens ?? 0),
                                                String(item.officialCost ?? ''),
                                                String(item.estimatedCost ?? ''),
                                            ]),
                                        ];
                                        downloadCsv(
                                            `ai-finops-usage-${periodDates.endDate}.csv`,
                                            rows,
                                        );
                                        toast.success(t.aiCsvExported);
                                    })
                                }
                            >
                                {t.aiExportUsageCsv}
                            </Button>
                            <Card>
                                <CardContent className="pt-6">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t.aiColWhen}</TableHead>
                                                <TableHead>{t.aiColSource}</TableHead>
                                                <TableHead>{t.aiColProvider}</TableHead>
                                                <TableHead>{t.aiColModel}</TableHead>
                                                <TableHead>{t.aiColUser}</TableHead>
                                                <TableHead>{t.aiColTeam}</TableHead>
                                                <TableHead>{t.aiColApp}</TableHead>
                                                <TableHead>{t.aiColTokens}</TableHead>
                                                <TableHead>{t.aiColOfficial}</TableHead>
                                                <TableHead>{t.aiColEstimated}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {usageItems.map((item) => (
                                                <TableRow key={String(item.id)}>
                                                    <TableCell>
                                                        {item.occurredAt
                                                            ? new Date(String(item.occurredAt)).toLocaleString()
                                                            : '—'}
                                                    </TableCell>
                                                    <TableCell>{String(item.usageSource ?? '')}</TableCell>
                                                    <TableCell>{String(item.provider ?? '')}</TableCell>
                                                    <TableCell>{String(item.model ?? '')}</TableCell>
                                                    <TableCell>
                                                        {String(
                                                            item.userDisplayName ??
                                                                item.userId ??
                                                                item.providerUserExternalId ??
                                                                '—',
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{String(item.teamId ?? '—')}</TableCell>
                                                    <TableCell>{String(item.applicationId ?? '—')}</TableCell>
                                                    <TableCell>{String(item.totalTokens ?? 0)}</TableCell>
                                                    <TableCell>{String(item.officialCost ?? '—')}</TableCell>
                                                    <TableCell>{String(item.estimatedCost ?? '—')}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="explorer" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">{t.aiGroupByModel}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t.aiColKey}</TableHead>
                                                <TableHead>{t.aiColOfficial}</TableHead>
                                                <TableHead>{t.aiColEstimated}</TableHead>
                                                <TableHead>{t.aiColTokens}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {explorerItems.map((item) => (
                                                <TableRow key={String(item.key)}>
                                                    <TableCell>
                                                        {String(item.label ?? item.key)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {Number(item.officialCost ?? 0).toFixed(4)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {Number(item.estimatedCost ?? 0).toFixed(4)}
                                                    </TableCell>
                                                    <TableCell>{String(item.totalTokens ?? 0)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">{t.aiHeatmapTitle}</CardTitle>
                                    <CardDescription>{t.aiHeatmapDesc}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t.aiColUser}</TableHead>
                                                <TableHead>{t.aiColModel}</TableHead>
                                                <TableHead>{t.aiColTokens}</TableHead>
                                                <TableHead>{t.aiColOfficial}</TableHead>
                                                <TableHead>{t.aiColEstimated}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {heatmapCells.slice(0, 50).map((cell) => (
                                                <TableRow key={`${cell.userId}-${cell.model}`}>
                                                    <TableCell>
                                                        {String(cell.userLabel ?? cell.userId)}
                                                    </TableCell>
                                                    <TableCell>{String(cell.model)}</TableCell>
                                                    <TableCell>{String(cell.totalTokens ?? 0)}</TableCell>
                                                    <TableCell>
                                                        {Number(cell.officialCost ?? 0).toFixed(4)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {Number(cell.estimatedCost ?? 0).toFixed(4)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="reconcile">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">{t.aiReconcileTitle}</CardTitle>
                                    <CardDescription>{t.aiReconcileDesc}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t.aiColDate}</TableHead>
                                                <TableHead>{t.aiColProvider}</TableHead>
                                                <TableHead>{t.aiColModel}</TableHead>
                                                <TableHead>{t.aiColOfficial}</TableHead>
                                                <TableHead>{t.aiColEstimated}</TableHead>
                                                <TableHead>{t.aiColGap}</TableHead>
                                                <TableHead>{t.aiColStatus}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {reconcileItems.map((item) => (
                                                <TableRow
                                                    key={`${item.date}-${item.provider}-${item.model}`}
                                                >
                                                    <TableCell>{String(item.date)}</TableCell>
                                                    <TableCell>{String(item.provider)}</TableCell>
                                                    <TableCell>{String(item.model)}</TableCell>
                                                    <TableCell>
                                                        {Number(item.official ?? 0).toFixed(4)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {Number(item.estimated ?? 0).toFixed(4)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.gapPct == null
                                                            ? '—'
                                                            : `${Number(item.gapPct).toFixed(1)}%`}
                                                    </TableCell>
                                                    <TableCell>{String(item.status)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="recommendations" className="space-y-3">
                            <Button
                                variant="outline"
                                disabled={!midOrgId || pending}
                                onClick={() => {
                                    if (!tenantId || !midOrgId) return;
                                    startTransition(async () => {
                                        const res = await generateAiFinopsRecommendations(
                                            tenantId,
                                            midOrgId,
                                        );
                                        const body = await res.json().catch(() => ({}));
                                        if (!res.ok) {
                                            toast.error(extractErrorMessage(body));
                                            return;
                                        }
                                        toast.success(
                                            typeof body.message === 'string'
                                                ? body.message
                                                : t.aiRecsUpdated,
                                        );
                                        load();
                                    });
                                }}
                            >
                                {t.aiGenerateRecs}
                            </Button>
                            <Card>
                                <CardContent className="space-y-3 pt-6">
                                    {recommendations.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">{t.aiNoRecs}</p>
                                    ) : (
                                        recommendations.map((rec) => (
                                            <div
                                                key={String(rec.id)}
                                                className="rounded-md border px-3 py-2"
                                            >
                                                <div className="font-medium">{String(rec.title)}</div>
                                                <p className="text-muted-foreground text-sm">
                                                    {String(rec.description)}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                    </section>
                </>
            ) : null}
        </div>
    );
}

function Kpi({ title, value, detail }: { title: string; value: string; detail?: string }) {
    return (
        <Card className="h-full justify-between gap-3">
            <CardHeader className="pb-0">
                <CardDescription className="line-clamp-2 h-5 text-xs">{title}</CardDescription>
                <CardTitle className="truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                    {value}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground line-clamp-2 h-8 text-xs leading-4">
                    {detail ?? '\u00a0'}
                </p>
            </CardContent>
        </Card>
    );
}

function ChartCard({
    title,
    description,
    span = 'half',
    children,
}: {
    title: string;
    description?: string;
    span?: 'half' | 'third' | 'full';
    children: ReactNode;
}) {
    return (
        <Card data-span={span} className="break-inside-avoid">
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                {description ? <CardDescription>{description}</CardDescription> : null}
            </CardHeader>
            <CardContent className="h-72">{children}</CardContent>
        </Card>
    );
}

function DailyCostChart({
    points,
    officialLabel,
    gatewayLabel,
}: {
    points: Array<{ date: string; officialCost: number; estimatedCost: number }>;
    officialLabel: string;
    gatewayLabel: string;
}) {
    const data = points.map((point) => ({
        ...point,
        label: point.date.slice(8),
    }));
    return (
        <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
            <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={FINOPS_CHART_GRID} vertical={false} />
                <XAxis dataKey="label" tick={finopsChartTickProps} />
                <YAxis
                    tick={finopsChartTickProps}
                    tickFormatter={(value) => formatChartValue(value)}
                    width={72}
                />
                <Tooltip
                    {...finopsChartTooltipStyles}
                    formatter={(value) => formatChartValue(value)}
                    labelFormatter={(_, payload) => String(payload?.[0]?.payload?.date ?? '')}
                />
                <Legend />
                <Line
                    type="monotone"
                    dataKey="officialCost"
                    name={officialLabel}
                    stroke={FINOPS_CHART_PRIMARY}
                    dot={false}
                    strokeWidth={2}
                />
                <Line
                    type="monotone"
                    dataKey="estimatedCost"
                    name={gatewayLabel}
                    stroke={FINOPS_CHART_COLORS[2]}
                    dot={false}
                    strokeWidth={2}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}

function ProviderCostChart({
    rows,
    officialLabel,
    gatewayLabel,
    empty,
}: {
    rows: Array<{ provider: string; officialCost: number; estimatedCost: number }>;
    officialLabel: string;
    gatewayLabel: string;
    empty: string;
}) {
    if (rows.length === 0) {
        return (
            <p className="text-muted-foreground flex h-full items-center justify-center text-center text-sm">
                {empty}
            </p>
        );
    }
    return (
        <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
            <BarChart data={rows} margin={{ top: 28, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={FINOPS_CHART_GRID} vertical={false} />
                <XAxis dataKey="provider" tick={finopsChartTickProps} />
                <YAxis
                    tick={finopsChartTickProps}
                    tickFormatter={(value) => formatChartValue(value)}
                    width={72}
                />
                <Tooltip {...finopsChartTooltipStyles} formatter={(value) => formatChartValue(value)} />
                <Legend />
                <Bar dataKey="officialCost" name={officialLabel} fill={FINOPS_CHART_PRIMARY} radius={4}>
                    <LabelList
                        dataKey="officialCost"
                        position="top"
                        offset={8}
                        formatter={(value) => formatChartValue(value)}
                        style={chartValueLabelStyle}
                    />
                </Bar>
                <Bar dataKey="estimatedCost" name={gatewayLabel} fill={FINOPS_CHART_COLORS[2]} radius={4} />
            </BarChart>
        </ResponsiveContainer>
    );
}

function RankChart({
    rows,
    empty,
    seriesName,
    axisWidth = 128,
}: {
    rows: RankRow[];
    empty?: string;
    seriesName: string;
    axisWidth?: number;
}) {
    if (rows.length === 0) {
        return (
            <p className="text-muted-foreground flex h-full items-center justify-center text-center text-sm">
                {empty}
            </p>
        );
    }
    const maxChars = axisWidth >= 160 ? 24 : 18;
    return (
        <div className="h-full min-h-72 w-full">
            <ResponsiveContainer width="100%" height="100%" initialDimension={finopsChartInitialDimension}>
                <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 88, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke={FINOPS_CHART_GRID} horizontal={false} />
                    <XAxis
                        type="number"
                        tick={finopsChartTickProps}
                        tickFormatter={(value) => formatChartValue(value)}
                    />
                    <YAxis
                        type="category"
                        dataKey="name"
                        width={axisWidth}
                        tick={finopsChartTickProps}
                        tickFormatter={(value: string) =>
                            value.length > maxChars ? `${value.slice(0, maxChars - 2)}…` : value
                        }
                    />
                    <Tooltip
                        {...finopsChartTooltipStyles}
                        formatter={(value) => formatChartValue(value)}
                    />
                    <Bar dataKey="amount" name={seriesName} fill={FINOPS_CHART_PRIMARY} radius={4}>
                        <LabelList
                            dataKey="amount"
                            position="right"
                            offset={6}
                            formatter={(value) => formatChartValue(value)}
                            style={chartValueLabelStyle}
                        />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
