'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Pencil, Plus, RefreshCw, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { buildFinopsQuery, parseFinopsUrlFilters } from '@/components/root/finops/finops-filter-utils';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { NotificationGroupOption } from '@/components/root/finops/finops-budget-form';
import type { FinopsBudgetStatusItem } from '@/components/root/finops/finops-budget-types';
import { ACTIVE_ORG_STORAGE_KEY, ACTIVE_ORG_CHANGED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import {
    deleteFinopsBudgetUnified,
    fetchFinopsBudgetStatuses,
    fetchOrganizationBudgetStatuses,
} from '@/app/actions/finops';
import { fetchNotificationGroups } from '@/app/actions/notifications';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { cn } from '@/lib/utils';

export type { FinopsBudgetStatusItem };

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const ORG_SCOPE_VALUE = 'organization';

function normalizeNotificationGroupsPayload(payload: unknown): NotificationGroupOption[] {
    const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown } | null)?.items)
          ? ((payload as { items: unknown[] }).items)
          : [];

    return items
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
            id: String(item.id ?? ''),
            name: String(item.name ?? 'Grupo'),
            channel: item.channel === 'whatsapp' ? 'whatsapp' : 'email',
            isActive: item.isActive !== false,
        }))
        .filter((item) => Boolean(item.id));
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
    const [emailGroups, setEmailGroups] = useState<NotificationGroupOption[]>([]);
    const [whatsappGroups, setWhatsappGroups] = useState<NotificationGroupOption[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<FinopsBudgetStatusItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const syncUrlState = useCallback(
        (next: Partial<{ account: string | null }>) => {
            const nextQuery = buildFinopsQuery(searchParams, next);
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    const newBudgetHref = useMemo(() => {
        const params = new URLSearchParams();
        if (scopeFilter) params.set('account', scopeFilter);
        const query = params.toString();
        return query ? `/finops/budgets/new?${query}` : '/finops/budgets/new';
    }, [scopeFilter]);

    const editBudgetHref = useCallback(
        (budgetId: string) => {
            const params = new URLSearchParams();
            if (scopeFilter) params.set('account', scopeFilter);
            const query = params.toString();
            return query
                ? `/finops/budgets/${encodeURIComponent(budgetId)}/edit?${query}`
                : `/finops/budgets/${encodeURIComponent(budgetId)}/edit`;
        },
        [scopeFilter]
    );

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

        const loadAccountsAndGroups = async () => {
            try {
                const [accountsResponse, emailResponse, whatsappResponse] = await Promise.all([
                    fetchOrganizationCloudAccounts(organizationId),
                    fetchNotificationGroups(organizationId, 'email', { limit: 100 }),
                    fetchNotificationGroups(organizationId, 'whatsapp', { limit: 100 }),
                ]);

                if (accountsResponse.ok) {
                    const payload = await accountsResponse.json().catch(() => null);
                    const accounts = Array.isArray(payload)
                        ? payload
                        : Array.isArray((payload as { items?: unknown })?.items)
                          ? ((payload as { items: OrganizationCloudAccount[] }).items)
                          : [];
                    setCloudAccounts(accounts);
                } else {
                    setCloudAccounts([]);
                }

                const emailPayload = emailResponse.ok ? await emailResponse.json().catch(() => null) : null;
                const whatsappPayload = whatsappResponse.ok
                    ? await whatsappResponse.json().catch(() => null)
                    : null;
                setEmailGroups(normalizeNotificationGroupsPayload(emailPayload));
                setWhatsappGroups(normalizeNotificationGroupsPayload(whatsappPayload));
            } catch {
                setCloudAccounts([]);
                setEmailGroups([]);
                setWhatsappGroups([]);
            }
        };

        void loadAccountsAndGroups();
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
                            Defina limites diários ou mensais para o tenant ou por conta, com alertas por grupos de
                            notificação.
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

                    {canManage && scopeFilter ? (
                        <Button size="sm" asChild>
                            <Link href={newBudgetHref}>
                                <Plus className="size-3.5" />
                                Novo orçamento
                            </Link>
                        </Button>
                    ) : null}
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
                                ? 'Crie um limite diário ou mensal e configure alertas por e-mail e/ou WhatsApp.'
                                : 'Peça a um admin para criar um orçamento.'}
                        </CardDescription>
                    </CardHeader>
                    {canManage && (
                        <CardContent>
                            <Button asChild>
                                <Link href={newBudgetHref}>
                                    <Plus className="size-3.5" />
                                    Criar orçamento
                                </Link>
                            </Button>
                        </CardContent>
                    )}
                </Card>
            ) : (
                <div className="grid gap-3">
                    {statuses.map((item) => {
                        const tone = usageTone(item.usagePercentage, item.triggeredAlerts);
                        const channels = item.budget.alertChannels ?? [];
                        const groupIds = item.budget.alertNotificationGroupIds ?? [];
                        const allGroups = [...emailGroups, ...whatsappGroups];
                        const groupNames = groupIds
                            .map((id) => allGroups.find((group) => group.id === id)?.name)
                            .filter((name): name is string => Boolean(name));
                        const legacyEmails = item.budget.alertEmails ?? [];
                        const alertTargetsLabel =
                            groupNames.length > 0
                                ? groupNames.join(', ')
                                : groupIds.length > 0
                                  ? `${groupIds.length} grupo(s)`
                                  : legacyEmails.length > 0
                                    ? legacyEmails.join(', ')
                                    : null;
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
                                        {channels.includes('whatsapp') && <Badge variant="outline">WhatsApp</Badge>}
                                        {canManage && (
                                            <>
                                                <Button variant="ghost" size="icon-sm" asChild>
                                                    <Link href={editBudgetHref(item.budget.id)}>
                                                        <Pencil className="size-3.5" />
                                                        <span className="sr-only">Editar</span>
                                                    </Link>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() => setDeleteTarget(item)}
                                                >
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

                                    {alertTargetsLabel ? (
                                        <p className="text-xs text-muted-foreground">
                                            Notificações: {alertTargetsLabel}
                                        </p>
                                    ) : null}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

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
