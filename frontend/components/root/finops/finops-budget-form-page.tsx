'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import {
    FinopsBudgetForm,
    defaultBudgetFormValues,
    toFinopsBudgetPayload,
    type BudgetFormData,
    type NotificationGroupOption,
} from '@/components/root/finops/finops-budget-form';
import type { FinopsBudgetStatusItem } from '@/components/root/finops/finops-budget-types';
import { ACTIVE_ORG_STORAGE_KEY, ACTIVE_ORG_CHANGED_EVENT } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import {
    createFinopsBudgetUnified,
    fetchFinopsBudgetStatuses,
    fetchOrganizationBudgetStatuses,
    fetchOrganizationFinopsBudgetStatuses,
    updateFinopsBudgetUnified,
} from '@/app/actions/finops';
import { fetchNotificationGroups } from '@/app/actions/notifications';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const ORG_SCOPE_VALUE = 'organization';

function normalizeNotificationGroupsPayload(payload: unknown): NotificationGroupOption[] {
    const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown } | null)?.items)
          ? (payload as { items: unknown[] }).items
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

function normalizeStatuses(payload: unknown): FinopsBudgetStatusItem[] {
    if (Array.isArray(payload)) return payload as FinopsBudgetStatusItem[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
        return (payload as { items: FinopsBudgetStatusItem[] }).items;
    }
    return [];
}

function budgetToFormValues(
    item: FinopsBudgetStatusItem,
    emailGroups: NotificationGroupOption[],
    whatsappGroups: NotificationGroupOption[]
): BudgetFormData {
    const channels = item.budget.alertChannels ?? ['email'];
    const groupIds = item.budget.alertNotificationGroupIds ?? [];
    const emailIdSet = new Set(emailGroups.map((group) => group.id));
    const whatsappIdSet = new Set(whatsappGroups.map((group) => group.id));

    return defaultBudgetFormValues({
        name: item.budget.name,
        amount: Number(item.budget.amount),
        currency: item.budget.currency || 'USD',
        period: item.budget.period === 'daily' ? 'daily' : 'monthly',
        scope: item.budget.scope === 'organization' ? 'organization' : 'cloud_account',
        cloudAccountId: item.budget.cloudAccountId ?? '',
        service: item.budget.service ?? '',
        resourceId: item.budget.resourceId ?? '',
        alertFrequency: item.budget.alertFrequency === 'daily' ? 'daily' : 'monthly',
        alertType: (['percentage', 'amount', 'resource'].includes(item.budget.alertType ?? '')
            ? item.budget.alertType
            : 'percentage') as BudgetFormData['alertType'],
        alertAmount: item.budget.alertAmount != null ? Number(item.budget.alertAmount) : null,
        alertThresholds: (item.budget.alertThresholds ?? [80, 100]).join(', '),
        alertChannelEmail: channels.includes('email'),
        alertChannelWhatsapp: channels.includes('whatsapp'),
        alertEmailGroupIds: groupIds.filter((id) => emailIdSet.has(id)),
        alertWhatsappGroupIds: groupIds.filter((id) => whatsappIdSet.has(id)),
    });
}

type FinopsBudgetFormPageProps = {
    mode: 'create' | 'edit';
    budgetId?: string;
};

export function FinopsBudgetFormPage({ mode, budgetId }: FinopsBudgetFormPageProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const accountHint = searchParams.get('account');

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const { currentRole: rawRole } = useOrganizationFromSidebar(organizationId);
    const currentRole = normalizeOrganizationRole(rawRole);
    const canManage = hasRequiredOrganizationRole(currentRole, 'ADMIN');

    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [emailGroups, setEmailGroups] = useState<NotificationGroupOption[]>([]);
    const [whatsappGroups, setWhatsappGroups] = useState<NotificationGroupOption[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [loading, setLoading] = useState(mode === 'edit');
    const [formValues, setFormValues] = useState<BudgetFormData | null>(null);
    const [notFound, setNotFound] = useState(false);

    const backHref = useMemo(() => {
        const params = new URLSearchParams();
        if (accountHint) params.set('account', accountHint);
        const query = params.toString();
        return query ? `/finops/budgets?${query}` : '/finops/budgets';
    }, [accountHint]);

    useEffect(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        const handle = () => setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
        window.addEventListener('storage', handle);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
            window.removeEventListener('storage', handle);
        };
    }, []);

    const loadNotificationGroups = useCallback(async (orgId: string) => {
        setLoadingGroups(true);
        try {
            const [emailResponse, whatsappResponse] = await Promise.all([
                fetchNotificationGroups(orgId, 'email', { limit: 100 }),
                fetchNotificationGroups(orgId, 'whatsapp', { limit: 100 }),
            ]);
            const emailPayload = emailResponse.ok ? await emailResponse.json().catch(() => null) : null;
            const whatsappPayload = whatsappResponse.ok ? await whatsappResponse.json().catch(() => null) : null;
            const emails = normalizeNotificationGroupsPayload(emailPayload).filter((g) => g.isActive);
            const whatsapps = normalizeNotificationGroupsPayload(whatsappPayload).filter((g) => g.isActive);
            setEmailGroups(emails);
            setWhatsappGroups(whatsapps);
            return { emails, whatsapps };
        } catch {
            setEmailGroups([]);
            setWhatsappGroups([]);
            return { emails: [] as NotificationGroupOption[], whatsapps: [] as NotificationGroupOption[] };
        } finally {
            setLoadingGroups(false);
        }
    }, []);

    const resolveBudget = useCallback(
        async (orgId: string, id: string): Promise<FinopsBudgetStatusItem | null> => {
            const tryParse = async (response: Response | null) => {
                if (!response?.ok) return [] as FinopsBudgetStatusItem[];
                return normalizeStatuses(await response.json().catch(() => null));
            };

            if (accountHint === ORG_SCOPE_VALUE) {
                const items = await tryParse(await fetchOrganizationBudgetStatuses(orgId));
                const found = items.find((item) => item.budget.id === id);
                if (found) return found;
            }

            if (accountHint && accountHint !== ORG_SCOPE_VALUE) {
                const items = await tryParse(await fetchFinopsBudgetStatuses(orgId, accountHint));
                const found = items.find((item) => item.budget.id === id);
                if (found) return found;
            }

            const [orgItems, batchItems] = await Promise.all([
                tryParse(await fetchOrganizationBudgetStatuses(orgId)),
                tryParse(await fetchOrganizationFinopsBudgetStatuses(orgId, 50)),
            ]);

            return (
                orgItems.find((item) => item.budget.id === id) ??
                batchItems.find((item) => item.budget.id === id) ??
                null
            );
        },
        [accountHint]
    );

    useEffect(() => {
        if (!organizationId) return;

        let cancelled = false;

        const bootstrap = async () => {
            setLoading(true);
            setNotFound(false);

            try {
                const [accountsResponse, groups] = await Promise.all([
                    fetchOrganizationCloudAccounts(organizationId),
                    loadNotificationGroups(organizationId),
                ]);

                if (accountsResponse.ok) {
                    const payload = await accountsResponse.json().catch(() => null);
                    const accounts = Array.isArray(payload)
                        ? payload
                        : Array.isArray((payload as { items?: unknown })?.items)
                          ? ((payload as { items: OrganizationCloudAccount[] }).items)
                          : [];
                    if (!cancelled) setCloudAccounts(accounts);
                } else if (!cancelled) {
                    setCloudAccounts([]);
                }

                if (mode === 'create') {
                    const sidebarAccountId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
                    const preferredAccount =
                        accountHint && accountHint !== ORG_SCOPE_VALUE
                            ? accountHint
                            : (sidebarAccountId ?? '');
                    const scope =
                        accountHint === ORG_SCOPE_VALUE || (!accountHint && !preferredAccount)
                            ? 'organization'
                            : 'cloud_account';

                    if (!cancelled) {
                        setFormValues(
                            defaultBudgetFormValues({
                                scope,
                                cloudAccountId: scope === 'cloud_account' ? preferredAccount : '',
                            })
                        );
                    }
                    return;
                }

                if (!budgetId) {
                    if (!cancelled) setNotFound(true);
                    return;
                }

                const budget = await resolveBudget(organizationId, budgetId);
                if (!budget) {
                    if (!cancelled) setNotFound(true);
                    return;
                }

                if (!cancelled) {
                    setFormValues(budgetToFormValues(budget, groups.emails, groups.whatsapps));
                }
            } catch {
                toast.error('Não foi possível carregar o formulário.');
                if (!cancelled && mode === 'edit') setNotFound(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void bootstrap();
        return () => {
            cancelled = true;
        };
    }, [
        organizationId,
        mode,
        budgetId,
        accountHint,
        loadNotificationGroups,
        resolveBudget,
    ]);

    const onSubmit = async (data: BudgetFormData) => {
        if (!organizationId) return;

        const payload = toFinopsBudgetPayload(data);

        try {
            const response =
                mode === 'edit' && budgetId
                    ? await updateFinopsBudgetUnified(organizationId, budgetId, payload)
                    : await createFinopsBudgetUnified(organizationId, payload);

            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }

            toast.success(mode === 'edit' ? 'Orçamento atualizado.' : 'Orçamento criado.');

            // Volta para a visão completa para não “esconder” budgets de outro escopo.
            const params = new URLSearchParams();
            params.set('account', ORG_SCOPE_VALUE);
            router.push(`/finops/budgets?${params.toString()}`);
        } catch {
            toast.error('Não foi possível salvar o orçamento.');
        }
    };

    if (!organizationId) {
        return (
            <div className="flex flex-col gap-6">
                <div className="space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Orçamentos</h1>
                        <p className="text-sm text-muted-foreground">Selecione uma organização na sidebar.</p>
                    </div>
                    <FinopsSubnav />
                </div>
            </div>
        );
    }

    if (!canManage) {
        return (
            <div className="flex flex-col gap-6">
                <div className="space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {mode === 'edit' ? 'Editar orçamento' : 'Novo orçamento'}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Apenas administradores podem criar ou editar orçamentos.
                        </p>
                    </div>
                    <FinopsSubnav />
                </div>
            </div>
        );
    }

    if (loading || !formValues) {
        if (notFound) {
            return (
                <div className="flex flex-col gap-6">
                    <div className="space-y-3">
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight">Orçamento não encontrado</h1>
                            <p className="text-sm text-muted-foreground">
                                O orçamento pode ter sido removido ou não pertence a esta organização.
                            </p>
                        </div>
                        <FinopsSubnav />
                    </div>
                </div>
            );
        }
        return <FinopsLoadingSkeleton />;
    }

    if (notFound) {
        return (
            <div className="flex flex-col gap-6">
                <div className="space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Orçamento não encontrado</h1>
                        <p className="text-sm text-muted-foreground">
                            O orçamento pode ter sido removido ou não pertence a esta organização.
                        </p>
                    </div>
                    <FinopsSubnav />
                </div>
            </div>
        );
    }

    return (
        <FinopsBudgetForm
            mode={mode}
            defaultValues={formValues}
            cloudAccounts={cloudAccounts}
            emailGroups={emailGroups}
            whatsappGroups={whatsappGroups}
            loadingGroups={loadingGroups}
            backHref={backHref}
            onSubmit={onSubmit}
        />
    );
}
