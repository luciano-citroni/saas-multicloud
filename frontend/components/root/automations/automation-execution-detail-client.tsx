'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Loader2,
    ArrowLeft,
    RotateCcw,
    CheckCircle2,
    Circle,
    XCircle,
    SkipForward,
    PlayCircle,
    ChevronDown,
    Clock3,
    RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import {
    fetchAutomationExecution,
    rollbackAutomationExecution,
    type AutomationExecutionNode,
    type AutomationWorkflowExecution,
} from '@/app/actions/automations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { executionStatusClass, provisionedStatusClass } from './status-styles';

function getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

type ProvisionedResource = {
    id: string;
    resourceType: string;
    awsResourceId: string | null;
    stackId: string | null;
    region: string;
    status: string;
};

type FlowNode = {
    id: string;
    type: string;
    name: string;
    config?: Record<string, unknown>;
};

type FlowEdge = {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
};

type ExecutionWithResources = AutomationWorkflowExecution & {
    resources?: ProvisionedResource[];
    flowDefinition?: {
        nodes?: FlowNode[];
        edges?: FlowEdge[];
    };
};

function formatDuration(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${ms} ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}m ${rest}s`;
}

function stepDuration(node: AutomationExecutionNode): string {
    if (!node.startedAt || !node.finishedAt) return '—';
    return formatDuration(new Date(node.finishedAt).getTime() - new Date(node.startedAt).getTime());
}

function StepIcon({ status }: { status: string }) {
    if (status === 'SUCCESS') return <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
    if (status === 'FAILED') return <XCircle className="h-5 w-5 text-destructive" />;
    if (status === 'SKIPPED' || status === 'CANCELLED') return <SkipForward className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
    if (status === 'RUNNING') return <PlayCircle className="h-5 w-5 animate-pulse text-primary" />;
    return <Circle className="h-5 w-5 text-muted-foreground" />;
}

function orderFlowSteps(flowNodes: FlowNode[], edges: FlowEdge[], executionNodes: AutomationExecutionNode[]): FlowNode[] {
    if (flowNodes.length === 0) {
        return executionNodes.map((node) => ({
            id: node.nodeId,
            type: 'UNKNOWN',
            name: node.nodeId.slice(0, 8),
        }));
    }

    const byId = new Map(flowNodes.map((node) => [node.id, node]));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, string[]>();
    for (const node of flowNodes) {
        incoming.set(node.id, 0);
        outgoing.set(node.id, []);
    }
    for (const edge of edges) {
        if (!byId.has(edge.sourceNodeId) || !byId.has(edge.targetNodeId)) continue;
        outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
        incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1);
    }

    const queue = flowNodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
    const ordered: FlowNode[] = [];
    const seen = new Set<string>();
    while (queue.length > 0) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const node = byId.get(id);
        if (node) ordered.push(node);
        for (const next of outgoing.get(id) ?? []) {
            const remaining = (incoming.get(next) ?? 1) - 1;
            incoming.set(next, remaining);
            if (remaining === 0) queue.push(next);
        }
    }

    for (const node of flowNodes) {
        if (!seen.has(node.id)) ordered.push(node);
    }
    return ordered;
}

function rerunHref(automationId: string, executionId: string) {
    return `/automations/${automationId}?execute=1&fromExecution=${encodeURIComponent(executionId)}`;
}

export function AutomationExecutionDetailClient({
    automationId,
    executionId,
}: {
    automationId: string;
    executionId: string;
}) {
    const [execution, setExecution] = useState<ExecutionWithResources | null>(null);
    const [loading, setLoading] = useState(true);
    const [rollingBack, setRollingBack] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const orgId = getOrgId();
        if (!orgId) return;
        let timer = 0;
        let cancelled = false;

        async function poll() {
            const response = await fetchAutomationExecution(automationId, executionId, orgId!);
            const body = await response.json();
            if (cancelled) return;
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                setLoading(false);
                return;
            }
            const next = body as ExecutionWithResources;
            setExecution(next);
            setLoading(false);
            if (next.status === 'PENDING' || next.status === 'RUNNING') {
                timer = window.setTimeout(() => void poll(), 3000);
            }
        }

        void poll();
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [automationId, executionId]);

    const executionNodes = execution?.executionNodes ?? [];
    const flowNodes = execution?.flowDefinition?.nodes ?? [];
    const flowEdges = execution?.flowDefinition?.edges ?? [];

    const steps = useMemo(() => {
        const ordered = orderFlowSteps(flowNodes, flowEdges, executionNodes);
        const byNodeId = new Map(executionNodes.map((node) => [node.nodeId, node]));
        return ordered.map((flowNode, index) => ({
            index: index + 1,
            flowNode,
            executionNode: byNodeId.get(flowNode.id) ?? null,
        }));
    }, [flowNodes, flowEdges, executionNodes]);

    const progress = useMemo(() => {
        const total = steps.length || 1;
        const done = steps.filter((step) => {
            const status = step.executionNode?.status;
            return status === 'SUCCESS' || status === 'FAILED' || status === 'SKIPPED' || status === 'CANCELLED';
        }).length;
        return Math.round((done / total) * 100);
    }, [steps]);

    async function handleRollback() {
        const orgId = getOrgId();
        if (!orgId || !execution) return;
        if (!window.confirm('Isso remove os recursos provisionados por esta execução. Continuar?')) return;
        setRollingBack(true);
        try {
            const response = await rollbackAutomationExecution(automationId, executionId, orgId);
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                const refreshed = await fetchAutomationExecution(automationId, executionId, orgId);
                if (refreshed.ok) setExecution((await refreshed.json()) as ExecutionWithResources);
                return;
            }
            setExecution(body as ExecutionWithResources);
            toast.success('Rollback concluído');
        } finally {
            setRollingBack(false);
        }
    }

    if (loading || !execution) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const resources = execution.resources ?? [];
    const canRollback =
        (execution.status === 'SUCCESS' || execution.status === 'COMPLETED') &&
        resources.some((resource) => resource.status === 'PROVISIONED');
    const usedParameterEntries = Object.entries(execution.usedParameters ?? {});
    const replayHref = rerunHref(automationId, executionId);

    return (
        <div className="space-y-6 p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href={`/automations/${automationId}`}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-bold">Execução do fluxo</h1>
                    <p className="font-mono text-xs text-muted-foreground">{execution.id}</p>
                </div>
                <Badge className={cn(executionStatusClass(execution.status))}>{execution.status}</Badge>
                {execution.status === 'FAILED' && (
                    <Button asChild>
                        <Link href={replayHref}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Rodar novamente
                        </Link>
                    </Button>
                )}
                {canRollback && (
                    <Button variant="destructive" onClick={handleRollback} isLoading={rollingBack} loadingText="Revertendo...">
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Rollback
                    </Button>
                )}
            </div>

            <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
                <div>
                    <p className="text-[11px] text-muted-foreground">Versão</p>
                    <p className="text-sm font-medium">v{execution.automationVersion ?? '?'}</p>
                </div>
                <div>
                    <p className="text-[11px] text-muted-foreground">Duração</p>
                    <p className="text-sm font-medium">{formatDuration(execution.durationMs)}</p>
                </div>
                <div>
                    <p className="text-[11px] text-muted-foreground">Início</p>
                    <p className="text-sm font-medium">
                        {execution.startedAt ? new Date(execution.startedAt).toLocaleString('pt-BR') : '—'}
                    </p>
                </div>
                <div>
                    <p className="text-[11px] text-muted-foreground">Progresso</p>
                    <p className="text-sm font-medium">
                        {progress}% · {steps.length} etapas
                    </p>
                </div>
                <div className="sm:col-span-4">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn(
                                'h-full transition-all',
                                execution.status === 'FAILED' ? 'bg-destructive' : 'bg-primary',
                            )}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>

            {steps.length > 0 && (
                <div className="overflow-x-auto rounded-xl border p-4">
                    <h2 className="mb-3 font-semibold">Visão das etapas</h2>
                    <ol className="flex min-w-max items-stretch gap-0">
                        {steps.map((step, position) => {
                            const status = step.executionNode?.status ?? 'PENDING';
                            return (
                                <li key={step.flowNode.id} className="flex items-center">
                                    <button
                                        type="button"
                                        className={cn(
                                            'w-40 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50',
                                            status === 'FAILED' && 'border-destructive/40 bg-destructive/5',
                                            status === 'SUCCESS' && 'border-emerald-500/30 bg-emerald-500/5',
                                            status === 'RUNNING' && 'border-primary/40 bg-primary/5',
                                        )}
                                        onClick={() =>
                                            setExpanded((current) => ({
                                                ...current,
                                                [step.flowNode.id]: true,
                                            }))
                                        }
                                    >
                                        <div className="mb-1 flex items-center gap-2">
                                            <StepIcon status={status} />
                                            <span className="text-[10px] font-semibold text-muted-foreground">
                                                {step.index}/{steps.length}
                                            </span>
                                        </div>
                                        <p className="truncate text-xs font-semibold">{step.flowNode.name}</p>
                                        <p className="truncate font-mono text-[10px] text-muted-foreground">{step.flowNode.type}</p>
                                        <Badge className={cn('mt-1 text-[9px]', executionStatusClass(status))}>{status}</Badge>
                                    </button>
                                    {position < steps.length - 1 && (
                                        <span className="mx-1 h-px w-6 shrink-0 bg-border" aria-hidden />
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </div>
            )}

            {execution.errorMessage && (
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    <div className="min-w-0">
                        <p className="font-semibold">Falha na execução</p>
                        <p className="mt-1 whitespace-pre-wrap">{execution.errorMessage}</p>
                    </div>
                    {execution.status === 'FAILED' && (
                        <Button variant="outline" className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10" asChild>
                            <Link href={replayHref}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Rodar novamente
                            </Link>
                        </Button>
                    )}
                </div>
            )}

            {usedParameterEntries.length > 0 && (
                <div className="space-y-3 rounded-xl border p-4">
                    <div>
                        <h2 className="font-semibold">Variáveis usadas</h2>
                        <p className="text-xs text-muted-foreground">
                            Valores enviados nesta execução
                            {execution.canReplayParameters ? ' · disponíveis para reexecução' : ''}
                        </p>
                    </div>
                    <dl className="grid gap-2 sm:grid-cols-2">
                        {usedParameterEntries.map(([name, value]) => (
                            <div key={name} className="rounded-lg border bg-muted/20 px-3 py-2">
                                <dt className="font-mono text-[11px] text-muted-foreground">{name}</dt>
                                <dd className="mt-0.5 break-all font-mono text-xs">
                                    {typeof value === 'string' ? value : JSON.stringify(value)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}

            <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Detalhe por etapa</h2>
                    <p className="text-xs text-muted-foreground">Clique para expandir entrada/saída</p>
                </div>

                {steps.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma etapa registrada nesta execução.</p>
                ) : (
                    <ol className="space-y-0">
                        {steps.map((step, position) => {
                            const status = step.executionNode?.status ?? 'PENDING';
                            const isOpen = expanded[step.flowNode.id] ?? status === 'FAILED';
                            const hasDetails = Boolean(
                                step.executionNode?.error ||
                                    step.executionNode?.output ||
                                    step.executionNode?.input ||
                                    step.executionNode?.resourceId,
                            );
                            return (
                                <li key={step.flowNode.id} className="relative flex gap-3 pb-4 last:pb-0">
                                    {position < steps.length - 1 && (
                                        <span className="absolute top-7 bottom-0 left-[13px] w-px bg-border" />
                                    )}
                                    <span className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background">
                                        <StepIcon status={status} />
                                    </span>
                                    <div
                                        id={`step-${step.flowNode.id}`}
                                        className="min-w-0 flex-1 rounded-lg border bg-card/50"
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
                                            onClick={() =>
                                                setExpanded((current) => ({
                                                    ...current,
                                                    [step.flowNode.id]: !isOpen,
                                                }))
                                            }
                                            disabled={!hasDetails}
                                        >
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-[10px] font-semibold text-muted-foreground">
                                                        Etapa {step.index}
                                                    </span>
                                                    <Badge className={cn('text-[10px]', executionStatusClass(status))}>{status}</Badge>
                                                </div>
                                                <p className="truncate text-sm font-semibold">{step.flowNode.name}</p>
                                                <p className="truncate font-mono text-[10px] text-muted-foreground">
                                                    {step.flowNode.type}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                                                <span className="inline-flex items-center gap-1 text-[10px]">
                                                    <Clock3 className="h-3 w-3" />
                                                    {step.executionNode ? stepDuration(step.executionNode) : '—'}
                                                </span>
                                                {hasDetails && (
                                                    <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                                                )}
                                            </div>
                                        </button>

                                        {isOpen && step.executionNode && (
                                            <div className="space-y-2 border-t px-3 py-3">
                                                {step.executionNode.error && (
                                                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                                                        {step.executionNode.error}
                                                    </div>
                                                )}
                                                {step.executionNode.resourceId && (
                                                    <p className="font-mono text-[11px] text-muted-foreground">
                                                        resourceId: {step.executionNode.resourceId}
                                                    </p>
                                                )}
                                                {step.executionNode.input && (
                                                    <div>
                                                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Entrada</p>
                                                        <pre className="overflow-x-auto rounded-md bg-muted p-2 text-[11px]">
                                                            {JSON.stringify(step.executionNode.input, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                                {step.executionNode.output && (
                                                    <div>
                                                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Saída</p>
                                                        <pre className="overflow-x-auto rounded-md bg-muted p-2 text-[11px]">
                                                            {JSON.stringify(step.executionNode.output, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>

            {resources.length > 0 && (
                <div className="space-y-3 rounded-xl border p-4">
                    <h2 className="font-semibold">Recursos provisionados</h2>
                    <ul className="space-y-2">
                        {resources.map((resource) => (
                            <li
                                key={resource.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium">{resource.resourceType}</p>
                                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                                        {resource.awsResourceId ?? resource.stackId ?? '—'} · {resource.region}
                                    </p>
                                </div>
                                <Badge className={cn('text-[10px]', provisionedStatusClass(resource.status))}>{resource.status}</Badge>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
