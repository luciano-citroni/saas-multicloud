'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { ACCOUNT_FILTER_ALL, buildFinopsQuery, parseFinopsUrlFilters } from '@/components/root/finops/finops-filter-utils';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import { ACTIVE_ORG_STORAGE_KEY, ACTIVE_ORG_CHANGED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import {
    createFinopsBudget,
    deleteFinopsBudget,
    fetchFinopsBudgetStatuses,
    updateFinopsBudget,
} from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { cn } from '@/lib/utils';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

export type FinopsBudgetStatusItem = {
    budget: {
        id: string;
        name: string;
        amount: number;
        currency: string;
        period: string;
        service: string | null;
        alertThresholds: number[];
        isActive: boolean;
    };
    currentSpend: number;
    remainingAmount: number;
    usagePercentage: number;
    triggeredAlerts: number[];
    currency: string;
};

const budgetSchema = z.object({
    name: z.string().min(1, 'Nome é obrigatório').max(255),
    amount: z.number().positive('Valor deve ser maior que zero'),
    currency: z.string().length(3, 'Moeda inválida'),
    service: z.string().max(255).optional(),
    alertThresholds: z
        .string()
        .min(1, 'Informe ao menos um limiar')
        .refine((value) => {
            const parts = value
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean);
            if (parts.length === 0) return false;
            return parts.every((part) => {
                const n = Number(part);
                return Number.isFinite(n) && n >= 1 && n <= 200;
            });
        }, 'Use percentuais entre 1 e 200, separados por vírgula (ex: 80, 100)'),
});

type BudgetFormData = z.infer<typeof budgetSchema>;

function parseThresholds(value: string): number[] {
    return value
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
}

function usageTone(percentage: number, triggered: number[]): 'ok' | 'warn' | 'critical' {
    if (triggered.some((t) => t >= 100) || percentage >= 100) return 'critical';
    if (triggered.length > 0 || percentage >= 80) return 'warn';
    return 'ok';
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

    const selectedAccountId = urlFilters.accountId;

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
            service: '',
            alertThresholds: '80, 100',
        },
    });

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

    // Prefer URL account; fallback to sidebar account and sync into URL.
    useEffect(() => {
        if (selectedAccountId) return;
        const fallback = sidebarAccountId ?? cloudAccounts[0]?.id ?? null;
        if (fallback) syncUrlState({ account: fallback });
    }, [selectedAccountId, sidebarAccountId, cloudAccounts, syncUrlState]);

    const selectedAccount = useMemo(
        () => (selectedAccountId ? (cloudAccounts.find((account) => account.id === selectedAccountId) ?? null) : null),
        [cloudAccounts, selectedAccountId]
    );

    const canManage = hasRequiredOrganizationRole(currentRole, 'ADMIN');

    const loadStatuses = useCallback(
        async (orgId: string, cloudId: string, silent = false) => {
            if (!silent) setLoading(true);
            else setRefreshing(true);

            try {
                const response = await fetchFinopsBudgetStatuses(orgId, cloudId);
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
        if (!organizationId || !selectedAccountId) {
            setStatuses([]);
            setLoading(false);
            return;
        }
        void loadStatuses(organizationId, selectedAccountId);
    }, [organizationId, selectedAccountId, loadStatuses]);

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
            service: '',
            alertThresholds: '80, 100',
        });
        setDialogOpen(true);
    };

    const openEdit = (item: FinopsBudgetStatusItem) => {
        setEditing(item);
        form.reset({
            name: item.budget.name,
            amount: Number(item.budget.amount),
            currency: item.budget.currency || 'USD',
            service: item.budget.service ?? '',
            alertThresholds: (item.budget.alertThresholds ?? [80, 100]).join(', '),
        });
        setDialogOpen(true);
    };

    const onSubmit = async (data: BudgetFormData) => {
        if (!organizationId || !selectedAccountId) return;

        const payload = {
            name: data.name.trim(),
            amount: data.amount,
            currency: data.currency.toUpperCase(),
            period: 'monthly' as const,
            service: data.service?.trim() ? data.service.trim() : undefined,
            alertThresholds: parseThresholds(data.alertThresholds),
        };

        try {
            const response = editing
                ? await updateFinopsBudget(organizationId, selectedAccountId, editing.budget.id, payload)
                : await createFinopsBudget(organizationId, selectedAccountId, payload);

            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }

            toast.success(editing ? 'Orçamento atualizado.' : 'Orçamento criado.');
            setDialogOpen(false);
            void loadStatuses(organizationId, selectedAccountId, true);
        } catch {
            toast.error('Não foi possível salvar o orçamento.');
        }
    };

    const onDelete = async () => {
        if (!organizationId || !selectedAccountId || !deleteTarget) return;
        setDeleting(true);
        try {
            const response = await deleteFinopsBudget(organizationId, selectedAccountId, deleteTarget.budget.id);
            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }
            toast.success('Orçamento removido.');
            setDeleteTarget(null);
            void loadStatuses(organizationId, selectedAccountId, true);
        } catch {
            toast.error('Não foi possível remover o orçamento.');
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
                            Defina limites mensais por conta e acompanhe alertas de consumo.
                        </p>
                    </div>
                    <FinopsSubnav />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={selectedAccountId ?? ACCOUNT_FILTER_ALL}
                        onValueChange={(value) => {
                            const next = value === ACCOUNT_FILTER_ALL ? null : value;
                            if (next) window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, next);
                            syncUrlState({ account: next });
                        }}
                    >
                        <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Selecione a conta" />
                        </SelectTrigger>
                        <SelectContent>
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
                            if (organizationId && selectedAccountId) void loadStatuses(organizationId, selectedAccountId, true);
                        }}
                        disabled={!selectedAccountId || refreshing}
                    >
                        <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                        Atualizar
                    </Button>

                    {canManage && (
                        <Button size="sm" onClick={openCreate} disabled={!selectedAccountId}>
                            <Plus className="size-3.5" />
                            Novo orçamento
                        </Button>
                    )}
                </div>
            </div>

            {!selectedAccountId ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Selecione uma conta</CardTitle>
                        <CardDescription>Orçamentos são definidos por conta cloud.</CardDescription>
                    </CardHeader>
                </Card>
            ) : (
                <>
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
                                    {selectedAccount ? selectedAccount.alias : 'Conta selecionada'} · mês atual
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
                                <p className="text-xs text-muted-foreground">Com base nos limiares configurados</p>
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
                                    Nenhum orçamento nesta conta
                                </CardTitle>
                                <CardDescription>
                                    {canManage
                                        ? 'Crie um limite mensal para acompanhar o gasto e receber alertas em 80% e 100%.'
                                        : 'Peça a um admin para criar um orçamento nesta conta.'}
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
                                return (
                                    <Card key={item.budget.id}>
                                        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                                            <div className="space-y-1">
                                                <CardTitle className="text-base">{item.budget.name}</CardTitle>
                                                <CardDescription>
                                                    Mensal
                                                    {item.budget.service ? ` · ${item.budget.service}` : ' · todos os serviços'}
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
                </>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Editar orçamento' : 'Novo orçamento'}</DialogTitle>
                        <DialogDescription>
                            O status compara o gasto do mês calendário atual com o limite definido.
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
                                    name="amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Limite</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0.01}
                                                    step={0.01}
                                                    {...field}
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

                            <FormField
                                control={form.control}
                                name="alertThresholds"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Alertas (%)</FormLabel>
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

            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover orçamento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O orçamento “{deleteTarget?.budget.name}” será excluído permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={onDelete} disabled={deleting}>
                            {deleting ? 'Removendo…' : 'Remover'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
