'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft, RotateCcw } from 'lucide-react';
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

type ExecutionWithResources = AutomationWorkflowExecution & {
    resources?: ProvisionedResource[];
};

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

    const nodes = execution.executionNodes ?? [];
    const resources = execution.resources ?? [];
    const canRollback =
        (execution.status === 'SUCCESS' || execution.status === 'COMPLETED') &&
        resources.some((resource) => resource.status === 'PROVISIONED');

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-wrap items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href={`/automations/${automationId}`}>
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-bold">Execução</h1>
                    <p className="font-mono text-xs text-muted-foreground">{execution.id}</p>
                </div>
                <Badge className={cn(executionStatusClass(execution.status))}>{execution.status}</Badge>
                {canRollback && (
                    <Button variant="destructive" onClick={handleRollback} isLoading={rollingBack} loadingText="Revertendo...">
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Rollback
                    </Button>
                )}
            </div>
            {execution.inventorySyncStatus && execution.inventorySyncStatus !== 'NOT_APPLICABLE' && (
                <p className="text-sm text-muted-foreground">Inventário: {execution.inventorySyncStatus}</p>
            )}
            {execution.errorMessage && <p className="text-sm text-destructive">{execution.errorMessage}</p>}

            {resources.length > 0 && (
                <div className="space-y-3 rounded-xl border p-4">
                    <h2 className="font-semibold">Recursos provisionados</h2>
                    <ul className="space-y-2">
                        {resources.map((resource) => (
                            <li key={resource.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
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

            <div className="space-y-3">
                <h2 className="font-semibold">Nodes</h2>
                {nodes.map((node: AutomationExecutionNode) => (
                    <div key={node.id} className="space-y-2 rounded-xl border p-4">
                        <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-muted-foreground">{node.nodeId.slice(0, 8)}…</span>
                            <Badge className={cn('text-[10px]', executionStatusClass(node.status))}>{node.status}</Badge>
                        </div>
                        {node.output && (
                            <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(node.output, null, 2)}</pre>
                        )}
                        {node.error && <p className="text-sm text-destructive">{node.error}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}
