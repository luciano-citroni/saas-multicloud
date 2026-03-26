import { PlayCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        <div className="grid gap-4 sm:grid-cols-3">
            <Card className="sm:col-span-1">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Score de Governança</CardTitle>
                </CardHeader>
                <CardContent>
                    {score ? (
                        <div className="flex flex-col gap-1">
                            <span className={`text-5xl font-bold ${scoreColor(score.score)}`}>{score.score}</span>
                            <span className="text-sm text-muted-foreground">
                                {scoreLabel(score.score)} — atualizado {formatDate(score.evaluatedAt)}
                            </span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            <span className="text-5xl font-bold text-muted-foreground">--</span>
                            <span className="text-sm text-muted-foreground">Nenhuma varredura realizada ainda</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="sm:col-span-1">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Achados</CardTitle>
                </CardHeader>
                <CardContent>
                    <span className="text-4xl font-bold">{score?.totalFindings ?? '—'}</span>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {score ? `não-conformes em ${score.totalChecks} verificações` : 'Execute uma varredura para ver os achados'}
                    </p>
                </CardContent>
            </Card>

            <Card className="sm:col-span-1 flex flex-col justify-between">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Ações</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                    {canRunScan && (
                        <Button size="sm" onClick={onStartScan} isLoading={scanning || hasRunningJob} disabled={scanning || hasRunningJob}>
                            <PlayCircle className="mr-2 h-4 w-4" />
                            {scanning || hasRunningJob ? 'Varredura em andamento...' : 'Executar Varredura'}
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={onRefresh} isLoading={refreshing}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Atualizar
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
