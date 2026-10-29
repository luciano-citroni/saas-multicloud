'use client';

import { CheckCircle2, LoaderCircle, Search, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Trace, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace';

export type AiChatToolStep = {
    name: string;
    status: 'started' | 'finished' | 'error';
};

const TOOL_LABELS: Record<string, string> = {
    get_cloud_accounts: 'Contas cloud',
    get_cost_summary: 'Resumo de custos',
    compare_cloud_costs: 'Comparação de custos',
    get_saving_opportunities: 'Oportunidades de economia',
    get_cloud_resources_summary: 'Inventário de recursos',
    get_assessment_jobs: 'Jobs de assessment',
    get_governance_score: 'Score de governança',
    get_governance_findings: 'Findings de governança',
    get_automations: 'Automações',
    get_automation_runs: 'Execuções de automação',
    get_saas_documentation: 'Documentação do SaaS',
};

export function AiChatResearching({ label }: { label: string }) {
    return (
        <div className="space-y-3 py-0.5">
            <Trace>
                <TraceLine status="running">
                    <TraceIcon>
                        <Search className="size-3.5" />
                    </TraceIcon>
                    <TraceTitle>{label}</TraceTitle>
                </TraceLine>
            </Trace>
            <div className="space-y-2 pl-6">
                <Skeleton className="shimmer-bar h-3 w-[88%] rounded-full" />
                <Skeleton className="shimmer-bar h-3 w-[72%] rounded-full" />
                <Skeleton className="shimmer-bar h-3 w-[64%] rounded-full" />
                <div className="border-border mt-2 overflow-hidden rounded-lg border">
                    <div className="bg-muted/40 flex gap-2 px-3 py-2">
                        <Skeleton className="shimmer-bar h-2.5 w-14 rounded-full" />
                        <Skeleton className="shimmer-bar h-2.5 w-16 rounded-full" />
                        <Skeleton className="shimmer-bar h-2.5 w-12 rounded-full" />
                    </div>
                    <div className="space-y-2 p-3">
                        <Skeleton className="shimmer-bar h-2.5 w-full rounded-full" />
                        <Skeleton className="shimmer-bar h-2.5 w-[92%] rounded-full" />
                        <Skeleton className="shimmer-bar h-2.5 w-[80%] rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AiChatToolTrace({ steps, label }: { steps: AiChatToolStep[]; label: string }) {
    if (!steps.length) {
        return null;
    }

    const running = steps.some((step) => step.status === 'started');

    return (
        <Trace className="mb-1">
            <TraceLine status={running ? 'running' : undefined}>
                <TraceIcon>
                    {running ? <LoaderCircle className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                </TraceIcon>
                <TraceTitle>{label}</TraceTitle>
            </TraceLine>
            <div className="border-border ml-2 space-y-1.5 border-l pl-4">
                {steps.map((step, index) => {
                    const status =
                        step.status === 'started' ? 'running' : step.status === 'error' ? 'error' : undefined;
                    return (
                        <TraceLine key={`${step.name}-${index}`} status={status}>
                            <TraceIcon>
                                {step.status === 'started' ? (
                                    <LoaderCircle className="size-3.5 animate-spin" />
                                ) : step.status === 'error' ? (
                                    <XCircle className="text-destructive size-3.5" />
                                ) : (
                                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                                )}
                            </TraceIcon>
                            <TraceTitle>{TOOL_LABELS[step.name] ?? step.name}</TraceTitle>
                        </TraceLine>
                    );
                })}
            </div>
        </Trace>
    );
}
