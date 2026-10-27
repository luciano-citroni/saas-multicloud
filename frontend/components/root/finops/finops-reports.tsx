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
import { ACTIVE_ORG_STORAGE_KEY, ACTIVE_ORG_CHANGED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
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
            : 'Todas as contas';

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
            toast.error('Gere a pré-visualização antes de exportar.');
            return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const orgSlug = (organizationId ?? 'org').slice(0, 8);
        const rows: string[][] = [
            ['Relatório FinOps'],
            ['Gerado em', generatedAt ? formatDate(generatedAt) : today],
            ['Organização', organizationId ?? ''],
            ['Período', periodLabel(urlFilters.period)],
            ['Intervalo', `${overview.period.startDate} → ${overview.period.endDate}`],
            ['Conta', accountAlias],
            ['Provedor', urlFilters.provider?.toUpperCase() ?? 'Todos'],
            ['Serviço', urlFilters.service ?? 'Todos'],
            [],
            ['Resumo executivo'],
            ['Custo total', String(totalCost), currency],
            ['Variação MoM %', String(overview.totals.momGrowth)],
            ['Previsão do mês', overview.totals.forecastedCost != null ? String(overview.totals.forecastedCost) : ''],
            ['Economia potencial', String(overview.totals.potentialSavings)],
            ['Anomalias abertas', String(filteredOptimizeItems.filter((item) => item.kind === 'anomaly').length)],
            [
                'Recomendações abertas',
                String(filteredOptimizeItems.filter((item) => item.kind === 'recommendation').length),
            ],
            [],
            ['Custos por conta'],
            ['Alias', 'Provedor', 'Custo', 'Anomalias', 'Recomendações'],
            ...filteredAccounts.map((account) => [
                account.alias,
                account.provider,
                String(account.totalCost),
                String(account.openAnomalies),
                String(account.openRecs),
            ]),
            [],
            ['Custos por serviço'],
            ['Serviço', 'Custo atual', 'Custo anterior', 'Variação %', 'Tendência'],
            ...filteredServices.map((item) => [
                item.service,
                String(item.currentMonthCost),
                String(item.previousMonthCost),
                String(item.changePercentage),
                item.trend,
            ]),
            [],
            ['Oportunidades e anomalias'],
            ['Tipo', 'Conta', 'Título', 'Provedor', 'Impacto', 'Severidade/Prioridade', 'Status'],
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
        toast.success('Relatório CSV gerado (compatível com Excel).');
    };

    const handleExportPdf = async () => {
        if (!overview || !generatedAt) {
            toast.error('Gere a pré-visualização antes de exportar.');
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
                providerLabel: urlFilters.provider?.toUpperCase() ?? 'Todos',
                serviceLabel: urlFilters.service ?? 'Todos',
                generatedAt,
                fileName: `finops-report-${orgSlug}-${today}.pdf`,
            });
            toast.success('Relatório PDF gerado.');
        } catch {
            toast.error('Não foi possível gerar o PDF.');
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
                        <h1 className="text-xl font-semibold tracking-tight">Relatórios</h1>
                        <p className="text-sm text-muted-foreground">
                            Pré-visualização sob demanda com os mesmos critérios do dashboard. Sem histórico persistido.
                        </p>
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
                        Atualizar
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExport} disabled={!overview}>
                        <Download className="size-4" />
                        Exportar CSV
                    </Button>
                    <Button size="sm" onClick={() => void handleExportPdf()} disabled={!overview} isLoading={exportingPdf}>
                        <FileText className="size-4" />
                        Exportar PDF
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
                        Pré-visualização
                    </CardTitle>
                    <CardDescription>
                        {generatedAt ? `Gerado em ${formatDate(generatedAt)}` : 'Aguardando dados'}
                        {overview?.period ? ` · ${overview.period.startDate} → ${overview.period.endDate}` : ''}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {!overview ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">Sem dados para o relatório</p>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-xl border p-4">
                                    <p className="text-xs text-muted-foreground">Custo total</p>
                                    <p className="text-xl font-semibold">{formatCurrency(totalCost, currency)}</p>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <p className="text-xs text-muted-foreground">Variação MoM</p>
                                    <p className="text-xl font-semibold">
                                        {Number(overview.totals.momGrowth).toFixed(1)}%
                                    </p>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <p className="text-xs text-muted-foreground">Previsão (estimativa)</p>
                                    <p className="text-xl font-semibold">
                                        {overview.totals.forecastedCost != null
                                            ? formatCurrency(overview.totals.forecastedCost, currency)
                                            : '—'}
                                    </p>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <p className="text-xs text-muted-foreground">Economia potencial</p>
                                    <p className="text-xl font-semibold text-emerald-600">
                                        {formatCurrency(overview.totals.potentialSavings, currency)}
                                    </p>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <h3 className="mb-2 text-sm font-semibold">Por conta</h3>
                                <table className="w-full min-w-[480px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-2 font-medium">Conta</th>
                                            <th className="pb-2 font-medium">Provedor</th>
                                            <th className="pb-2 text-right font-medium">Custo</th>
                                            <th className="pb-2 text-right font-medium">% do total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAccounts.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                                                    Nenhuma conta no filtro
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
                                    Por serviço
                                    {filteredServices.length > 0 ? (
                                        <span className="ml-2 font-normal text-muted-foreground">
                                            ({filteredServices.length})
                                        </span>
                                    ) : null}
                                </h3>
                                <table className="w-full min-w-[480px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-2 font-medium">Serviço</th>
                                            <th className="pb-2 text-right font-medium">Atual</th>
                                            <th className="pb-2 text-right font-medium">Anterior</th>
                                            <th className="pb-2 text-right font-medium">Variação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredServices.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                                                    Nenhum serviço no filtro
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
                                <h3 className="mb-2 text-sm font-semibold">Oportunidades e anomalias</h3>
                                <table className="w-full min-w-[720px] text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-2 font-medium">Tipo</th>
                                            <th className="pb-2 font-medium">Conta</th>
                                            <th className="pb-2 font-medium">Título</th>
                                            <th className="pb-2 font-medium">Provedor</th>
                                            <th className="pb-2 text-right font-medium">Impacto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredOptimizeItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                                                    Nenhuma oportunidade/anomalia aberta
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
