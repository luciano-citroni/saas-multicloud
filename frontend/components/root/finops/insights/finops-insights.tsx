'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Award, Cloud, Lightbulb, TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { fetchFinopsInsights } from '@/app/actions/finops';
import { fetchOrganizationCloudAccountById, type OrganizationCloudAccount } from '@/app/actions/organization';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { OptimizationInsight } from '@/components/root/finops/overview/types';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

const RANK_COLORS = ['text-yellow-500', 'text-gray-400', 'text-amber-600'] as const;

export function FinopsInsights() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const accountFromQuery = searchParams.get('account');
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [cloudAccount, setCloudAccount] = useState<OrganizationCloudAccount | null>(null);
    const [insights, setInsights] = useState<OptimizationInsight | null>(null);
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
                const res = await fetchFinopsInsights(orgId, cloudId);
                if (res.status === 401) {
                    toast.error('Sessão expirada.');
                    router.replace('/auth/sign-in');
                    return;
                }
                if (!res.ok) {
                    const body = await res.json().catch(() => null);
                    toast.error(extractErrorMessage(body, 'pt'));
                    return;
                }
                const data = await res.json().catch(() => null);
                setInsights(data as OptimizationInsight | null);
            } catch {
                toast.error('Não foi possível carregar os insights.');
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
                    <p className="text-sm font-medium">Insights de Otimização</p>
                    <p className="text-xs text-muted-foreground">Selecione uma conta cloud na sidebar.</p>
                </div>
            </div>
        );
    }

    const currency = insights?.currency ?? 'USD';
    const dashboardHref = useMemo(() => {
        if (!cloudAccountId) {
            return '/finops';
        }

        return `/finops/dashboard?account=${encodeURIComponent(cloudAccountId)}`;
    }, [cloudAccountId]);

    if (loading) {
        return (
            <div className="flex flex-col gap-4">
                <div className="h-28 animate-pulse rounded-2xl border bg-muted/30" />
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="h-48 animate-pulse rounded-xl border bg-muted/30" />
                    <div className="flex flex-col gap-4">
                        <div className="h-20 animate-pulse rounded-xl border bg-muted/30" />
                        <div className="h-20 animate-pulse rounded-xl border bg-muted/30" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-2xl border bg-linear-to-r from-background via-background to-muted/30">
                <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            <Cloud className="size-3.5" />
                            Conta selecionada
                        </div>
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-semibold">{cloudAccount?.alias ?? 'Conta atual'}</p>
                                {cloudAccount?.provider ? (
                                    <span className="rounded-full border px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
                                        {cloudAccount.provider}
                                    </span>
                                ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">Os insights abaixo refletem somente o comportamento desta conta cloud.</p>
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

            {/* Page header card */}
            <div className="rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">Insights de Otimização</p>
                        <p className="text-xs text-muted-foreground">Análise avançada do mês corrente</p>
                    </div>
                </div>

                {!insights ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                        <Lightbulb className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">Dados insuficientes</p>
                        <p className="text-xs text-muted-foreground">Realize uma sincronização FinOps para gerar os insights.</p>
                    </div>
                ) : (
                    /* KPI summary row */
                    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Top serviço</p>
                            {insights.topExpensiveServices[0] ? (
                                <>
                                    <p className="mt-1 truncate text-base font-bold">
                                        {insights.topExpensiveServices[0].service.replace(/^Amazon\s+/i, '').replace(/^AWS\s+/i, '')}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {formatCurrency(insights.topExpensiveServices[0].cost, insights.topExpensiveServices[0].currency)}
                                    </p>
                                </>
                            ) : (
                                <p className="mt-1 text-xl font-bold text-muted-foreground">—</p>
                            )}
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Maior crescimento</p>
                            {insights.highestGrowthService ? (
                                <>
                                    <p className="mt-1 truncate text-base font-bold text-destructive">
                                        +{Number(insights.highestGrowthService.growthPercentage).toFixed(1)}%
                                    </p>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {insights.highestGrowthService.service.replace(/^Amazon\s+/i, '').replace(/^AWS\s+/i, '')}
                                    </p>
                                </>
                            ) : (
                                <p className="mt-1 text-xl font-bold text-muted-foreground">—</p>
                            )}
                        </div>
                        <div className="col-span-2 rounded-lg border p-3 sm:col-span-1">
                            <p className="text-xs text-muted-foreground">Economia potencial</p>
                            <p className="mt-1 truncate text-xl font-bold">{formatCurrency(Number(insights.totalWaste), currency)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">via recomendações abertas</p>
                        </div>
                    </div>
                )}
            </div>

            {insights && (
                <div className="grid gap-4 sm:grid-cols-2">
                    {/* Top 3 services */}
                    <div className="rounded-xl border">
                        <div className="border-b px-4 py-3">
                            <p className="text-sm font-medium">Top serviços mais caros</p>
                            <p className="text-xs text-muted-foreground">Mês corrente</p>
                        </div>
                        <div className="divide-y">
                            {insights.topExpensiveServices.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                                    <Award className="h-8 w-8 text-muted-foreground" />
                                    <p className="text-xs text-muted-foreground">Sem dados disponíveis</p>
                                </div>
                            ) : (
                                insights.topExpensiveServices.map((svc, idx) => (
                                    <div key={svc.service} className="flex items-center gap-3 px-4 py-2.5">
                                        <span
                                            className={cn('w-6 text-center text-base font-bold tabular-nums', RANK_COLORS[idx] ?? 'text-muted-foreground')}
                                        >
                                            #{idx + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{svc.service}</p>
                                        </div>
                                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(svc.cost, svc.currency)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Growth + waste + reasons */}
                    <div className="flex flex-col gap-4">
                        {insights.highestGrowthService && (
                            <div className="rounded-xl border">
                                <div className="border-b px-4 py-3">
                                    <p className="text-sm font-medium flex items-center gap-2">
                                        <TrendingUp className="size-4 text-destructive" />
                                        Maior crescimento
                                    </p>
                                </div>
                                <div className="p-4">
                                    <p className="truncate text-base font-bold">{insights.highestGrowthService.service}</p>
                                    <p className="mt-0.5 text-xs font-medium text-destructive">
                                        +{Number(insights.highestGrowthService.growthPercentage).toFixed(1)}% vs mês anterior
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {formatCurrency(insights.highestGrowthService.cost, currency)} no mês atual
                                    </p>
                                </div>
                            </div>
                        )}
                        <div className="rounded-xl border">
                            <div className="border-b px-4 py-3">
                                <p className="text-sm font-medium flex items-center gap-2">
                                    <Zap className="size-4 text-yellow-500" />
                                    Economia potencial
                                </p>
                            </div>
                            <div className="p-4">
                                <p className="text-xl font-bold">{formatCurrency(Number(insights.totalWaste), currency)}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">via recomendações abertas</p>
                            </div>
                        </div>
                    </div>

                    {/* Cost increase reasons */}
                    {insights.costIncreaseReasons.length > 0 && (
                        <div className="rounded-xl border sm:col-span-2">
                            <div className="border-b px-4 py-3">
                                <p className="text-sm font-medium">Causas de aumento identificadas</p>
                            </div>
                            <div className="divide-y">
                                {insights.costIncreaseReasons.map((reason, idx) => (
                                    <div key={idx} className="flex items-start gap-3 px-4 py-2.5">
                                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
                                        <p className="text-sm">{reason}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
