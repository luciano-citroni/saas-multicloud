import { AlertCircle, PlayCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate, scoreColor, scoreLabel } from '@/components/root/governance/overview/helpers';
import type { GovernanceScore } from '@/components/root/governance/overview/types';

type GovernanceSummaryCardsProps = {
    score: GovernanceScore | null;
    canRunScan: boolean;
    scanning: boolean;
    hasRunningJob: boolean;
    refreshing: boolean;
    onStartScan: () => void;
    onRefresh: () => void;
};

export function GovernanceSummaryCards({ score, canRunScan, scanning, hasRunningJob, refreshing, onStartScan, onRefresh }: GovernanceSummaryCardsProps) {
    return (
        <div className="rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="space-y-0.5">
                    <p className="text-sm font-medium">Visão Geral</p>
                    <p className="text-xs text-muted-foreground">
                        {score ? `Última varredura: ${formatDate(score.evaluatedAt)}` : 'Nenhuma varredura realizada'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {canRunScan && (
                        <Button size="sm" onClick={onStartScan} isLoading={scanning || hasRunningJob} disabled={scanning || hasRunningJob}>
                            <PlayCircle className="size-4" />
                            {scanning || hasRunningJob ? 'Executando...' : 'Executar varredura'}
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={onRefresh} isLoading={refreshing}>
                        <RefreshCw className="size-4" />
                        Atualizar
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Score de Governança</p>
                    {score ? (
                        <>
                            <p className={cn('mt-1 text-3xl font-bold', scoreColor(score.score))}>{score.score}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{scoreLabel(score.score)}</p>
                        </>
                    ) : (
                        <>
                            <p className="mt-1 text-3xl font-bold text-muted-foreground">--</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">Execute uma varredura</p>
                        </>
                    )}
                </div>

                <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Não-conformidades</p>
                    {score ? (
                        <>
                            <p className="mt-1 text-3xl font-bold">{score.totalFindings}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">em {score.totalChecks} verificações</p>
                        </>
                    ) : (
                        <>
                            <p className="mt-1 text-3xl font-bold text-muted-foreground">--</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">Execute uma varredura</p>
                        </>
                    )}
                </div>

                <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5">
                        <AlertCircle className="size-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Severidade Alta</p>
                    </div>
                    {score ? (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            <div className="rounded border border-destructive/20 bg-destructive/5 px-2 py-1.5">
                                <p className="text-xl font-bold text-destructive">{score.criticalFindings}</p>
                                <p className="text-xs text-muted-foreground">Críticos</p>
                            </div>
                            <div className="rounded border border-orange-500/20 bg-orange-500/5 px-2 py-1.5">
                                <p className="text-xl font-bold text-orange-500">{score.highFindings}</p>
                                <p className="text-xs text-muted-foreground">Altos</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="mt-1 text-3xl font-bold text-muted-foreground">--</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">Execute uma varredura</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
