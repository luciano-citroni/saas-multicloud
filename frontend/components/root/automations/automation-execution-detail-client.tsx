'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import {
    fetchAutomationExecution,
    type AutomationExecutionNode,
    type AutomationWorkflowExecution,
} from '@/app/actions/automations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

export function AutomationExecutionDetailClient({
    automationId,
    executionId,
}: {
    automationId: string;
    executionId: string;
}) {
    const [execution, setExecution] = useState<AutomationWorkflowExecution | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const orgId = getOrgId();
        if (!orgId) return;

        fetchAutomationExecution(automationId, executionId, orgId)
            .then(async (response) => {
                const body = await response.json();
                if (!response.ok) {
                    toast.error(extractErrorMessage(body as never, 'pt'));
                    return;
                }
                setExecution(body as AutomationWorkflowExecution);
            })
            .finally(() => setLoading(false));
    }, [automationId, executionId]);

    if (loading || !execution) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const nodes = execution.executionNodes ?? [];

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href={`/automations/${automationId}`}><ArrowLeft className="h-4 w-4" /></Link>
                </Button>
                <div>
                    <h1 className="text-xl font-bold">Execução</h1>
                    <p className="font-mono text-xs text-muted-foreground">{execution.id}</p>
                </div>
                <Badge className="ml-auto">{execution.status}</Badge>
            </div>

            <div className="space-y-3">
                {nodes.map((node: AutomationExecutionNode) => (
                    <div key={node.id} className="rounded-xl border p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-muted-foreground">{node.nodeId.slice(0, 8)}…</span>
                            <Badge
                                className={cn(
                                    node.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                                    node.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                                    node.status === 'SKIPPED' ? 'bg-amber-100 text-amber-700' : 'bg-muted',
                                )}
                            >
                                {node.status}
                            </Badge>
                        </div>
                        {node.output && (
                            <pre className="rounded bg-muted p-2 text-xs overflow-x-auto">
                                {JSON.stringify(node.output, null, 2)}
                            </pre>
                        )}
                        {node.error && <p className="text-sm text-destructive">{node.error}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}
