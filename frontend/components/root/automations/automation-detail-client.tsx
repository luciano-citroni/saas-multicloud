'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Save, Upload, Play, ArrowLeft, ShieldCheck, ListChecks, Pencil, RefreshCw, Copy, Check as CheckIcon, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { WorkflowAutomationBuilder, type TemplateOption } from './workflow-automation-builder';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import {
    fetchOrganizationCloudAccounts,
    type OrganizationCloudAccount,
} from '@/app/actions/organization';
import {
    fetchAutomation,
    fetchPublishedAutomation,
    fetchActionCatalog,
    fetchAutomationTemplates,
    updateAutomation,
    publishAutomation,
    executeAutomation,
    validateAutomation,
    validateAutomationPermissions,
    grantMissingAutomationPermissions,
    planAutomation,
    cancelAutomationPlan,
    reviseAutomation,
    importAutomationTemplate,
    fetchAutomationExecutions,
    fetchExecutionReplayParameters,
    type ActionDefinition,
    type AutomationEdgeInput,
    type AutomationNodeInput,
    type AutomationPermissionCheck,
    type GrantMissingPermissionsResult,
    type AutomationWorkflow,
    type AutomationWorkflowExecution,
    type PublishedAutomationSnapshot,
} from '@/app/actions/automations';
import { cn } from '@/lib/utils';
import { VariableEditor, type VariableMap } from './variable-editor';
import {
    ExecutionCloudAccountField,
    ExecutionParametersForm,
    buildInitialParameters,
    mergeReplayParameters,
    parametersFromForm,
    resolveDefaultCloudAccountId,
} from './execution-parameters-form';
import { executionStatusClass } from './status-styles';

function getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

function getSidebarCloudAccountId(organizationId: string | null): string | null {
    if (typeof window === 'undefined') return null;
    if (organizationId) {
        const perOrg = window.localStorage.getItem(`smc_active_cloud_account_id:${organizationId}`);
        if (perOrg) return perOrg;
    }
    return window.localStorage.getItem('smc_active_cloud_account_id');
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
type AutomationDetailMode = 'draft' | 'published';

export function AutomationDetailClient({
    automationId,
    mode = 'draft',
}: {
    automationId: string;
    mode?: AutomationDetailMode;
}) {
    const t = useTranslations('automation');
    const router = useRouter();
    const searchParams = useSearchParams();
    const autoExecuteOpened = useRef(false);
    const [automation, setAutomation] = useState<AutomationWorkflow | null>(null);
    const [published, setPublished] = useState<PublishedAutomationSnapshot | null>(null);
    const [actions, setActions] = useState<ActionDefinition[]>([]);
    const [templates, setTemplates] = useState<TemplateOption[]>([]);
    const [executions, setExecutions] = useState<AutomationWorkflowExecution[]>([]);
    const [nodes, setNodes] = useState<AutomationNodeInput[]>([]);
    const [edges, setEdges] = useState<AutomationEdgeInput[]>([]);
    const [variables, setVariables] = useState<VariableMap>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [orgId, setOrgId] = useState<string | null>(null);
    const { currentRole: rawRole } = useOrganizationFromSidebar(orgId);
    const role = normalizeOrganizationRole(rawRole);
    const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
    const [planOpen, setPlanOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [executionParams, setExecutionParams] = useState<Record<string, string>>({});
    const [executionParamErrors, setExecutionParamErrors] = useState<Record<string, string>>({});
    const [executionVariables, setExecutionVariables] = useState<VariableMap>({});
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    const [selectedCloudAccountId, setSelectedCloudAccountId] = useState('');
    const [permissionCheck, setPermissionCheck] = useState<AutomationPermissionCheck | null>(null);
    const [flowValidation, setFlowValidation] = useState<{ ok: boolean; message: string | null } | null>(null);
    const [validatingPreRun, setValidatingPreRun] = useState(false);
    const [grantingPermissions, setGrantingPermissions] = useState(false);
    const [manualPolicyJson, setManualPolicyJson] = useState<string | null>(null);
    const [copiedPolicy, setCopiedPolicy] = useState(false);
    const detailsForm = useForm<DetailsFormValues>({
        resolver: zodResolver(detailsSchema),
        defaultValues: { name: '', description: '' },
    });
    const importForm = useForm<ImportFormValues>({
        resolver: zodResolver(importSchema),
        defaultValues: { templateName: '', templateBody: '' },
    });

    const loadPublished = useCallback(async (currentOrgId: string) => {
        const response = await fetchPublishedAutomation(automationId, currentOrgId);
        const body = await response.json();
        if (!response.ok) {
            setPublished(null);
            return null;
        }
        const snapshot = body as PublishedAutomationSnapshot;
        setPublished(snapshot);
        return snapshot;
    }, [automationId]);

    const load = useCallback(async () => {
        const currentOrgId = getOrgId();
        if (!currentOrgId) return;
        setLoading(true);
        try {
            const autoRes = await fetchAutomation(automationId, currentOrgId);
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
                fetchActionCatalog(currentOrgId, auto.cloudProvider),
                fetchAutomationExecutions(automationId, currentOrgId),
                fetchAutomationTemplates(currentOrgId),
            ]);
            const actionsBody = await actionsRes.json();
            const execBody = await execRes.json();
            const templateBodyJson = await templateRes.json();
            setActions(Array.isArray(actionsBody) ? actionsBody : actionsBody.items ?? []);
            const execItems = (execBody as { items?: AutomationWorkflowExecution[] }).items ?? execBody;
            setExecutions(Array.isArray(execItems) ? execItems : []);
            const templateItems = (templateBodyJson as { items?: TemplateOption[] }).items ?? templateBodyJson;
            setTemplates(Array.isArray(templateItems) ? templateItems : []);

            if (auto.version > 0) {
                const snapshot = await loadPublished(currentOrgId);
                if (mode === 'published' && !snapshot) {
                    toast.error('Versão publicada não encontrada');
                    router.replace(`/automations/${automationId}`);
                    return;
                }
            } else {
                setPublished(null);
                if (mode === 'published') {
                    toast.error('Esta automação ainda não foi publicada');
                    router.replace(`/automations/${automationId}`);
                    return;
                }
            }
        } catch {
            toast.error('Falha ao carregar automação');
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detailsForm.reset is stable enough for initial load
    }, [automationId, loadPublished, mode, router]);

    useEffect(() => {
        setOrgId(getOrgId());
        void load();
    }, [load]);

    const isDraft = automation?.status === 'DRAFT';
    const canAdmin = hasRequiredOrganizationRole(role, 'ADMIN');
    const hasPublishedVersion = Boolean(automation && automation.version > 0);
    const canExecute = Boolean(canAdmin && hasPublishedVersion && automation?.status !== 'INACTIVE');
    const isPublishedPage = mode === 'published';
    const editingDraft = Boolean(isDraft && !isPublishedPage);

    const displayNodes = isPublishedPage && published ? published.nodes : nodes;
    const displayEdges = isPublishedPage && published ? published.edges : edges;
    const displayVariables = isPublishedPage && published ? (published.variables as VariableMap) : variables;

    async function persist(overrides?: { variables?: VariableMap }) {
        const currentOrgId = getOrgId();
        if (!currentOrgId) return null;
        const details = detailsForm.getValues();
        const response = await updateAutomation(automationId, currentOrgId, {
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
            const currentOrgId = getOrgId();
            if (!currentOrgId) return;
            const response = await publishAutomation(automationId, currentOrgId);
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            toast.success(t.published);
            setAutomation(body as AutomationWorkflow);
            await loadPublished(currentOrgId);
            router.push(`/automations/${automationId}/published`);
        } finally {
            setSaving(false);
        }
    }

    async function loadCloudAccountsForRun(
        currentOrgId: string,
        fallbackCloudAccountId: string,
    ): Promise<{ accounts: OrganizationCloudAccount[]; selectedId: string }> {
        setLoadingAccounts(true);
        try {
            const response = await fetchOrganizationCloudAccounts(currentOrgId, { isActive: true, limit: 100 });
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                setCloudAccounts([]);
                return { accounts: [], selectedId: '' };
            }
            const items = Array.isArray(body) ? body : (body as { items?: OrganizationCloudAccount[] }).items ?? [];
            const accounts = Array.isArray(items) ? items : [];
            setCloudAccounts(accounts);
            const sidebarId = getSidebarCloudAccountId(currentOrgId);
            const selectedId = resolveDefaultCloudAccountId({
                accounts,
                sidebarAccountId: sidebarId,
                automationCloudAccountId: fallbackCloudAccountId,
            });
            setSelectedCloudAccountId(selectedId);
            return { accounts, selectedId };
        } finally {
            setLoadingAccounts(false);
        }
    }

    async function handlePlan(fromExecutionId?: string | null) {
        const currentOrgId = getOrgId();
        if (!currentOrgId || !automation) return;
        if (!hasPublishedVersion) {
            toast.error('Publique a automação antes de gerar o plano de execução');
            return;
        }

        const { selectedId } = await loadCloudAccountsForRun(currentOrgId, automation.cloudAccountId);

        const response = await planAutomation(automationId, currentOrgId, {
            cloudAccountId: selectedId || undefined,
        });
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return;
        }
        setPlan(body as Record<string, unknown>);
        if (typeof (body as { cloudAccountId?: string }).cloudAccountId === 'string') {
            setSelectedCloudAccountId((body as { cloudAccountId: string }).cloudAccountId);
        }

        const publishedVars =
            published?.variables ??
            (await loadPublished(currentOrgId))?.variables ??
            {};
        const vars = publishedVars as VariableMap;
        setExecutionVariables(vars);

        let params = buildInitialParameters(vars);
        if (fromExecutionId) {
            const replayRes = await fetchExecutionReplayParameters(automationId, fromExecutionId, currentOrgId);
            const replayBody = (await replayRes.json()) as {
                available?: boolean;
                parameters?: Record<string, unknown>;
            };
            if (replayRes.ok && replayBody.available && replayBody.parameters) {
                params = mergeReplayParameters(vars, params, replayBody.parameters);
                toast.message('Parâmetros da execução anterior preenchidos');
            }
        }
        setExecutionParams(params);
        setExecutionParamErrors({});
        setPermissionCheck(null);
        setFlowValidation(null);
        setManualPolicyJson(null);
        setCopiedPolicy(false);
        setPlanOpen(true);
    }

    async function handleGrantMissingPermissions() {
        const currentOrgId = getOrgId();
        if (!currentOrgId) return;
        if (!selectedCloudAccountId) {
            toast.error('Selecione a conta cloud');
            return;
        }
        if (!permissionCheck?.missing?.length) {
            toast.error('Não há permissões faltantes para aplicar');
            return;
        }

        setGrantingPermissions(true);
        setCopiedPolicy(false);
        try {
            const response = await grantMissingAutomationPermissions(automationId, currentOrgId, {
                cloudAccountId: selectedCloudAccountId,
                actions: permissionCheck.missing,
            });
            const body = await response.json();
            if (!response.ok) {
                const details = (body as { details?: { suggestedPolicy?: Record<string, unknown>; reason?: string } }).details;
                if (details?.suggestedPolicy) {
                    setManualPolicyJson(JSON.stringify(details.suggestedPolicy, null, 2));
                } else if (permissionCheck.suggestedPolicy) {
                    setManualPolicyJson(JSON.stringify(permissionCheck.suggestedPolicy, null, 2));
                }
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }

            const result = body as GrantMissingPermissionsResult;
            setPermissionCheck(result.check);
            setManualPolicyJson(JSON.stringify(result.suggestedPolicy, null, 2));
            if (result.check.ok) {
                toast.success(result.message || 'Permissões aplicadas com sucesso');
            } else {
                toast.error(result.message || 'Policy atualizada, mas ainda faltam permissões');
            }
        } finally {
            setGrantingPermissions(false);
        }
    }

    async function handleCopySuggestedPolicy() {
        const json =
            manualPolicyJson ??
            (permissionCheck?.suggestedPolicy ? JSON.stringify(permissionCheck.suggestedPolicy, null, 2) : null);
        if (!json) return;
        try {
            await navigator.clipboard.writeText(json);
            setCopiedPolicy(true);
            toast.success('Policy copiada');
            window.setTimeout(() => setCopiedPolicy(false), 2000);
        } catch {
            toast.error('Não foi possível copiar a policy');
        }
    }

    async function runPreExecutionValidations(options?: {
        cloudAccountId?: string;
        silentSuccess?: boolean;
    }): Promise<{ ok: boolean; flowOk: boolean; permissionsOk: boolean }> {
        const currentOrgId = getOrgId();
        const cloudAccountId = options?.cloudAccountId ?? selectedCloudAccountId;
        if (!currentOrgId) {
            toast.error('Organização não encontrada');
            return { ok: false, flowOk: false, permissionsOk: false };
        }
        if (!cloudAccountId) {
            toast.error('Selecione a conta cloud');
            return { ok: false, flowOk: false, permissionsOk: false };
        }

        setValidatingPreRun(true);
        try {
            const flowResponse = await validateAutomation(automationId, currentOrgId);
            const flowBody = await flowResponse.json();
            if (!flowResponse.ok) {
                const message = extractErrorMessage(flowBody as never, 'pt');
                setFlowValidation({ ok: false, message });
                setPermissionCheck(null);
                toast.error(`Fluxo inválido: ${message}`);
                return { ok: false, flowOk: false, permissionsOk: false };
            }
            setFlowValidation({ ok: true, message: null });

            const permissionsResponse = await validateAutomationPermissions(automationId, currentOrgId, {
                cloudAccountId,
            });
            const permissionsBody = await permissionsResponse.json();
            if (!permissionsResponse.ok) {
                const message = extractErrorMessage(permissionsBody as never, 'pt');
                setPermissionCheck(null);
                toast.error(`Falha ao validar permissões: ${message}`);
                return { ok: false, flowOk: true, permissionsOk: false };
            }

            const result = permissionsBody as AutomationPermissionCheck;
            setPermissionCheck(result);
            if (!result.ok || result.blocking) {
                const message = result.message ?? t.validatePermissionsMissing;
                toast.error(`Permissões insuficientes: ${message}`);
                return { ok: false, flowOk: true, permissionsOk: false };
            }

            if (!options?.silentSuccess) {
                toast.success('Fluxo e permissões IAM validados com sucesso');
            }
            return { ok: true, flowOk: true, permissionsOk: true };
        } finally {
            setValidatingPreRun(false);
        }
    }

    useEffect(() => {
        if (autoExecuteOpened.current || !automation || loading || !canAdmin) return;
        if (searchParams.get('execute') !== '1') return;
        if (automation.version === 0 || automation.status === 'INACTIVE') return;
        autoExecuteOpened.current = true;
        const fromExecution = searchParams.get('fromExecution');
        void handlePlan(fromExecution);
        const basePath = isPublishedPage
            ? `/automations/${automationId}/published`
            : `/automations/${automationId}`;
        router.replace(basePath);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [automation, loading, canAdmin, searchParams, automationId, router, isPublishedPage]);

    function validateExecutionParams(): boolean {
        const errors: Record<string, string> = {};
        for (const [name, variable] of Object.entries(executionVariables)) {
            const raw = executionParams[name];
            const missing = raw == null || String(raw).trim() === '';
            if (variable.required !== false && variable.default == null && missing) {
                errors[name] = 'Campo obrigatório';
            }
        }
        setExecutionParamErrors(errors);
        return Object.keys(errors).length === 0;
    }

    async function handleExecute() {
        const currentOrgId = getOrgId();
        if (!currentOrgId) return;
        if (!selectedCloudAccountId) {
            toast.error('Selecione a conta cloud');
            return;
        }
        if (!validateExecutionParams()) {
            toast.error('Preencha os parâmetros obrigatórios');
            return;
        }
        if (plan?.blocking === true) {
            toast.error('O plano possui bloqueios. Corrija as limitações antes de executar.');
            return;
        }

        const validation = await runPreExecutionValidations({
            cloudAccountId: selectedCloudAccountId,
            silentSuccess: true,
        });
        if (!validation.ok) return;

        setExecuting(true);
        try {
            const response = await executeAutomation(automationId, currentOrgId, {
                confirm: true,
                acknowledgeCapabilities: true,
                clientRequestId: crypto.randomUUID(),
                cloudAccountId: selectedCloudAccountId,
                parameters: parametersFromForm(executionVariables, executionParams),
            });
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            const executionId = (body as { id?: string }).id;
            if (!executionId) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            toast.success(t.executionQueued);
            setPlanOpen(false);
            router.push(`/automations/${automationId}/executions/${executionId}`);
        } finally {
            setExecuting(false);
        }
    }

    async function handleRevise() {
        const currentOrgId = getOrgId();
        if (!currentOrgId) return;
        const response = await reviseAutomation(automationId, currentOrgId);
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return;
        }
        setAutomation(body as AutomationWorkflow);
        router.push(`/automations/${automationId}`);
    }

    async function handleImport(values: ImportFormValues) {
        const currentOrgId = getOrgId();
        if (!currentOrgId) return;
        const response = await importAutomationTemplate(currentOrgId, {
            name: values.templateName,
            content: values.templateBody,
        });
        const body = await response.json();
        if (!response.ok) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return;
        }
        setImportOpen(false);
        importForm.reset({ templateName: '', templateBody: '' });
        const list = await fetchAutomationTemplates(currentOrgId);
        const listBody = await list.json();
        const items = (listBody as { items?: TemplateOption[] }).items ?? listBody;
        setTemplates(Array.isArray(items) ? items : []);
        toast.success('Template importado');
    }

    const createItems = useMemo(
        () => permissionCheck?.items.filter((item) => item.purpose === 'create') ?? [],
        [permissionCheck],
    );
    const rollbackItems = useMemo(
        () => permissionCheck?.items.filter((item) => item.purpose === 'rollback') ?? [],
        [permissionCheck],
    );

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
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge>{automation.cloudProvider}</Badge>
                        <Badge variant="outline">{automation.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                            {isPublishedPage ? `Publicada v${automation.version}` : `v${automation.version}`}
                        </span>
                        {isPublishedPage ? (
                            <Badge variant="secondary">Somente leitura</Badge>
                        ) : isDraft ? (
                            <Badge variant="secondary">Rascunho</Badge>
                        ) : null}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {isPublishedPage ? (
                        <Button variant="outline" asChild>
                            <Link href={`/automations/${automationId}`}>
                                {isDraft ? 'Ir para rascunho' : 'Voltar à automação'}
                            </Link>
                        </Button>
                    ) : hasPublishedVersion ? (
                        <Button variant="outline" asChild>
                            <Link href={`/automations/${automationId}/published`}>
                                Ver versão publicada
                            </Link>
                        </Button>
                    ) : null}
                    {editingDraft && (
                        <Button variant="outline" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {t.save}
                        </Button>
                    )}
                    {canExecute && (
                        <Button variant="outline" onClick={() => void handlePlan()}>
                            <ListChecks className="mr-2 h-4 w-4" />
                            {t.viewPlan}
                        </Button>
                    )}
                    {editingDraft && canAdmin && (
                        <Button onClick={handlePublish} disabled={saving}>
                            <Upload className="mr-2 h-4 w-4" />
                            {t.publish}
                        </Button>
                    )}
                    {!isDraft && canAdmin && (
                        <Button variant="outline" onClick={handleRevise}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t.revise}
                        </Button>
                    )}
                    {canExecute && (
                        <Button onClick={() => void handlePlan()}>
                            <Play className="mr-2 h-4 w-4" />
                            {t.execute}
                        </Button>
                    )}
                </div>
            </div>

            {isPublishedPage ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
                    Você está na versão publicada v{automation.version}. Execuções usam este snapshot.
                    {isDraft
                        ? ' O rascunho em andamento continua editável na página do rascunho.'
                        : ''}
                </div>
            ) : null}

            {editingDraft && (
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
                variables={displayVariables}
                label={t.variables}
                saveLabel={t.save}
                saving={saving}
                readOnly={!editingDraft}
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

            {editingDraft && (
                <div className="flex justify-end">
                    <Button variant="outline" onClick={() => setImportOpen(true)}>{t.importTemplate}</Button>
                </div>
            )}

            <WorkflowAutomationBuilder
                key={`${mode}-${isPublishedPage ? published?.version ?? 0 : 'draft'}`}
                initialNodes={displayNodes}
                initialEdges={displayEdges}
                actions={actions}
                templates={templates}
                variables={displayVariables}
                organizationId={getOrgId()}
                cloudAccountId={automation.cloudAccountId}
                readOnly={!editingDraft}
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
                            <li key={exec.id} className="space-y-1 rounded-lg border px-3 py-2 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <Link
                                        href={`/automations/${automationId}/executions/${exec.id}`}
                                        className="font-mono text-xs hover:underline"
                                    >
                                        {exec.id.slice(0, 8)}…{' '}
                                        <span className="text-muted-foreground">v{exec.automationVersion ?? '?'}</span>
                                    </Link>
                                    <Badge className={cn('text-[10px]', executionStatusClass(exec.status))}>{exec.status}</Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    {exec.startedAt ? new Date(exec.startedAt).toLocaleString('pt-BR') : new Date(exec.createdAt).toLocaleString('pt-BR')}
                                    {exec.durationMs != null ? ` · ${Math.round(exec.durationMs / 1000)}s` : ''}
                                </p>
                                {exec.status === 'FAILED' && exec.errorMessage && (
                                    <p className="line-clamp-2 text-xs text-destructive">{exec.errorMessage}</p>
                                )}
                                {exec.status === 'FAILED' && canExecute && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-1 h-7 gap-1.5 text-xs"
                                        onClick={() => void handlePlan(exec.id)}
                                    >
                                        <RefreshCw className="h-3 w-3" />
                                        Rodar novamente
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t.planTitle}</DialogTitle>
                        <DialogDescription>
                            Configure a conta, parâmetros e permissões da versão publicada antes de confirmar.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                        <ExecutionCloudAccountField
                            accounts={cloudAccounts}
                            value={selectedCloudAccountId}
                            loading={loadingAccounts}
                            onChange={(next) => {
                                setSelectedCloudAccountId(next);
                                setPermissionCheck(null);
                                setFlowValidation(null);
                                setManualPolicyJson(null);
                                setCopiedPolicy(false);
                            }}
                        />

                        <ExecutionParametersForm
                            variables={executionVariables}
                            values={executionParams}
                            errors={executionParamErrors}
                            onChange={(name, value) => {
                                setExecutionParams((current) => ({ ...current, [name]: value }));
                                setExecutionParamErrors((current) => {
                                    if (!current[name]) return current;
                                    const next = { ...current };
                                    delete next[name];
                                    return next;
                                });
                            }}
                        />

                        <Accordion type="multiple" defaultValue={['plan']} className="rounded-lg border px-3">
                            <AccordionItem value="plan" className="border-b-0">
                                <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                                    Plano de execução ({steps.length} passos)
                                </AccordionTrigger>
                                <AccordionContent className="space-y-2 pb-3">
                                    {steps.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Nenhum passo no plano.</p>
                                    ) : (
                                        steps.map((step) => (
                                            <div key={String(step.nodeId)} className="space-y-1 rounded-md border p-2.5">
                                                <p className="font-medium">{String(step.name)}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {String(step.type)}
                                                    {step.region ? ` · ${String(step.region)}` : ''}
                                                    {' · '}
                                                    {step.estimatedCost == null ? t.noEstimate : `USD ${String(step.estimatedCost)}`}
                                                </p>
                                                {Array.isArray(step.dependencies) && step.dependencies.length > 0 && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Depende de {step.dependencies.map(String).join(', ')}
                                                    </p>
                                                )}
                                                {Array.isArray(step.warnings) &&
                                                    (step.warnings as string[]).map((warning) => (
                                                        <p key={warning} className="text-xs text-amber-700 dark:text-amber-300">
                                                            {warning}
                                                        </p>
                                                    ))}
                                            </div>
                                        ))
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>

                        <div className="space-y-3 rounded-lg border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-semibold">{t.validate}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Valida o fluxo da versão publicada e as permissões IAM da conta selecionada antes de executar.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => void runPreExecutionValidations()}
                                    isLoading={validatingPreRun}
                                    loadingText="Validando..."
                                    disabled={!selectedCloudAccountId || executing}
                                >
                                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                                    {t.validate}
                                </Button>
                            </div>

                            {flowValidation && (
                                <div
                                    className={cn(
                                        'rounded-md border p-2.5 text-xs',
                                        flowValidation.ok
                                            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
                                            : 'border-destructive/30 bg-destructive/5 text-destructive',
                                    )}
                                >
                                    <p className="font-medium">
                                        {flowValidation.ok ? t.validationOk : 'Fluxo inválido'}
                                    </p>
                                    {flowValidation.message ? <p>{flowValidation.message}</p> : null}
                                </div>
                            )}

                            {permissionCheck && (
                                <div
                                    className={cn(
                                        'space-y-3 rounded-md border p-2.5 text-xs',
                                        permissionCheck.ok
                                            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
                                            : 'border-destructive/30 bg-destructive/5 text-destructive',
                                    )}
                                >
                                    <div className="space-y-1">
                                        <p className="font-medium">
                                            {permissionCheck.ok ? t.validatePermissionsOk : t.validatePermissionsMissing}
                                        </p>
                                        {permissionCheck.message && <p>{permissionCheck.message}</p>}
                                        <p className="font-mono text-[10px] text-muted-foreground">{permissionCheck.roleArn}</p>
                                    </div>
                                    {createItems.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                {t.permissionsCreate}
                                            </p>
                                            <ul className="max-h-28 space-y-1 overflow-y-auto">
                                                {createItems.map((item) => (
                                                    <li key={`create-${item.action}`} className="flex flex-wrap items-center gap-2">
                                                        <span className="font-mono">{item.action}</span>
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                'text-[9px]',
                                                                item.decision === 'allowed' && 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
                                                                item.decision === 'denied' && 'border-destructive/40 text-destructive',
                                                                item.decision === 'unknown' && 'border-amber-500/40 text-amber-700 dark:text-amber-300',
                                                            )}
                                                        >
                                                            {item.decision}
                                                        </Badge>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {rollbackItems.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                {t.permissionsRollback}
                                            </p>
                                            <ul className="max-h-28 space-y-1 overflow-y-auto">
                                                {rollbackItems.map((item) => (
                                                    <li key={`rollback-${item.action}`} className="flex flex-wrap items-center gap-2">
                                                        <span className="font-mono">{item.action}</span>
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                'text-[9px]',
                                                                item.decision === 'allowed' && 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
                                                                item.decision === 'denied' && 'border-destructive/40 text-destructive',
                                                                item.decision === 'unknown' && 'border-amber-500/40 text-amber-700 dark:text-amber-300',
                                                            )}
                                                        >
                                                            {item.decision}
                                                        </Badge>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {!permissionCheck.ok && (permissionCheck.missing?.length ?? 0) > 0 && (
                                        <div className="space-y-2 rounded-md border border-border/70 bg-background/70 p-2.5 text-foreground">
                                            <div className="space-y-1">
                                                <p className="text-xs font-semibold">Atualizar permissões da role</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Aplica as actions faltantes como inline policy{' '}
                                                    <span className="font-mono">SaaSMultiCloudAutomationGap</span> na
                                                    role da conta. A role precisa permitir{' '}
                                                    <span className="font-mono">iam:PutRolePolicy</span> e{' '}
                                                    <span className="font-mono">iam:GetRolePolicy</span> sobre si mesma.
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-8"
                                                    onClick={() => void handleGrantMissingPermissions()}
                                                    isLoading={grantingPermissions}
                                                    loadingText="Aplicando..."
                                                    disabled={!selectedCloudAccountId || validatingPreRun || executing}
                                                >
                                                    <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                                                    Aplicar permissões faltantes
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8"
                                                    onClick={() => void handleCopySuggestedPolicy()}
                                                    disabled={
                                                        !permissionCheck.suggestedPolicy && !manualPolicyJson
                                                    }
                                                >
                                                    {copiedPolicy ? (
                                                        <CheckIcon className="mr-1.5 h-3.5 w-3.5" />
                                                    ) : (
                                                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                                                    )}
                                                    Copiar policy
                                                </Button>
                                            </div>
                                            {(manualPolicyJson || permissionCheck.suggestedPolicy) && (
                                                <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">
                                                    {manualPolicyJson ??
                                                        JSON.stringify(permissionCheck.suggestedPolicy, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {Array.isArray(plan?.limitations) && (plan.limitations as string[]).length > 0 && (
                            <div>
                                <p className="font-medium">{t.limitations}</p>
                                <ul className="list-disc pl-4 text-xs text-muted-foreground">
                                    {(plan?.limitations as string[]).map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={async () => {
                                const currentOrgId = getOrgId();
                                if (currentOrgId) await cancelAutomationPlan(automationId, currentOrgId);
                                setPlanOpen(false);
                            }}
                        >
                            {t.cancelPlan}
                        </Button>
                        {canExecute && (
                            <Button
                                onClick={() => void handleExecute()}
                                disabled={
                                    plan?.blocking === true ||
                                    executing ||
                                    validatingPreRun ||
                                    !selectedCloudAccountId
                                }
                                isLoading={executing || validatingPreRun}
                                loadingText={validatingPreRun ? 'Validando...' : 'Enfileirando...'}
                            >
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
