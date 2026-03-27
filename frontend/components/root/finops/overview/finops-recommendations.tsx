import { cn } from '@/lib/utils';
import { formatCurrency, priorityColor, priorityLabel } from '@/components/root/finops/overview/helpers';
import type { FinopsRecommendation } from '@/components/root/finops/overview/types';

type FinopsRecommendationsProps = {
    recommendations: FinopsRecommendation[];
};

export function FinopsRecommendations({ recommendations }: FinopsRecommendationsProps) {
    const open = recommendations.filter((r) => r.status === 'open');

    return (
        <div className="rounded-xl border">
            <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">Recomendações de Otimização</p>
                <p className="text-xs text-muted-foreground">
                    {open.length > 0 ? `${open.length} oportunidade${open.length > 1 ? 's' : ''} de economia identificada${open.length > 1 ? 's' : ''}` : 'Nenhuma recomendação aberta'}
                </p>
            </div>

            {open.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                    Nenhuma recomendação de otimização disponível. Sincronize os dados para gerar análises.
                </div>
            ) : (
                <div className="divide-y">
                    {open.map((rec) => (
                        <div key={rec.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={cn('text-xs font-semibold uppercase', priorityColor(rec.priority))}>
                                        {priorityLabel(rec.priority)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{rec.resourceType}</span>
                                    <span className="truncate text-xs text-muted-foreground">{rec.resourceId}</span>
                                </div>
                                <p className="mt-0.5 text-sm font-medium">{rec.description}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{rec.recommendation}</p>
                            </div>
                            <div className="shrink-0 text-right">
                                {rec.potentialSaving != null ? (
                                    <>
                                        <p className="text-sm font-bold text-green-600">
                                            {formatCurrency(rec.potentialSaving, rec.currency)}/mês
                                        </p>
                                        <p className="text-xs text-muted-foreground">economia potencial</p>
                                    </>
                                ) : (
                                    <p className="text-xs text-muted-foreground">sem estimativa</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
