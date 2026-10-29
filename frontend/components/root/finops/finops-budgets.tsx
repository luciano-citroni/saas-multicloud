'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertTriangle, Pencil, Plus, RefreshCw, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { buildFinopsQuery, parseFinopsUrlFilters } from '@/components/root/finops/finops-filter-utils';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import { ACTIVE_ORG_STORAGE_KEY, ACTIVE_ORG_CHANGED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import {
    createFinopsBudgetUnified,
    deleteFinopsBudgetUnified,
    fetchFinopsBudgetStatuses,
    fetchOrganizationBudgetStatuses,
    updateFinopsBudgetUnified,
    type FinopsBudgetPayload,
} from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { cn } from '@/lib/utils';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const ORG_SCOPE_VALUE = 'organization';

export type FinopsBudgetStatusItem = {
    budget: {
        id: string;
        name: string;
        amount: number;
        currency: string;
        period: string;
        scope?: 'organization' | 'cloud_account';
        cloudAccountId?: string | null;
        service: string | null;
        resourceId?: string | null;
        alertThresholds: number[];
        alertFrequency?: string;
        alertType?: string;
        alertAmount?: number | null;
        alertChannels?: Array<'email' | 'whatsapp'>;
        alertEmails?: string[];
        isActive: boolean;
    };
    currentSpend: number;
    remainingAmount: number;
    usagePercentage: number;
    triggeredAlerts: number[];
    currency: string;
    cloudAccountAlias?: string;
};

const budgetSchema = z
    .object({
        name: z.string().min(1, 'Nome é obrigatório').max(255),
        amount: z.number().positive('Valor deve ser maior que zero'),
        currency: z.string().length(3, 'Moeda inválida'),
        period: z.enum(['daily', 'monthly']),
        scope: z.enum(['organization', 'cloud_account']),
        cloudAccountId: z.string().uuid().optional().or(z.literal('')),
        service: z.string().max(255).optional(),
        resourceId: z.string().max(512).optional(),
        alertFrequency: z.enum(['daily', 'monthly']),
        alertType: z.enum(['percentage', 'amount', 'resource']),
        alertAmount: z.number().positive().optional().nullable(),
        alertThresholds: z.string().optional(),
        alertChannelEmail: z.boolean(),
        alertChannelWhatsapp: z.boolean(),
        alertEmails: z.string().optional(),
    })
    .superRefine((data, ctx) => {
        if (data.scope === 'cloud_account' && !data.cloudAccountId) {
            ctx.addIssue({ code: 'custom', message: 'Selecione a conta cloud', path: ['cloudAccountId'] });
        }
        if (data.alertType === 'resource' && !data.resourceId?.trim()) {
            ctx.addIssue({ code: 'custom', message: 'Informe o recurso', path: ['resourceId'] });
        }
        if (data.alertType === 'amount' && (data.alertAmount == null || data.alertAmount <= 0)) {
            ctx.addIssue({ code: 'custom', message: 'Informe o valor do alerta', path: ['alertAmount'] });
        }
        if (data.alertType !== 'amount') {
            const parts = (data.alertThresholds ?? '')
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean);
            if (parts.length === 0 || parts.some((part) => {
                const n = Number(part);
                return !Number.isFinite(n) || n < 1 || n > 200;
            })) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Use percentuais entre 1 e 200, separados por vírgula (ex: 80, 100)',
                    path: ['alertThresholds'],
                });
            }
        }
        if (data.alertChannelEmail) {
            const emails = (data.alertEmails ?? '')
                .split(',')
                .map((e) => e.trim())
                .filter(Boolean);
            if (emails.length === 0 || emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Informe e-mails válidos separados por vírgula',
                    path: ['alertEmails'],
                });
            }
        }
        if (!data.alertChannelEmail && !data.alertChannelWhatsapp) {
            ctx.addIssue({
                code: 'custom',
                message: 'Selecione ao menos um canal de alerta',
                path: ['alertChannelEmail'],
            });
        }
    });

type BudgetFormData = z.infer<typeof budgetSchema>;

function parseThresholds(value: string | undefined): number[] {
    return (value ?? '')
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
}

function parseEmails(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
}

function usageTone(percentage: number, triggered: number[]): 'ok' | 'warn' | 'critical' {
    if (triggered.some((t) => t >= 100) || percentage >= 100) return 'critical';
    if (triggered.length > 0 || percentage >= 80) return 'warn';
    return 'ok';
}

function periodLabel(period: string) {
    return period === 'daily' ? 'Diário' : 'Mensal';
}

function alertTypeLabel(type: string | undefined) {
    if (type === 'amount') return 'Por valor';
    if (type === 'resource') return 'Por recurso';
    return 'Por % do orçamento';
}

function BudgetUsageBar({
    percentage,
    thresholds,
}: {
    percentage: number;
    thresholds: number[];
}) {
    const capped = Math.min(Math.max(percentage, 0), 100);
    const tone = usageTone(percentage, thresholds.filter((t) => percentage >= t));
    const barClass =
        tone === 'critical' ? 'bg-destructive' : tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn('absolute inset-y-0 left-0 rounded-full transition-all', barClass)} style={{ width: `${capped}%` }} />
            {thresholds.map((threshold) => (
                <div
                    key={threshold}
                    className="absolute inset-y-0 w-px bg-foreground/40"
                    style={{ left: `${Math.min(Math.max(threshold, 0), 100)}%` }}
                    title={`${threshold}%`}
                />
            ))}
        </div>
    );
}

export function FinopsBudgets() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);
    const scopeFilter = searchParams.get('account') === ORG_SCOPE_VALUE ? ORG_SCOPE_VALUE : urlFilters.accountId;

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const { currentRole: rawRole } = useOrganizationFromSidebar(organizationId);
    const currentRole = normalizeOrganizationRole(rawRole);
    const [sidebarAccountId, setSidebarAccountId] = useState<string | null>(null);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [statuses, setStatuses] = useState<FinopsBudgetStatusItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<FinopsBudgetStatusItem | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<FinopsBudgetStatusItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const syncUrlState = useCallback(
        (next: Partial<{ account: string | null }>) => {
            const nextQuery = buildFinopsQuery(searchParams, next);
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    const form = useForm<BudgetFormData>({
        resolver: zodResolver(budgetSchema),
        defaultValues: {
            name: '',
            amount: 1000,
            currency: 'USD',
            period: 'monthly',
            scope: 'cloud_account',
            cloudAccountId: '',
            service: '',
            resourceId: '',
            alertFrequency: 'monthly',
            alertType: 'percentage',
            alertAmount: null,
            alertThresholds: '80, 100',
            alertChannelEmail: true,
            alertChannelWhatsapp: false,
            alertEmails: '',
        },
    });

    const watchedScope = useWatch({ control: form.control, name: 'scope' });
    const watchedAlertType = useWatch({ control: form.control, name: 'alertType' });
    const watchedEmailChannel = useWatch({ control: form.control, name: 'alertChannelEmail' });

    useEffect(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        setSidebarAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
    }, [searchParams]);

    useEffect(() => {
        const handle = () => {
            setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
            setSidebarAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
        };
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
        window.addEventListener('storage', handle);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
            window.removeEventListener('storage', handle);
        };
    }, []);

    useEffect(() => {
        if (!organizationId) return;

        const loadAccounts = async () => {
            try {
                const response = await fetchOrganizationCloudAccounts(organizationId);
                if (!response.ok) {
                    setCloudAccounts([]);
                    return;
                }
                const payload = await response.json().catch(() => null);
                const accounts = Array.isArray(payload)
                    ? payload
                    : Array.isArray((payload as { items?: unknown })?.items)
                      ? (payload as { items: OrganizationCloudAccount[] }).items
                      : [];
                setCloudAccounts(accounts);
            } catch {
                setCloudAccounts([]);
            }
        };

        void loadAccounts();
    }, [organizationId]);

    useEffect(() => {
        if (scopeFilter) return;
        const fallback = sidebarAccountId ?? cloudAccounts[0]?.id ?? ORG_SCOPE_VALUE;
        syncUrlState({ account: fallback });
    }, [scopeFilter, sidebarAccountId, cloudAccounts, syncUrlState]);

    const selectedAccount = useMemo(
        () =>
            scopeFilter && scopeFilter !== ORG_SCOPE_VALUE
                ? (cloudAccounts.find((account) => account.id === scopeFilter) ?? null)
                : null,
        [cloudAccounts, scopeFilter]
    );

    const canManage = hasRequiredOrganizationRole(currentRole, 'ADMIN');
    const isOrgScope = scopeFilter === ORG_SCOPE_VALUE;

    const loadStatuses = useCallback(
        async (orgId: string, filter: string, silent = false) => {
            if (!silent) setLoading(true);
            else setRefreshing(true);

            try {
                const response =
                    filter === ORG_SCOPE_VALUE
                        ? await fetchOrganizationBudgetStatuses(orgId)
                        : await fetchFinopsBudgetStatuses(orgId, filter);

                if (response.status === 401) {
                    toast.error('Sessão expirada.');
                    router.replace('/auth/sign-in');
                    return;
                }
                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    toast.error(extractErrorMessage(body, 'pt'));
                    setStatuses([]);
                    return;
                }
                const payload = (await response.json().catch(() => null)) as FinopsBudgetStatusItem[] | null;
                setStatuses(Array.isArray(payload) ? payload : []);
            } catch {
                toast.error('Não foi possível carregar os orçamentos.');
                setStatuses([]);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [router]
    );

    useEffect(() => {
        if (!organizationId || !scopeFilter) {
            setStatuses([]);
            setLoading(false);
            return;
        }
        void loadStatuses(organizationId, scopeFilter);
    }, [organizationId, scopeFilter, loadStatuses]);

    const activeAlerts = useMemo(
        () =>
            statuses
                .filter((item) => item.triggeredAlerts.length > 0)
                .map((item) => ({
                    id: item.budget.id,
                    name: item.budget.name,
                    usagePercentage: item.usagePercentage,
                    triggeredAlerts: [...item.triggeredAlerts].sort((a, b) => a - b),
                    currency: item.currency,
                    currentSpend: item.currentSpend,
                    amount: item.budget.amount,
                })),
        [statuses]
    );

    const openCreate = () => {
        setEditing(null);
        form.reset({
            name: '',
            amount: 1000,
            currency: 'USD',
            period: 'monthly',
            scope: isOrgScope ? 'organization' : 'cloud_account',
            cloudAccountId: isOrgScope ? '' : (scopeFilter ?? ''),
            service: '',
            resourceId: '',
            alertFrequency: 'monthly',
            alertType: 'percentage',
            alertAmount: null,
            alertThresholds: '80, 100',
            alertChannelEmail: true,
            alertChannelWhatsapp: false,
            alertEmails: '',
        });
        setDialogOpen(true);
    };

    const openEdit = (item: FinopsBudgetStatusItem) => {
        setEditing(item);
        const channels = item.budget.alertChannels ?? ['email'];
        form.reset({
            name: item.budget.name,
            amount: Number(item.budget.amount),
            currency: item.budget.currency || 'USD',
            period: (item.budget.period === 'daily' ? 'daily' : 'monthly') as 'daily' | 'monthly',
            scope: item.budget.scope === 'organization' ? 'organization' : 'cloud_account',
            cloudAccountId: item.budget.cloudAccountId ?? '',
            service: item.budget.service ?? '',
            resourceId: item.budget.resourceId ?? '',
            alertFrequency: (item.budget.alertFrequency === 'daily' ? 'daily' : 'monthly') as 'daily' | 'monthly',
            alertType: (['percentage', 'amount', 'resource'].includes(item.budget.alertType ?? '')
                ? item.budget.alertType
                : 'percentage') as 'percentage' | 'amount' | 'resource',
            alertAmount: item.budget.alertAmount != null ? Number(item.budget.alertAmount) : null,
            alertThresholds: (item.budget.alertThresholds ?? [80, 100]).join(', '),
            alertChannelEmail: channels.includes('email'),
            alertChannelWhatsapp: channels.includes('whatsapp'),
            alertEmails: (item.budget.alertEmails ?? []).join(', '),
        });
        setDialogOpen(true);
    };

    const onSubmit = async (data: BudgetFormData) => {
        if (!organizationId) return;

        const channels: Array<'email' | 'whatsapp'> = [];
        if (data.alertChannelEmail) channels.push('email');
        if (data.alertChannelWhatsapp) channels.push('whatsapp');

        const payload: FinopsBudgetPayload = {
            name: data.name.trim(),
            amount: data.amount,
            currency: data.currency.toUpperCase(),
            period: data.period,
            scope: data.scope,
            cloudAccountId: data.scope === 'organization' ? null : data.cloudAccountId || null,
            service: data.service?.trim() ? data.service.trim() : null,
            resourceId: data.alertType === 'resource' && data.resourceId?.trim() ? data.resourceId.trim() : null,
            alertFrequency: data.alertFrequency,
            alertType: data.alertType,
            alertAmount: data.alertType === 'amount' ? data.alertAmount ?? null : null,
            alertThresholds: data.alertType === 'amount' ? [100] : parseThresholds(data.alertThresholds),
            alertChannels: channels,
            alertEmails: data.alertChannelEmail ? parseEmails(data.alertEmails) : [],
        };

        try {
            const response = editing
                ? await updateFinopsBudgetUnified(organizationId, editing.budget.id, payload)
                : await createFinopsBudgetUnified(organizationId, payload);

            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }

            toast.success(editing ? 'Orçamento atualizado.' : 'Orçamento criado.');
            setDialogOpen(false);
            if (scopeFilter) void loadStatuses(organizationId, scopeFilter, true);
        } catch {
            toast.error('Não foi possível salvar o orçamento.');
        }
    };

    const onDelete = async (): Promise<boolean> => {
        if (!organizationId || !deleteTarget) return true;
        setDeleting(true);
        try {
            const response = await deleteFinopsBudgetUnified(organizationId, deleteTarget.budget.id);
            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body, 'pt'));
                return false;
            }
            toast.success('Orçamento removido.');
            setDeleteTarget(null);
            if (scopeFilter) void loadStatuses(organizationId, scopeFilter, true);
            return true;
        } catch {
            toast.error('Não foi possível remover o orçamento.');
            return false;
        } finally {
            setDeleting(false);
        }
    };

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Orçamentos</CardTitle>
                    <CardDescription>Selecione uma organização na sidebar.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (loading && statuses.length === 0) {
        return <FinopsLoadingSkeleton />;
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Orçamentos</h1>
                        <p className="text-sm text-muted-foreground">
                            Defina limites diários ou mensais para o tenant ou por conta, com alertas por e-mail.
                        </p>
                    </div>
                    <FinopsSubnav />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={scopeFilter ?? ORG_SCOPE_VALUE}
                        onValueChange={(value) => {
                            if (value !== ORG_SCOPE_VALUE) {
                                window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, value);
                            }
                            syncUrlState({ account: value });
                        }}
                    >
                        <SelectTrigger className="w-[240px]">
                            <SelectValue placeholder="Escopo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ORG_SCOPE_VALUE}>Toda a organização</SelectItem>
                            {cloudAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                    {`${account.alias} (${account.provider.toUpperCase()})`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            if (organizationId && scopeFilter) void loadStatuses(organizationId, scopeFilter, true);
                        }}
                        disabled={!scopeFilter || refreshing}
                    >
                        <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                        Atualizar
                    </Button>

                    {canManage && (
                        <Button size="sm" onClick={openCreate} disabled={!scopeFilter}>
                            <Plus className="size-3.5" />
                            Novo orçamento
                        </Button>
                    )}
                </div>
            </div>

            {activeAlerts.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                {activeAlerts.length === 1
                                    ? '1 orçamento com alerta disparado'
                                    : `${activeAlerts.length} orçamentos com alertas disparados`}
                            </p>
                            <ul className="space-y-1.5">
                                {activeAlerts.map((alert) => (
                                    <li key={alert.id} className="text-sm text-amber-900/90 dark:text-amber-50/90">
                                        <span className="font-medium">{alert.name}</span>
                                        {': '}
                                        {alert.usagePercentage.toFixed(0)}% usado (
                                        {formatCurrency(alert.currentSpend, alert.currency)} de{' '}
                                        {formatCurrency(alert.amount, alert.currency)}) — limiares{' '}
                                        {alert.triggeredAlerts.map((t) => `${t}%`).join(', ')}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Orçamentos ativos</CardDescription>
                        <CardTitle className="text-2xl">{statuses.length}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            {isOrgScope ? 'Organização inteira' : selectedAccount?.alias ?? 'Conta'} · período configurado
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Alertas disparados</CardDescription>
                        <CardTitle className={cn('text-2xl', activeAlerts.length > 0 && 'text-amber-600')}>
                            {activeAlerts.length}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">Com base nos limiares e canais cadastrados</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Gasto vs limite (1º budget)</CardDescription>
                        <CardTitle className="text-2xl">
                            {statuses[0] ? `${statuses[0].usagePercentage.toFixed(0)}%` : '—'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            {statuses[0]
                                ? `${formatCurrency(statuses[0].currentSpend, statuses[0].currency)} de ${formatCurrency(statuses[0].budget.amount, statuses[0].currency)}`
                                : 'Nenhum orçamento'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {statuses.length === 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Target className="size-4" />
                            {isOrgScope ? 'Nenhum orçamento da organização' : 'Nenhum orçamento nesta conta'}
                        </CardTitle>
                        <CardDescription>
                            {canManage
                                ? 'Crie um limite diário ou mensal e configure alertas por e-mail (WhatsApp em breve).'
                                : 'Peça a um admin para criar um orçamento.'}
                        </CardDescription>
                    </CardHeader>
                    {canManage && (
                        <CardContent>
                            <Button onClick={openCreate}>
                                <Plus className="size-3.5" />
                                Criar orçamento
                            </Button>
                        </CardContent>
                    )}
                </Card>
            ) : (
                <div className="grid gap-3">
                    {statuses.map((item) => {
                        const tone = usageTone(item.usagePercentage, item.triggeredAlerts);
                        const channels = item.budget.alertChannels ?? [];
                        return (
                            <Card key={item.budget.id}>
                                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base">{item.budget.name}</CardTitle>
                                        <CardDescription>
                                            {periodLabel(item.budget.period)}
                                            {' · '}
                                            {item.budget.scope === 'organization' ? 'Organização' : 'Conta'}
                                            {item.budget.service ? ` · ${item.budget.service}` : ' · todos os serviços'}
                                            {' · '}
                                            {alertTypeLabel(item.budget.alertType)}
                                            {' · alerta '}
                                            {periodLabel(item.budget.alertFrequency ?? item.budget.period).toLowerCase()}
                                        </CardDescription>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {item.triggeredAlerts.length > 0 ? (
                                            <Badge variant="destructive" className="gap-1">
                                                <AlertTriangle className="size-3" />
                                                Alerta {Math.max(...item.triggeredAlerts)}%
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary">Dentro do limite</Badge>
                                        )}
                                        {channels.includes('email') && <Badge variant="outline">E-mail</Badge>}
                                        {channels.includes('whatsapp') && (
                                            <Badge variant="outline">WhatsApp (em breve)</Badge>
                                        )}
                                        {canManage && (
                                            <>
                                                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)}>
                                                    <Pencil className="size-3.5" />
                                                    <span className="sr-only">Editar</span>
                                                </Button>
                                                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(item)}>
                                                    <Trash2 className="size-3.5" />
                                                    <span className="sr-only">Remover</span>
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex flex-wrap items-end justify-between gap-2">
                                        <div>
                                            <p
                                                className={cn(
                                                    'text-2xl font-semibold tabular-nums',
                                                    tone === 'critical' && 'text-destructive',
                                                    tone === 'warn' && 'text-amber-600'
                                                )}
                                            >
                                                {item.usagePercentage.toFixed(1)}%
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {formatCurrency(item.currentSpend, item.currency)} de{' '}
                                                {formatCurrency(Number(item.budget.amount), item.currency)}
                                            </p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Restante:{' '}
                                            <span className="font-medium text-foreground">
                                                {formatCurrency(item.remainingAmount, item.currency)}
                                            </span>
                                        </p>
                                    </div>

                                    <BudgetUsageBar
                                        percentage={item.usagePercentage}
                                        thresholds={item.budget.alertThresholds ?? []}
                                    />

                                    <div className="flex flex-wrap gap-1.5">
                                        {(item.budget.alertThresholds ?? []).map((threshold) => {
                                            const triggered = item.triggeredAlerts.includes(threshold);
                                            return (
                                                <Badge
                                                    key={threshold}
                                                    variant={triggered ? 'destructive' : 'outline'}
                                                    className="tabular-nums"
                                                >
                                                    {threshold}%{triggered ? ' atingido' : ''}
                                                </Badge>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Editar orçamento' : 'Novo orçamento'}</DialogTitle>
                        <DialogDescription>
                            Configure o limite, a frequência dos alertas e os canais de notificação.
                        </DialogDescription>
                    </DialogHeader>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Budget mensal produção" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="scope"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Escopo</FormLabel>
                                            <Select
                                                value={field.value}
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    if (value === 'organization') {
                                                        form.setValue('cloudAccountId', '');
                                                    } else if (!form.getValues('cloudAccountId') && scopeFilter !== ORG_SCOPE_VALUE) {
                                                        form.setValue('cloudAccountId', scopeFilter ?? '');
                                                    }
                                                }}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="organization">Toda a organização</SelectItem>
                                                    <SelectItem value="cloud_account">Conta cloud</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="period"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Período do orçamento</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="monthly">Mensal</SelectItem>
                                                    <SelectItem value="daily">Diário</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {watchedScope === 'cloud_account' && (
                                <FormField
                                    control={form.control}
                                    name="cloudAccountId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Conta cloud</FormLabel>
                                            <Select value={field.value || undefined} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecione a conta" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {cloudAccounts.map((account) => (
                                                        <SelectItem key={account.id} value={account.id}>
                                                            {`${account.alias} (${account.provider.toUpperCase()})`}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Limite</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0.01}
                                                    step={0.01}
                                                    value={field.value ?? ''}
                                                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="currency"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Moeda</FormLabel>
                                            <FormControl>
                                                <Input placeholder="USD" maxLength={3} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="service"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Serviço (opcional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ex: Amazon EC2 — vazio = todos" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="space-y-3 rounded-lg border p-3">
                                <p className="text-sm font-medium">Alertas</p>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="alertFrequency"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Frequência</FormLabel>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="daily">Diário</SelectItem>
                                                        <SelectItem value="monthly">Mensal</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="alertType"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tipo</FormLabel>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="percentage">% do orçamento</SelectItem>
                                                        <SelectItem value="amount">Por valor</SelectItem>
                                                        <SelectItem value="resource">Por recurso</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {watchedAlertType === 'amount' ? (
                                    <FormField
                                        control={form.control}
                                        name="alertAmount"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Valor do alerta</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={0.01}
                                                        step={0.01}
                                                        value={field.value ?? ''}
                                                        onChange={(e) =>
                                                            field.onChange(
                                                                Number.isFinite(e.target.valueAsNumber)
                                                                    ? e.target.valueAsNumber
                                                                    : null
                                                            )
                                                        }
                                                    />
                                                </FormControl>
                                                <p className="text-xs text-muted-foreground">
                                                    Dispara quando o gasto do período do alerta atingir este valor.
                                                </p>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}

                                {watchedAlertType === 'resource' ? (
                                    <FormField
                                        control={form.control}
                                        name="resourceId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>ID do recurso</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Ex: i-0123… / vm-name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}

                                {watchedAlertType !== 'amount' ? (
                                    <FormField
                                        control={form.control}
                                        name="alertThresholds"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Limiares (%)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="80, 100" {...field} />
                                                </FormControl>
                                                <p className="text-xs text-muted-foreground">
                                                    Percentuais separados por vírgula. Ex.: 50, 80, 100
                                                </p>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}

                                <div className="space-y-2">
                                    <p className="text-sm font-medium">Canais</p>
                                    <FormField
                                        control={form.control}
                                        name="alertChannelEmail"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={(checked) => field.onChange(checked === true)}
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">E-mail</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="alertChannelWhatsapp"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-start gap-2 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={(checked) => field.onChange(checked === true)}
                                                    />
                                                </FormControl>
                                                <div className="space-y-0.5">
                                                    <FormLabel className="font-normal">WhatsApp</FormLabel>
                                                    <p className="text-xs text-muted-foreground">
                                                        Cadastro disponível; envio ainda não implementado.
                                                    </p>
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                    <FormMessage>
                                        {form.formState.errors.alertChannelEmail?.message}
                                    </FormMessage>
                                </div>

                                {watchedEmailChannel ? (
                                    <FormField
                                        control={form.control}
                                        name="alertEmails"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>E-mails</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="finops@empresa.com, ops@empresa.com" {...field} />
                                                </FormControl>
                                                <p className="text-xs text-muted-foreground">
                                                    Separados por vírgula.
                                                </p>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" isLoading={form.formState.isSubmitting}>
                                    {editing ? 'Salvar' : 'Criar'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <ConfirmDeleteDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
                title="Remover orçamento?"
                description={`O orçamento “${deleteTarget?.budget.name ?? ''}” será excluído permanentemente.`}
                resourceName={deleteTarget?.budget.name ?? ''}
                confirmLabel="Remover"
                isConfirming={deleting}
                onConfirm={onDelete}
            />
        </div>
    );
}
