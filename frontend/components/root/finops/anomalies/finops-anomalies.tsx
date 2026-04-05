'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { fetchFinopsAnomalies, acknowledgeFinopsAnomaly } from '@/app/actions/finops';
import { fetchOrganizationCloudAccountById, type OrganizationCloudAccount } from '@/app/actions/organization';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { FinopsAnomaly } from '@/components/root/finops/overview/types';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

const SEVERITY_CONFIG = {
    critical: { label: 'Crítica', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    high: { label: 'Alta', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    medium: { label: 'Média', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    low: { label: 'Baixa', className: 'bg-muted text-muted-foreground' },
} as const;

const STATUS_LABELS: Record<string, string> = {
    open: 'Abertas',
    acknowledged: 'Reconhecidas',
    resolved: 'Resolvidas',
    all: 'Todas',
};

function SeverityBadge({ severity }: { severity: FinopsAnomaly['severity'] }) {
    const cfg = SEVERITY_CONFIG[severity];
    return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cfg.className)}>{cfg.label}</span>;
}

export function FinopsAnomalies() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const accountFromQuery = searchParams.get('account');
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [cloudAccount, setCloudAccount] = useState<OrganizationCloudAccount | null>(null);
    const [anomalies, setAnomalies] = useState<FinopsAnomaly[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('open');
    const [acknowledging, setAcknowledging] = useState<string | null>(null);

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
        async (orgId: string, cloudId: string, filter: typeof statusFilter) => {
            setLoading(true);
            try {
                const res = await fetchFinopsAnomalies(orgId, cloudId, filter === 'all' ? undefined : filter, 90);
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
                const data = await res.json().catch(() => []);
                setAnomalies(Array.isArray(data) ? data : []);
            } catch {
                toast.error('Não foi possível carregar as anomalias.');
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
        void loadData(organizationId, cloudAccountId, statusFilter);
    }, [organizationId, cloudAccountId, statusFilter, loadData]);

    const handleAcknowledge = async (anomalyId: string) => {
        if (!organizationId || !cloudAccountId) return;
        setAcknowledging(anomalyId);
        try {
            const res = await acknowledgeFinopsAnomaly(organizationId, cloudAccountId, anomalyId);
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }
            toast.success('Anomalia reconhecida.');
            void loadData(organizationId, cloudAccountId, statusFilter);
        } catch {
            toast.error('Não foi possível reconhecer a anomalia.');
        } finally {
            setAcknowledging(null);
        }
    };

    const openCount = anomalies.filter((a) => a.status === 'open').length;
    const dashboardHref = useMemo(() => {
        if (!cloudAccountId) {
            return '/finops';
        }

        return `/finops/dashboard?account=${encodeURIComponent(cloudAccountId)}`;
    }, [cloudAccountId]);

    if (!organizationId || !cloudAccountId) {
        return (
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Anomalias de Custo</p>
                    <p className="text-xs text-muted-foreground">Selecione uma organização e conta cloud na sidebar.</p>
                </div>
            </div>
        );
    }

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
                            <p className="text-sm text-muted-foreground">Todas as anomalias exibidas abaixo pertencem a esta conta cloud.</p>
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

            {/* Section card */}
            <div className="rounded-xl border">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">Anomalias de Custo</p>
                        <p className="text-xs text-muted-foreground">
                            Desvios detectados nos últimos 90 dias
                            {!loading && ` — ${anomalies.length} ${STATUS_LABELS[statusFilter]?.toLowerCase()}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Filter tabs */}
                        <div className="flex gap-1 rounded-lg border p-1">
                            {(['open', 'acknowledged', 'resolved', 'all'] as const).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={cn(
                                        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                                        statusFilter === s ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {s === 'open' && openCount > 0 ? `${STATUS_LABELS[s]} (${openCount})` : STATUS_LABELS[s]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="divide-y">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3">
                                <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
                                    <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                                </div>
                                <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
                                <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
                                <div className="h-3.5 w-12 animate-pulse rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                ) : anomalies.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                        <CheckCircle2 className="h-8 w-8 text-green-500" />
                        <p className="text-sm font-medium">Nenhuma anomalia encontrada</p>
                        <p className="text-xs text-muted-foreground">Os custos estão dentro dos padrões esperados.</p>
                    </div>
                ) : (
                    <>
                        <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                            <span>Severidade</span>
                            <span>Serviço / Data</span>
                            <span className="text-right">Esperado</span>
                            <span className="text-right">Real</span>
                            <span className="text-right">Desvio</span>
                        </div>
                        <div className="divide-y">
                            {anomalies.map((anomaly) => (
                                <div key={anomaly.id} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 px-4 py-2.5">
                                    <SeverityBadge severity={anomaly.severity} />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{anomaly.service}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {anomaly.region || 'global'} · {new Date(anomaly.anomalyDate).toLocaleDateString('pt-BR')}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                                        {formatCurrency(anomaly.expectedCost, anomaly.currency)}
                                    </span>
                                    <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-destructive">
                                        {formatCurrency(anomaly.actualCost, anomaly.currency)}
                                    </span>
                                    <div className="flex items-center justify-end gap-2 shrink-0">
                                        <span className="text-xs font-medium tabular-nums text-destructive">
                                            +{Number(anomaly.deviationPercentage).toFixed(1)}%
                                        </span>
                                        {anomaly.status === 'open' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                isLoading={acknowledging === anomaly.id}
                                                disabled={acknowledging !== null}
                                                onClick={() => void handleAcknowledge(anomaly.id)}
                                            >
                                                OK
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
