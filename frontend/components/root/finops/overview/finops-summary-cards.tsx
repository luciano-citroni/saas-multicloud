import { FileText, Loader2, PlayCircle, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, scoreColor, scoreLabel } from '@/components/root/finops/overview/helpers';
import type { FinopsDashboard, FinopsScore } from '@/components/root/finops/overview/types';

type FinopsSummaryCardsProps = {
    dashboard: FinopsDashboard | null;
    score: FinopsScore | null;
    hasConsent: boolean | null;
    canSync: boolean;
    syncing: boolean;
    acceptingConsent: boolean;
    hasRunningJob: boolean;
    refreshing: boolean;
    onStartSync: () => void;
    onAcceptTerms: () => void;
    onRefresh: () => void;
};

export function FinopsSummaryCards({
    dashboard,
    score,
    hasConsent,
    canSync,
    syncing,
    acceptingConsent,
    hasRunningJob,
    refreshing,
    onStartSync,
    onAcceptTerms,
    onRefresh,
}: FinopsSummaryCardsProps) {
    const trendPercentage = Number.isFinite(dashboard?.trend?.growthPercentage)
        ? dashboard?.trend?.growthPercentage ?? 0
        : 0;
    const trendPositive = trendPercentage <= 0;
    const trendLabel = trendPercentage === 0 ? 'sem variação' : trendPositive ? 'de redução' : 'de aumento';
    const isBusy = acceptingConsent || syncing || hasRunningJob;

    function renderSubtitle() {
        if (isBusy) {
            return (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Sincronizando...
                </span>
            );
        }
        if (dashboard?.lastSyncAt) {
            return (
                <p className="text-xs text-muted-foreground">
                    Última sincronização: {formatDate(dashboard.lastSyncAt)}
                </p>
            );
        }
        return <p className="text-xs text-muted-foreground">Nenhuma sincronização realizada</p>;
    }

    function renderActionButton() {
        if (!canSync) return null;

        if (!hasConsent) {
            return (
                <Button size="sm" onClick={onAcceptTerms} isLoading={acceptingConsent} disabled={acceptingConsent}>
                    <FileText className="size-4" />
                    {acceptingConsent ? 'Aguarde...' : 'Aceitar termos'}
                </Button>
            );
        }

        return (
            <Button size="sm" onClick={onStartSync} isLoading={syncing || hasRunningJob} disabled={syncing || hasRunningJob}>
                <PlayCircle className="size-4" />
                {syncing || hasRunningJob ? 'Sincronizando...' : 'Sincronizar custos'}
            </Button>
        );
    }

    return (
        <div className="rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="space-y-0.5">
                    <p className="text-sm font-medium">Visão Geral — FinOps</p>
                    {renderSubtitle()}
                </div>
                <div className="flex items-center gap-2">
                    {renderActionButton()}
                    <Button variant="outline" size="sm" onClick={onRefresh} isLoading={refreshing} disabled={refreshing || isBusy}>
                        <RefreshCw className="size-4" />
                        Atualizar
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Custo Total (mês atual)</p>
                    {dashboard ? (
                        <>
                            <p className="mt-1 truncate text-2xl font-bold">{formatCurrency(dashboard.totalCost, dashboard.currency)}</p>
                            <div className={cn('mt-1 flex items-center gap-1 text-xs', trendPositive ? 'text-green-500' : 'text-destructive')}>
                                {trendPositive ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
                                <span>
                                    {trendPercentage === 0
                                        ? '0,0% sem variação vs período anterior'
                                        : `${Math.abs(trendPercentage).toFixed(1)}% ${trendLabel} vs período anterior`}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="mt-1 text-2xl font-bold text-muted-foreground">--</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {isBusy ? 'Coletando dados...' : 'Sincronize para ver dados'}
                            </p>
                        </>
                    )}
                </div>

                <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Maior serviço</p>
                    {dashboard && dashboard.topServices.length > 0 ? (
                        <>
                            <p className="mt-1 truncate text-lg font-bold">{dashboard.topServices[0].service}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {formatCurrency(dashboard.topServices[0].cost, dashboard.currency)} ({dashboard.topServices[0].percentage.toFixed(1)}%)
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="mt-1 text-2xl font-bold text-muted-foreground">--</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {isBusy ? 'Coletando dados...' : 'Sincronize para ver dados'}
                            </p>
                        </>
                    )}
                </div>

                <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">FinOps Score</p>
                    {score ? (
                        <>
                            <p className={cn('mt-1 text-3xl font-bold', scoreColor(score.score))}>{score.score}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{scoreLabel(score.score)}</p>
                        </>
                    ) : (
                        <>
                            <p className="mt-1 text-3xl font-bold text-muted-foreground">--</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {isBusy ? 'Calculando...' : 'Sincronize para ver dados'}
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
