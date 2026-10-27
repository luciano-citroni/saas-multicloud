'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save, Upload, Play, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkflowAutomationBuilder } from './workflow-automation-builder';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { hasRequiredOrganizationRole, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import {
    fetchAutomation,
    fetchActionCatalog,
    updateAutomation,
    publishAutomation,
    executeAutomation,
    fetchAutomationExecutions,
    type ActionDefinition,
    type AutomationEdgeInput,
    type AutomationNodeInput,
    type AutomationWorkflow,
    type AutomationWorkflowExecution,
} from '@/app/actions/automations';
import { cn } from '@/lib/utils';

function getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

export function AutomationDetailClient({ automationId }: { automationId: string }) {
    const router = useRouter();
    const [automation, setAutomation] = useState<AutomationWorkflow | null>(null);
    const [actions, setActions] = useState<ActionDefinition[]>([]);
    const [executions, setExecutions] = useState<AutomationWorkflowExecution[]>([]);
    const [nodes, setNodes] = useState<AutomationNodeInput[]>([]);
    const [edges, setEdges] = useState<AutomationEdgeInput[]>([]);
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [role, setRole] = useState<OrganizationRole | null>(null);

    const load = useCallback(async () => {
        const orgId = getOrgId();
        if (!orgId) return;

        setLoading(true);
        try {
            const [autoRes, actionsRes, execRes] = await Promise.all([
                fetchAutomation(automationId, orgId),
                fetchActionCatalog(orgId),
                fetchAutomationExecutions(automationId, orgId),
            ]);

            const autoBody = await autoRes.json();
            const actionsBody = await actionsRes.json();
            const execBody = await execRes.json();

            if (!autoRes.ok) {
                toast.error(extractErrorMessage(autoBody as never, 'pt'));
                return;
            }

            const auto = autoBody as AutomationWorkflow;
            setAutomation(auto);
            setName(auto.name);
            setNodes(auto.nodes ?? []);
            setEdges(auto.edges ?? []);
            setActions(Array.isArray(actionsBody) ? actionsBody : []);
            const execItems = (execBody as { items?: AutomationWorkflowExecution[] }).items ?? execBody;
            setExecutions(Array.isArray(execItems) ? execItems : []);

            fetch('/api/sidebar/context', { cache: 'no-store' })
                .then((r) => r.json())
                .then((payload) => {
                    const org = (payload?.organizations ?? []).find((o: { id: string; currentRole?: string | null }) => o.id === orgId);
                    setRole(normalizeOrganizationRole(org?.currentRole));
                })
                .catch(() => undefined);
        } catch {
            toast.error('Falha ao carregar automação');
        } finally {
            setLoading(false);
        }
    }, [automationId]);

    useEffect(() => {
        void load();
    }, [load]);

    const isDraft = automation?.status === 'DRAFT';
    const canAdmin = hasRequiredOrganizationRole(role, 'ADMIN');

    async function handleSave() {
        const orgId = getOrgId();
        if (!orgId || !automation) return;

        setSaving(true);
        try {
            const response = await updateAutomation(automationId, orgId, { name, nodes, edges });
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            toast.success('Automação salva');
            setAutomation(body as AutomationWorkflow);
        } catch {
            toast.error('Falha ao salvar');
        } finally {
            setSaving(false);
        }
    }

    async function handlePublish() {
        const orgId = getOrgId();
        if (!orgId) return;

        setSaving(true);
        try {
            await handleSave();
            const response = await publishAutomation(automationId, orgId);
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            toast.success('Automação publicada');
            setAutomation(body as AutomationWorkflow);
        } catch {
            toast.error('Falha ao publicar');
        } finally {
            setSaving(false);
        }
    }

    async function handleExecute() {
        const orgId = getOrgId();
        if (!orgId) return;

        const response = await executeAutomation(automationId, orgId);
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return;
        }
        toast.success('Execução enfileirada');
        await load();
    }

    if (loading || !automation) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/automations"><ArrowLeft className="h-4 w-4" /></Link>
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">{automation.name}</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <Badge>{automation.cloudProvider}</Badge>
                        <Badge variant="outline">{automation.status}</Badge>
                        <span className="text-xs text-muted-foreground">v{automation.version}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {isDraft && (
                        <>
                            <Button variant="outline" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Salvar
                            </Button>
                            {canAdmin && (
                                <Button onClick={handlePublish} disabled={saving}>
                                    <Upload className="mr-2 h-4 w-4" />
                                    Publicar
                                </Button>
                            )}
                        </>
                    )}
                    {canAdmin && automation.status === 'ACTIVE' && (
                        <Button onClick={handleExecute}>
                            <Play className="mr-2 h-4 w-4" />
                            Executar
                        </Button>
                    )}
                </div>
            </div>

            {isDraft && (
                <div className="space-y-2 max-w-md">
                    <Label>Nome</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
            )}

            <WorkflowAutomationBuilder
                initialNodes={nodes}
                initialEdges={edges}
                actions={actions}
                readOnly={!isDraft}
                onChange={(n, e) => {
                    setNodes(n);
                    setEdges(e);
                }}
            />

            <div className="rounded-xl border p-4 space-y-3">
                <h2 className="font-semibold">Histórico de execuções</h2>
                {executions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma execução registrada</p>
                ) : (
                    <ul className="space-y-2">
                        {executions.map((exec) => (
                            <li key={exec.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                                <div>
                                    <Link
                                        href={`/automations/${automationId}/executions/${exec.id}`}
                                        className="font-mono text-xs hover:underline"
                                    >
                                        {exec.id.slice(0, 8)}…
                                    </Link>
                                    <span className="ml-2 text-muted-foreground">
                                        v{exec.automationVersion ?? '?'}
                                    </span>
                                </div>
                                <Badge
                                    className={cn(
                                        exec.status === 'SUCCESS' || exec.status === 'COMPLETED'
                                            ? 'bg-green-100 text-green-700'
                                            : exec.status === 'FAILED'
                                              ? 'bg-red-100 text-red-700'
                                              : 'bg-muted',
                                    )}
                                >
                                    {exec.status}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
