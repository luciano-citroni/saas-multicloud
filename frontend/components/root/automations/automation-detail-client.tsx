'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Save, Upload, Play, ArrowLeft, ShieldCheck, ListChecks, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WorkflowAutomationBuilder, type TemplateOption } from './workflow-automation-builder';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { hasRequiredOrganizationRole, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import {
    fetchAutomation,
    fetchActionCatalog,
    fetchAutomationTemplates,
    updateAutomation,
    publishAutomation,
    executeAutomation,
    validateAutomation,
    planAutomation,
    cancelAutomationPlan,
    reviseAutomation,
    importAutomationTemplate,
    fetchAutomationExecutions,
    type ActionDefinition,
    type AutomationEdgeInput,
    type AutomationNodeInput,
    type AutomationWorkflow,
    type AutomationWorkflowExecution,
} from '@/app/actions/automations';
import { cn } from '@/lib/utils';
import { VariableEditor, type VariableMap } from './variable-editor';
import {
    ExecutionParametersForm,
    buildInitialParameters,
    parametersFromForm,
} from './execution-parameters-form';
import { executionStatusClass } from './status-styles';

function getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

const detailsSchema = z.object({
    name: z.string().min(1, 'Nome é obrigatório'),
    description: z.string(),
});

const importSchema = z.object({
    templateName: z.string().min(1, 'Nome é obrigatório'),
    templateBody: z.string().min(1, 'Cole o template YAML ou JSON'),
});

type DetailsFormValues = z.infer<typeof detailsSchema>;
type ImportFormValues = z.infer<typeof importSchema>;

export function AutomationDetailClient({ automationId }: { automationId: string }) {
    const t = useTranslations('automation');
    const router = useRouter();
    const searchParams = useSearchParams();
    const autoExecuteOpened = useRef(false);
    const [automation, setAutomation] = useState<AutomationWorkflow | null>(null);
    const [actions, setActions] = useState<ActionDefinition[]>([]);
    const [templates, setTemplates] = useState<TemplateOption[]>([]);
    const [executions, setExecutions] = useState<AutomationWorkflowExecution[]>([]);
    const [nodes, setNodes] = useState<AutomationNodeInput[]>([]);
    const [edges, setEdges] = useState<AutomationEdgeInput[]>([]);
    const [variables, setVariables] = useState<VariableMap>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [role, setRole] = useState<OrganizationRole | null>(null);
    const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
    const [planOpen, setPlanOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [executionParams, setExecutionParams] = useState<Record<string, string>>({});
    const detailsForm = useForm<DetailsFormValues>({
        resolver: zodResolver(detailsSchema),
        defaultValues: { name: '', description: '' },
    });
    const importForm = useForm<ImportFormValues>({
        resolver: zodResolver(importSchema),
        defaultValues: { templateName: '', templateBody: '' },
    });

    const load = useCallback(async () => {
        const orgId = getOrgId();
        if (!orgId) return;
        setLoading(true);
        try {
            const autoRes = await fetchAutomation(automationId, orgId);
            const autoBody = await autoRes.json();
            if (!autoRes.ok) {
                toast.error(extractErrorMessage(autoBody as never, 'pt'));
                return;
            }
            const auto = autoBody as AutomationWorkflow;
            setAutomation(auto);
            detailsForm.reset({ name: auto.name, description: auto.description ?? '' });
            setVariables(auto.variables ?? {});
            setNodes(auto.nodes ?? []);
            setEdges(auto.edges ?? []);

            const [actionsRes, execRes, templateRes] = await Promise.all([
                fetchActionCatalog(orgId, auto.cloudProvider),
                fetchAutomationExecutions(automationId, orgId),
                fetchAutomationTemplates(orgId),
            ]);
            const actionsBody = await actionsRes.json();
            const execBody = await execRes.json();
            const templateBodyJson = await templateRes.json();
            setActions(Array.isArray(actionsBody) ? actionsBody : actionsBody.items ?? []);
            const execItems = (execBody as { items?: AutomationWorkflowExecution[] }).items ?? execBody;
            setExecutions(Array.isArray(execItems) ? execItems : []);
            const templateItems = (templateBodyJson as { items?: TemplateOption[] }).items ?? templateBodyJson;
            setTemplates(Array.isArray(templateItems) ? templateItems : []);
            fetch('/api/sidebar/context', { cache: 'no-store' })
                .then((response) => response.json())
                .then((payload) => {
                    const org = (payload?.organizations ?? []).find((item: { id: string; currentRole?: string | null }) => item.id === orgId);
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

    async function persist(overrides?: { variables?: VariableMap }) {
        const orgId = getOrgId();
        if (!orgId) return null;
        const details = detailsForm.getValues();
        const response = await updateAutomation(automationId, orgId, {
            name: details.name,
            description: details.description,
            nodes,
            edges,
            variables: overrides?.variables ?? variables,
        });
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return null;
        }
        const saved = body as AutomationWorkflow;
        setAutomation(saved);
        detailsForm.reset({ name: saved.name, description: saved.description ?? '' });
        return saved;
    }

    async function handleSave() {
        const valid = await detailsForm.trigger();
        if (!valid) return;
        setSaving(true);
        try {
            const saved = await persist();
            if (saved) toast.success(t.saved);
        } finally {
            setSaving(false);
        }
    }

    async function handlePublish() {
        setSaving(true);
        try {
            const saved = await persist();
            if (!saved) return;
            const orgId = getOrgId();
            if (!orgId) return;
            const response = await publishAutomation(automationId, orgId);
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            toast.success(t.published);
            setAutomation(body as AutomationWorkflow);
        } finally {
            setSaving(false);
        }
    }

    async function handleValidate() {
        const orgId = getOrgId();
        if (!orgId) return;
        if (isDraft) {
            const saved = await persist();
            if (!saved) return;
        }
        const response = await validateAutomation(automationId, orgId);
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return;
        }
        toast.success(t.validationOk);
    }

    async function handlePlan() {
        const orgId = getOrgId();
        if (!orgId) return;
        if (isDraft) {
            const saved = await persist();
            if (!saved) return;
        }
        const response = await planAutomation(automationId, orgId);
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return;
        }
        setPlan(body as Record<string, unknown>);
        setExecutionParams(buildInitialParameters(variables));
        setPlanOpen(true);
    }

    useEffect(() => {
        if (autoExecuteOpened.current || !automation || loading || !canAdmin) return;
        if (searchParams.get('execute') !== '1') return;
        if (automation.status !== 'ACTIVE') return;
        autoExecuteOpened.current = true;
        void handlePlan();
        router.replace(`/automations/${automationId}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [automation, loading, canAdmin, searchParams, automationId, router]);

    async function handleExecute() {
        const orgId = getOrgId();
        if (!orgId) return;

        for (const [name, variable] of Object.entries(variables)) {
            const raw = executionParams[name];
            const missing = raw == null || String(raw).trim() === '';
            if (variable.required !== false && variable.default == null && missing) {
                toast.error(`Informe a variável obrigatória: ${name}`);
                return;
            }
        }

        setExecuting(true);
        try {
            const response = await executeAutomation(automationId, orgId, {
                confirm: true,
                acknowledgeCapabilities: true,
                clientRequestId: crypto.randomUUID(),
                parameters: parametersFromForm(variables, executionParams),
            });
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            toast.success(t.executionQueued);
            setPlanOpen(false);
            await load();
        } finally {
            setExecuting(false);
        }
    }

    async function handleRevise() {
        const orgId = getOrgId();
        if (!orgId) return;
        const response = await reviseAutomation(automationId, orgId);
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return;
        }
        setAutomation(body as AutomationWorkflow);
    }

    async function handleImport(values: ImportFormValues) {
        const orgId = getOrgId();
        if (!orgId) return;
        const response = await importAutomationTemplate(orgId, { name: values.templateName, content: values.templateBody });
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return;
        }
        setImportOpen(false);
        importForm.reset({ templateName: '', templateBody: '' });
        const list = await fetchAutomationTemplates(orgId);
        const listBody = await list.json();
        const items = (listBody as { items?: TemplateOption[] }).items ?? listBody;
        setTemplates(Array.isArray(items) ? items : []);
        toast.success('Template importado');
    }

    if (loading || !automation) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const steps = Array.isArray(plan?.steps) ? (plan?.steps as Array<Record<string, unknown>>) : [];

    return (
        <div className="space-y-6 p-4 md:p-6">
            <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/automations"><ArrowLeft className="h-4 w-4" /></Link>
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-2xl font-bold">{automation.name}</h1>
                    <div className="mt-1 flex items-center gap-2">
                        <Badge>{automation.cloudProvider}</Badge>
                        <Badge variant="outline">{automation.status}</Badge>
                        <span className="text-xs text-muted-foreground">v{automation.version}</span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {isDraft && (
                        <Button variant="outline" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {t.save}
                        </Button>
                    )}
                    <Button variant="outline" onClick={handleValidate}><ShieldCheck className="mr-2 h-4 w-4" />{t.validate}</Button>
                    {canAdmin && <Button variant="outline" onClick={handlePlan}><ListChecks className="mr-2 h-4 w-4" />{t.viewPlan}</Button>}
                    {isDraft && canAdmin && (
                        <Button onClick={handlePublish} disabled={saving}><Upload className="mr-2 h-4 w-4" />{t.publish}</Button>
                    )}
                    {!isDraft && canAdmin && (
                        <Button variant="outline" onClick={handleRevise}><Pencil className="mr-2 h-4 w-4" />{t.revise}</Button>
                    )}
                    {canAdmin && automation.status === 'ACTIVE' && (
                        <Button onClick={handlePlan}><Play className="mr-2 h-4 w-4" />{t.execute}</Button>
                    )}
                </div>
            </div>

            {isDraft && (
                <div className="rounded-xl border p-4">
                    <Form {...detailsForm}>
                        <form onSubmit={detailsForm.handleSubmit(() => handleSave())} className="flex flex-col gap-5">
                            <FormField
                                control={detailsForm.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={detailsForm.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descrição</FormLabel>
                                        <FormControl>
                                            <Textarea rows={3} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex justify-end">
                                <Button type="submit" isLoading={saving} loadingText="Salvando...">
                                    <Save className="mr-2 h-4 w-4" />
                                    {t.save}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </div>
            )}

            <VariableEditor
                variables={variables}
                label={t.variables}
                saveLabel={t.save}
                saving={saving}
                readOnly={!isDraft}
                onSave={async (next) => {
                    setVariables(next);
                    setSaving(true);
                    try {
                        const saved = await persist({ variables: next });
                        if (saved) toast.success(t.saved);
                    } finally {
                        setSaving(false);
                    }
                }}
            />

            {isDraft && (
                <div className="flex justify-end">
                    <Button variant="outline" onClick={() => setImportOpen(true)}>{t.importTemplate}</Button>
                </div>
            )}

            <WorkflowAutomationBuilder
                initialNodes={nodes}
                initialEdges={edges}
                actions={actions}
                templates={templates}
                variables={variables}
                organizationId={getOrgId()}
                cloudAccountId={automation.cloudAccountId}
                readOnly={!isDraft}
                onChange={(nextNodes, nextEdges) => {
                    setNodes(nextNodes);
                    setEdges(nextEdges);
                }}
            />

            <div className="space-y-3 rounded-xl border p-4">
                <h2 className="font-semibold">Histórico de execuções</h2>
                {executions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma execução registrada</p>
                ) : (
                    <ul className="space-y-2">
                        {executions.map((exec) => (
                            <li key={exec.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                                <Link href={`/automations/${automationId}/executions/${exec.id}`} className="font-mono text-xs hover:underline">
                                    {exec.id.slice(0, 8)}… <span className="text-muted-foreground">v{exec.automationVersion ?? '?'}</span>
                                </Link>
                                <Badge className={cn('text-[10px]', executionStatusClass(exec.status))}>
                                    {exec.status}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t.planTitle}</DialogTitle>
                        <DialogDescription>A validação não garante que a execução terá sucesso.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                        {plan?.cloudAccountId ? <p className="text-xs text-muted-foreground">Conta {String(plan.cloudAccountId)}</p> : null}
                        <ExecutionParametersForm
                            variables={variables}
                            values={executionParams}
                            onChange={(name, value) => setExecutionParams((current) => ({ ...current, [name]: value }))}
                        />
                        {steps.map((step) => (
                            <div key={String(step.nodeId)} className="space-y-1 rounded-lg border p-3">
                                <p className="font-medium">{String(step.name)} · {String(step.type)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {step.estimatedCost == null ? t.noEstimate : `USD ${String(step.estimatedCost)}`}
                                    {step.region ? ` · ${String(step.region)}` : ''}
                                </p>
                                {Array.isArray(step.dependencies) && step.dependencies.length > 0 && (
                                    <p className="text-xs text-muted-foreground">Depende de {step.dependencies.map(String).join(', ')}</p>
                                )}
                                {Array.isArray(step.declaredResources) && step.declaredResources.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        Recursos: {(step.declaredResources as Array<{ type?: string }>).map((resource) => resource.type).filter(Boolean).join(', ')}
                                    </p>
                                )}
                                {Array.isArray(step.existingReferences) && step.existingReferences.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        Referências: {(step.existingReferences as Array<{ resourceType?: string; resourceId?: string }>).map((item) => `${item.resourceType ?? 'recurso'} ${item.resourceId ?? ''}`).join(', ')}
                                    </p>
                                )}
                                {Array.isArray(step.iamActions) && step.iamActions.length > 0 && (
                                    <p className="text-xs text-muted-foreground">IAM: {(step.iamActions as string[]).join(', ')}</p>
                                )}
                                {step.parameters != null && typeof step.parameters === 'object' ? (
                                    <pre className="overflow-x-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(step.parameters, null, 2)}</pre>
                                ) : null}
                                {Array.isArray(step.warnings) && (step.warnings as string[]).map((warning) => (
                                    <p key={warning} className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>
                                ))}
                            </div>
                        ))}
                        {Array.isArray(plan?.limitations) && (
                            <div>
                                <p className="font-medium">{t.limitations}</p>
                                <ul className="list-disc pl-4 text-xs text-muted-foreground">
                                    {(plan?.limitations as string[]).map((item) => <li key={item}>{item}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={async () => {
                            const orgId = getOrgId();
                            if (orgId) await cancelAutomationPlan(automationId, orgId);
                            setPlanOpen(false);
                        }}>{t.cancelPlan}</Button>
                        {automation.status === 'ACTIVE' && canAdmin && (
                            <Button onClick={handleExecute} disabled={plan?.blocking === true || executing} isLoading={executing} loadingText="Enfileirando...">
                                {t.confirmProvision}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.importTemplate}</DialogTitle>
                        <DialogDescription>O conteúdo é validado antes de ficar disponível para execução.</DialogDescription>
                    </DialogHeader>
                    <Form {...importForm}>
                        <form onSubmit={importForm.handleSubmit(handleImport)} className="flex flex-col gap-5">
                            <FormField
                                control={importForm.control}
                                name="templateName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Nome" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={importForm.control}
                                name="templateBody"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Template</FormLabel>
                                        <FormControl>
                                            <Textarea className="min-h-48 font-mono text-xs" placeholder="YAML ou JSON" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button type="submit">{t.importTemplate}</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
