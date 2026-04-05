'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Activity, ArrowLeft, Calendar, Cloud } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { fetchFinopsForecast, fetchFinopsForecastNextMonths } from '@/app/actions/finops';
import { fetchOrganizationCloudAccountById, type OrganizationCloudAccount } from '@/app/actions/organization';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { ForecastResult, ForecastMonthProjection } from '@/components/root/finops/overview/types';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

const CONFIDENCE_CONFIG = {
    high: { label: 'Alta confiança', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    medium: { label: 'Média confiança', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    low: { label: 'Baixa confiança', className: 'bg-muted text-muted-foreground' },
} as const;

function shortenService(name: string): string {
    return name
        .replace(/^Amazon\s+/i, '')
        .replace(/^AWS\s+/i, '')
        .slice(0, 22);
}

const chartConfig = {
    forecastedCost: { label: 'Forecast', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function FinopsForecast() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const accountFromQuery = searchParams.get('account');
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [cloudAccount, setCloudAccount] = useState<OrganizationCloudAccount | null>(null);
    const [forecast, setForecast] = useState<ForecastResult | null>(null);
    const [nextMonths, setNextMonths] = useState<ForecastMonthProjection[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const storedCloudAccountId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
        const resolvedCloudAccountId = accountFromQuery ?? storedCloudAccountId;

        setOrganizationId(storedOrganizationId);
        setCloudAccountId(resolvedCloudAccountId);

        if (accountFromQuery) {
            window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, accountFromQuery);
        }
    }, [accountFromQuery]);

    useEffect(() => {
        if (!organizationId || !cloudAccountId) {
            setCloudAccount(null);
            return;
        }

        let isCancelled = false;

        const loadCloudAccount = async () => {
            try {
                const response = await fetchOrganizationCloudAccountById(organizationId, cloudAccountId);
                if (!response.ok) {
                    return;
                }

                const payload = await response.json().catch(() => null);
                if (!isCancelled && payload && typeof payload === 'object') {
                    setCloudAccount(payload as OrganizationCloudAccount);
                }
            } catch {
                if (!isCancelled) {
                    setCloudAccount(null);
                }
            }
        };

        void loadCloudAccount();

        return () => {
            isCancelled = true;
        };
    }, [organizationId, cloudAccountId]);

    const loadData = useCallback(
        async (orgId: string, cloudId: string) => {
            setLoading(true);
            try {
                const [forecastRes, nextRes] = await Promise.all([fetchFinopsForecast(orgId, cloudId), fetchFinopsForecastNextMonths(orgId, cloudId, 3)]);
                if (forecastRes.status === 401) {
                    toast.error('Sessão expirada.');
                    router.replace('/auth/sign-in');
                    return;
                }
                if (forecastRes.ok) {
                    const data = await forecastRes.json().catch(() => null);
                    setForecast(data as ForecastResult | null);
                } else {
                    const body = await forecastRes.json().catch(() => null);
                    toast.error(extractErrorMessage(body, 'pt'));
                }
                if (nextRes.ok) {
                    const data = await nextRes.json().catch(() => []);
                    setNextMonths(Array.isArray(data) ? data : []);
                }
            } catch {
                toast.error('Não foi possível carregar o forecast.');
            } finally {
                setLoading(false);
            }
        },
        [router]
    );

    useEffect(() => {
        if (!organizationId || !cloudAccountId) {
            setLoading(false);
            return;
        }
        void loadData(organizationId, cloudAccountId);
    }, [organizationId, cloudAccountId, loadData]);

    if (!organizationId || !cloudAccountId) {
        return (
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Forecast de Custos</p>
                    <p className="text-xs text-muted-foreground">Selecione uma conta cloud na sidebar.</p>
                </div>
            </div>
        );
    }

    const currency = forecast?.currency ?? 'USD';
    const chartData = (forecast?.byService ?? []).slice(0, 8).map((s) => ({ ...s, label: shortenService(s.service) }));
    const chartHeight = Math.max(180, chartData.length * 36);
    const dashboardHref = useMemo(() => {
        if (!cloudAccountId) {
            return '/finops';
        }

        return `/finops/dashboard?account=${encodeURIComponent(cloudAccountId)}`;
    }, [cloudAccountId]);

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-2xl border bg-background/95">
                <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            <Cloud className="size-3.5" />
                            Conta selecionada
                        </div>
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-semibold">{cloudAccount?.alias ?? 'Carregando conta'}</p>
                                {cloudAccount?.provider ? (
                                    <span className="rounded-full border px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
                                        {cloudAccount.provider}
                                    </span>
                                ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">Este forecast usa apenas o histórico e a tendência desta conta cloud.</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href={dashboardHref}>
                            <ArrowLeft className="size-4" />
                            Voltar ao dashboard
                        </Link>
                    </Button>
                </div>
            </div>

            {/* KPI section */}
            <div className="rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">Forecast de Custos</p>
                        <p className="text-xs text-muted-foreground">Projeção baseada no consumo atual do mês</p>
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="rounded-lg border p-3">
                                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                                <div className="mt-2 h-7 w-28 animate-pulse rounded bg-muted" />
                                <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                ) : !forecast ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                        <Activity className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">Dados insuficientes</p>
                        <p className="text-xs text-muted-foreground">Realize uma sincronização FinOps para gerar o forecast.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                        <div className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">Forecast do mês</p>
                                <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-medium', CONFIDENCE_CONFIG[forecast.confidence].className)}>
                                    {CONFIDENCE_CONFIG[forecast.confidence].label}
                                </span>
                            </div>
                            <p className="mt-1 truncate text-xl font-bold">{formatCurrency(forecast.forecastedCost, currency)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {forecast.daysElapsed}d decorridos · {forecast.daysRemaining}d restantes
                            </p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Custo diário médio</p>
                            <p className="mt-1 truncate text-xl font-bold">{formatCurrency(forecast.avgDailyCost, currency)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">média dos últimos {forecast.daysElapsed}d</p>
                        </div>
                        <div className="col-span-2 rounded-lg border p-3 sm:col-span-1">
                            <p className="text-xs text-muted-foreground">Período</p>
                            <p className="mt-1 text-sm font-bold">
                                {new Date(forecast.periodStart + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                {' → '}
                                {new Date(forecast.periodEnd + 'T12:00:00Z').toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                })}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">mês corrente</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Service breakdown chart */}
            {!loading && forecast && chartData.length > 0 && (
                <div className="rounded-xl border">
                    <div className="border-b px-4 py-3">
                        <p className="text-sm font-medium">Forecast por serviço</p>
                        <p className="text-xs text-muted-foreground">Projeção ao final do mês</p>
                    </div>
                    <div className="p-4">
                        <ChartContainer config={chartConfig} style={{ height: chartHeight }} className="w-full">
                            <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                                <CartesianGrid horizontal={false} />
                                <YAxis dataKey="label" type="category" width={100} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                                <XAxis
                                    type="number"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`)}
                                />
                                <ChartTooltip
                                    cursor={{ fill: 'color-mix(in oklch, var(--muted) 40%, transparent)' }}
                                    content={<ChartTooltipContent labelKey="label" formatter={(value) => formatCurrency(Number(value), currency)} />}
                                />
                                <Bar dataKey="forecastedCost" fill="var(--chart-2)" radius={[0, 4, 4, 0]} maxBarSize={24} />
                            </BarChart>
                        </ChartContainer>
                    </div>
                </div>
            )}

            {/* Next months */}
            {!loading && nextMonths.length > 0 && (
                <div className="rounded-xl border">
                    <div className="border-b px-4 py-3">
                        <p className="text-sm font-medium">Projeção próximos meses</p>
                        <p className="text-xs text-muted-foreground">Baseado na média dos últimos 3 meses</p>
                    </div>
                    <div className="divide-y">
                        {nextMonths.map((m) => {
                            const [year, month] = m.month.split('-').map(Number);
                            const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                            return (
                                <div key={m.month} className="flex items-center justify-between px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="size-4 text-muted-foreground" />
                                        <span className="text-sm font-medium capitalize">{label}</span>
                                    </div>
                                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(m.forecastedCost), m.currency)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
