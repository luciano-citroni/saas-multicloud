'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    createAiFinopsBudget,
    createAiFinopsPolicy,
    deleteAiFinopsBudget,
    deleteAiFinopsPolicy,
    fetchAiFinopsBudgetStatus,
    fetchAiFinopsPolicies,
} from '@/app/actions/ai-finops';
import { fetchNotificationGroups } from '@/app/actions/notifications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import { cn } from '@/lib/utils';

type NotificationGroupOption = {
    id: string;
    name: string;
    channel: 'email' | 'whatsapp';
    isActive: boolean;
};

type ProviderUserOption = {
    externalId: string;
    label: string;
};

type ConnectionOption = {
    id: string;
    name: string;
    providerSlug: string;
};

type BudgetRow = {
    id: string;
    name: string;
    scopeType: string;
    scopeId: string | null;
    budgetAmount: string | number;
    currency: string;
    period: string;
    alertThresholds?: number[];
    alertChannels?: string[];
    status?: string;
};

type PolicyRow = {
    id: string;
    name: string;
    scopeType: string;
    maxTokens: string | number | null;
    maxCost: string | number | null;
    maxRequestsPerMinute: number | null;
    onLimitAction: string;
    status?: string;
};

type BudgetStatus = {
    percent?: number;
    spentOfficial?: number;
    thresholdsHit?: number[];
};

type PanelMode = 'budgets' | 'policies' | 'all';

type Props = {
    tenantId: string;
    midOrgId: string;
    budgets: BudgetRow[];
    connections: ConnectionOption[];
    costUsers: ProviderUserOption[];
    onChanged: () => void;
    mode?: PanelMode;
};

function asArray<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
        return (payload as { items: T[] }).items;
    }
    return [];
}

function parseThresholds(value: string): number[] {
    return value
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 100)
        .sort((a, b) => a - b);
}

function createAiBudgetSchema(messages: {
    nameRequired: string;
    amountInvalid: string;
    thresholdsInvalid: string;
    channelRequired: string;
    emailGroupRequired: string;
    whatsappGroupRequired: string;
    scopeIdRequired: string;
}) {
    return z
        .object({
            name: z.string().min(1, messages.nameRequired).max(255),
            scopeType: z.enum(['organization', 'provider', 'connection', 'model', 'user']),
            scopeId: z.string().max(255).optional().or(z.literal('')),
            budgetAmount: z.string().min(1),
            currency: z.string().length(3),
            period: z.enum(['daily', 'monthly']),
            alertThresholds: z.string().min(1),
            alertChannelEmail: z.boolean(),
            alertChannelWhatsapp: z.boolean(),
            alertEmailGroupIds: z.array(z.string().uuid()),
            alertWhatsappGroupIds: z.array(z.string().uuid()),
        })
        .superRefine((data, ctx) => {
            const amount = Number(data.budgetAmount);
            if (!Number.isFinite(amount) || amount <= 0) {
                ctx.addIssue({ code: 'custom', message: messages.amountInvalid, path: ['budgetAmount'] });
            }
            if (data.scopeType !== 'organization' && !data.scopeId?.trim()) {
                ctx.addIssue({ code: 'custom', message: messages.scopeIdRequired, path: ['scopeId'] });
            }
            const thresholds = parseThresholds(data.alertThresholds);
            if (thresholds.length === 0) {
                ctx.addIssue({
                    code: 'custom',
                    message: messages.thresholdsInvalid,
                    path: ['alertThresholds'],
                });
            }
            if (!data.alertChannelEmail && !data.alertChannelWhatsapp) {
                ctx.addIssue({
                    code: 'custom',
                    message: messages.channelRequired,
                    path: ['alertChannelEmail'],
                });
            }
            if (data.alertChannelEmail && data.alertEmailGroupIds.length === 0) {
                ctx.addIssue({
                    code: 'custom',
                    message: messages.emailGroupRequired,
                    path: ['alertEmailGroupIds'],
                });
            }
            if (data.alertChannelWhatsapp && data.alertWhatsappGroupIds.length === 0) {
                ctx.addIssue({
                    code: 'custom',
                    message: messages.whatsappGroupRequired,
                    path: ['alertWhatsappGroupIds'],
                });
            }
        });
}

type BudgetFormValues = z.infer<ReturnType<typeof createAiBudgetSchema>>;

function createAiPolicySchema(messages: {
    nameRequired: string;
    limitRequired: string;
}) {
    return z
        .object({
            name: z.string().min(1, messages.nameRequired).max(255),
            maxTokens: z.string().optional().or(z.literal('')),
            maxCost: z.string().optional().or(z.literal('')),
            maxRequestsPerMinute: z.string().optional().or(z.literal('')),
            onLimitAction: z.enum(['notify', 'block', 'rate_limit']),
        })
        .superRefine((data, ctx) => {
            const tokens = data.maxTokens ? Number(data.maxTokens) : null;
            const cost = data.maxCost ? Number(data.maxCost) : null;
            const rpm = data.maxRequestsPerMinute ? Number(data.maxRequestsPerMinute) : null;
            const hasTokens = tokens != null && Number.isFinite(tokens) && tokens >= 0;
            const hasCost = cost != null && Number.isFinite(cost) && cost >= 0;
            const hasRpm = rpm != null && Number.isFinite(rpm) && rpm > 0;
            if (!hasTokens && !hasCost && !hasRpm) {
                ctx.addIssue({ code: 'custom', message: messages.limitRequired, path: ['maxTokens'] });
            }
        });
}

type PolicyFormValues = z.infer<ReturnType<typeof createAiPolicySchema>>;

function GroupChecklist({
    groups,
    loading,
    value,
    onChange,
    emptyLabel,
    manageLabel,
}: {
    groups: NotificationGroupOption[];
    loading: boolean;
    value: string[];
    onChange: (next: string[]) => void;
    emptyLabel: string;
    manageLabel: string;
}) {
    if (loading) {
        return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
    }
    if (groups.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">
                {emptyLabel}{' '}
                <Link href="/tenant/notifications" className="underline underline-offset-2">
                    {manageLabel}
                </Link>
            </p>
        );
    }
    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((group) => {
                const checked = value.includes(group.id);
                return (
                    <label
                        key={group.id}
                        className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm"
                    >
                        <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(next) => {
                                const enabled = next === true;
                                onChange(
                                    enabled
                                        ? [...value, group.id]
                                        : value.filter((id) => id !== group.id),
                                );
                            }}
                        />
                        <span className="leading-snug">{group.name}</span>
                    </label>
                );
            })}
        </div>
    );
}

export function AiBudgetsPanel({
    tenantId,
    midOrgId,
    budgets,
    connections,
    costUsers,
    onChanged,
    mode = 'all',
}: Props) {
    const showBudgets = mode === 'budgets' || mode === 'all';
    const showPolicies = mode === 'policies' || mode === 'all';
    const t = useTranslations('finops');
    const tc = useTranslations('common');
    const { currentRole: rawRole } = useOrganizationFromSidebar(tenantId);
    const canManage = hasRequiredOrganizationRole(normalizeOrganizationRole(rawRole), 'ADMIN');
    const [pending, startTransition] = useTransition();
    const [showBudgetForm, setShowBudgetForm] = useState(false);
    const [showPolicyForm, setShowPolicyForm] = useState(false);
    const [policies, setPolicies] = useState<PolicyRow[]>([]);
    const [statusById, setStatusById] = useState<Record<string, BudgetStatus>>({});
    const [emailGroups, setEmailGroups] = useState<NotificationGroupOption[]>([]);
    const [whatsappGroups, setWhatsappGroups] = useState<NotificationGroupOption[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);

    const providerOptions = useMemo(() => {
        const slugs = Array.from(new Set(connections.map((c) => c.providerSlug).filter(Boolean)));
        return slugs.sort();
    }, [connections]);

    const budgetSchema = useMemo(
        () =>
            createAiBudgetSchema({
                nameRequired: tc.nameRequired,
                amountInvalid: t.aiBudgetAmountInvalid,
                thresholdsInvalid: t.aiBudgetThresholdsInvalid,
                channelRequired: t.errSelectChannel,
                emailGroupRequired: t.errSelectEmailGroup,
                whatsappGroupRequired: t.errSelectWhatsappGroup,
                scopeIdRequired: t.aiBudgetScopeIdRequired,
            }),
        [t, tc],
    );

    const policySchema = useMemo(
        () =>
            createAiPolicySchema({
                nameRequired: tc.nameRequired,
                limitRequired: t.aiPolicyLimitRequired,
            }),
        [t, tc],
    );

    const budgetForm = useForm<BudgetFormValues>({
        resolver: zodResolver(budgetSchema),
        defaultValues: {
            name: '',
            scopeType: 'organization',
            scopeId: '',
            budgetAmount: '100',
            currency: 'USD',
            period: 'monthly',
            alertThresholds: '50, 75, 90, 100',
            alertChannelEmail: true,
            alertChannelWhatsapp: false,
            alertEmailGroupIds: [],
            alertWhatsappGroupIds: [],
        },
    });

    const policyForm = useForm<PolicyFormValues>({
        resolver: zodResolver(policySchema),
        defaultValues: {
            name: '',
            maxTokens: '',
            maxCost: '',
            maxRequestsPerMinute: '',
            onLimitAction: 'notify',
        },
    });

    const scopeType = useWatch({ control: budgetForm.control, name: 'scopeType' });
    const emailChannel = useWatch({ control: budgetForm.control, name: 'alertChannelEmail' });
    const whatsappChannel = useWatch({ control: budgetForm.control, name: 'alertChannelWhatsapp' });

    useEffect(() => {
        let cancelled = false;
        setLoadingGroups(true);
        void (async () => {
            try {
                const [emailRes, whatsappRes, policiesRes] = await Promise.all([
                    fetchNotificationGroups(tenantId, 'email', { limit: 100 }),
                    fetchNotificationGroups(tenantId, 'whatsapp', { limit: 100 }),
                    fetchAiFinopsPolicies(tenantId, midOrgId),
                ]);
                if (cancelled) return;
                setEmailGroups(
                    emailRes.ok
                        ? asArray<NotificationGroupOption>(await emailRes.json()).filter((g) => g.isActive)
                        : [],
                );
                setWhatsappGroups(
                    whatsappRes.ok
                        ? asArray<NotificationGroupOption>(await whatsappRes.json()).filter(
                              (g) => g.isActive,
                          )
                        : [],
                );
                setPolicies(policiesRes.ok ? asArray<PolicyRow>(await policiesRes.json()) : []);
            } finally {
                if (!cancelled) setLoadingGroups(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [tenantId, midOrgId, budgets.length]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const entries = await Promise.all(
                budgets.map(async (budget) => {
                    const res = await fetchAiFinopsBudgetStatus(tenantId, budget.id);
                    if (!res.ok) return [budget.id, {} as BudgetStatus] as const;
                    const body = (await res.json().catch(() => ({}))) as BudgetStatus;
                    return [budget.id, body] as const;
                }),
            );
            if (cancelled) return;
            setStatusById(Object.fromEntries(entries));
        })();
        return () => {
            cancelled = true;
        };
    }, [budgets, tenantId]);

    const onCreateBudget = budgetForm.handleSubmit((data) => {
        startTransition(async () => {
            const channels: Array<'email' | 'whatsapp'> = [];
            if (data.alertChannelEmail) channels.push('email');
            if (data.alertChannelWhatsapp) channels.push('whatsapp');
            const res = await createAiFinopsBudget(tenantId, {
                organizationId: midOrgId,
                name: data.name.trim(),
                scopeType: data.scopeType,
                scopeId: data.scopeType === 'organization' ? null : data.scopeId?.trim() || null,
                budgetAmount: Number(data.budgetAmount),
                currency: data.currency.toUpperCase(),
                period: data.period,
                alertThresholds: parseThresholds(data.alertThresholds),
                alertChannels: channels,
                alertNotificationGroupIds: [
                    ...(data.alertChannelEmail ? data.alertEmailGroupIds : []),
                    ...(data.alertChannelWhatsapp ? data.alertWhatsappGroupIds : []),
                ],
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.aiBudgetCreated);
            budgetForm.reset({
                name: '',
                scopeType: 'organization',
                scopeId: '',
                budgetAmount: '100',
                currency: 'USD',
                period: 'monthly',
                alertThresholds: '50, 75, 90, 100',
                alertChannelEmail: true,
                alertChannelWhatsapp: false,
                alertEmailGroupIds: [],
                alertWhatsappGroupIds: [],
            });
            setShowBudgetForm(false);
            onChanged();
        });
    });

    const onCreatePolicy = policyForm.handleSubmit((data) => {
        startTransition(async () => {
            const res = await createAiFinopsPolicy(tenantId, {
                organizationId: midOrgId,
                scopeType: 'organization',
                name: data.name.trim(),
                maxTokens: data.maxTokens ? Number(data.maxTokens) : null,
                maxCost: data.maxCost ? Number(data.maxCost) : null,
                maxRequestsPerMinute: data.maxRequestsPerMinute
                    ? Number(data.maxRequestsPerMinute)
                    : null,
                onLimitAction: data.onLimitAction,
                allowedProviders: [],
                allowedModels: [],
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.aiPolicyCreated);
            policyForm.reset({
                name: '',
                maxTokens: '',
                maxCost: '',
                maxRequestsPerMinute: '',
                onLimitAction: 'notify',
            });
            setShowPolicyForm(false);
            const policiesRes = await fetchAiFinopsPolicies(tenantId, midOrgId);
            setPolicies(policiesRes.ok ? asArray<PolicyRow>(await policiesRes.json()) : []);
            onChanged();
        });
    });

    const scopeLabel = (budget: BudgetRow) => {
        if (budget.scopeType === 'organization') return t.aiBudgetScopeOrganization;
        if (budget.scopeType === 'provider') {
            return `${t.aiBudgetScopeProvider}: ${budget.scopeId ?? '—'}`;
        }
        if (budget.scopeType === 'connection') {
            const connection = connections.find((c) => c.id === budget.scopeId);
            return `${t.aiBudgetScopeConnection}: ${connection?.name ?? budget.scopeId ?? '—'}`;
        }
        if (budget.scopeType === 'model') {
            return `${t.aiBudgetScopeModel}: ${budget.scopeId ?? '—'}`;
        }
        if (budget.scopeType === 'user') {
            const user = costUsers.find((u) => u.externalId === budget.scopeId);
            return `${t.aiBudgetScopeUser}: ${user?.label ?? budget.scopeId ?? '—'}`;
        }
        return budget.scopeType;
    };

    return (
        <div className={cn('space-y-6', mode === 'all' && 'space-y-8')}>
            {showBudgets ? (
            <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-medium">{t.aiBudgetsTitle}</p>
                        <p className="text-muted-foreground text-xs">{t.aiBudgetsDesc}</p>
                    </div>
                    {canManage ? (
                        <Button
                            size="sm"
                            variant={showBudgetForm ? 'outline' : 'default'}
                            onClick={() => setShowBudgetForm((v) => !v)}
                        >
                            <Plus className="size-3.5" />
                            {showBudgetForm ? tc.cancel : t.aiCreateBudget}
                        </Button>
                    ) : null}
                </div>

                {showBudgetForm && canManage ? (
                    <Form {...budgetForm}>
                        <form
                            onSubmit={onCreateBudget}
                            className="space-y-4 rounded-xl border p-4"
                        >
                            <div className="grid gap-3 md:grid-cols-2">
                                <FormField
                                    control={budgetForm.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{tc.name}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder={t.aiBudgetNamePlaceholder}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={budgetForm.control}
                                    name="period"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.aiBudgetPeriod}</FormLabel>
                                            <SearchableSelect
                                                mode="single"
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                options={[
                                                    { value: 'daily', label: t.aiBudgetPeriodDaily },
                                                    { value: 'monthly', label: t.aiBudgetPeriodMonthly },
                                                ]}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={budgetForm.control}
                                    name="budgetAmount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.aiBudgetAmount}</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={0.01} step="0.01" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={budgetForm.control}
                                    name="currency"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.aiBudgetCurrency}</FormLabel>
                                            <FormControl>
                                                <Input maxLength={3} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={budgetForm.control}
                                    name="scopeType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.aiBudgetScope}</FormLabel>
                                            <SearchableSelect
                                                mode="single"
                                                value={field.value}
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    budgetForm.setValue('scopeId', '');
                                                }}
                                                options={[
                                                    {
                                                        value: 'organization',
                                                        label: t.aiBudgetScopeOrganization,
                                                    },
                                                    {
                                                        value: 'provider',
                                                        label: t.aiBudgetScopeProvider,
                                                    },
                                                    {
                                                        value: 'connection',
                                                        label: t.aiBudgetScopeConnection,
                                                    },
                                                    {
                                                        value: 'model',
                                                        label: t.aiBudgetScopeModel,
                                                    },
                                                    {
                                                        value: 'user',
                                                        label: t.aiBudgetScopeUser,
                                                    },
                                                ]}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {scopeType === 'provider' ? (
                                    <FormField
                                        control={budgetForm.control}
                                        name="scopeId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.aiBudgetScopeProvider}</FormLabel>
                                                <SearchableSelect
                                                    mode="single"
                                                    value={field.value || ''}
                                                    onValueChange={field.onChange}
                                                    placeholder={t.aiBudgetSelectProvider}
                                                    options={providerOptions.map((slug) => ({
                                                        value: slug,
                                                        label: slug,
                                                    }))}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}
                                {scopeType === 'connection' ? (
                                    <FormField
                                        control={budgetForm.control}
                                        name="scopeId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.aiBudgetScopeConnection}</FormLabel>
                                                <SearchableSelect
                                                    mode="single"
                                                    value={field.value || ''}
                                                    onValueChange={field.onChange}
                                                    placeholder={
                                                        connections.length === 0
                                                            ? t.aiNoConnectionsFilter
                                                            : t.aiBudgetSelectConnection
                                                    }
                                                    options={connections.map((connection) => ({
                                                        value: connection.id,
                                                        label: `${connection.name} (${connection.providerSlug})`,
                                                    }))}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}
                                {scopeType === 'model' ? (
                                    <FormField
                                        control={budgetForm.control}
                                        name="scopeId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.aiBudgetScopeModel}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder={t.aiBudgetModelPlaceholder}
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}
                                {scopeType === 'user' ? (
                                    <FormField
                                        control={budgetForm.control}
                                        name="scopeId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.aiBudgetScopeUser}</FormLabel>
                                                <SearchableSelect
                                                    mode="single"
                                                    value={field.value || ''}
                                                    onValueChange={field.onChange}
                                                    placeholder={
                                                        costUsers.length === 0
                                                            ? t.aiNoUsers
                                                            : t.aiBudgetSelectUser
                                                    }
                                                    options={costUsers.map((user) => ({
                                                        value: user.externalId,
                                                        label: user.label,
                                                    }))}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}
                                <FormField
                                    control={budgetForm.control}
                                    name="alertThresholds"
                                    render={({ field }) => (
                                        <FormItem className="md:col-span-2">
                                            <FormLabel>{t.aiBudgetThresholds}</FormLabel>
                                            <FormControl>
                                                <Input placeholder="50, 75, 90, 100" {...field} />
                                            </FormControl>
                                            <p className="text-muted-foreground text-xs">
                                                {t.aiBudgetThresholdsHint}
                                            </p>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="space-y-3">
                                <p className="text-sm font-medium">{t.aiBudgetAlertChannels}</p>
                                <div className="flex flex-wrap gap-4">
                                    <FormField
                                        control={budgetForm.control}
                                        name="alertChannelEmail"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={(v) =>
                                                            field.onChange(v === true)
                                                        }
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">Email</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={budgetForm.control}
                                        name="alertChannelWhatsapp"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={(v) =>
                                                            field.onChange(v === true)
                                                        }
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">WhatsApp</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                {emailChannel ? (
                                    <FormField
                                        control={budgetForm.control}
                                        name="alertEmailGroupIds"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.aiBudgetEmailGroups}</FormLabel>
                                                <GroupChecklist
                                                    groups={emailGroups}
                                                    loading={loadingGroups}
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    emptyLabel={t.aiBudgetNoEmailGroups}
                                                    manageLabel={t.manageInNotifications}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}
                                {whatsappChannel ? (
                                    <FormField
                                        control={budgetForm.control}
                                        name="alertWhatsappGroupIds"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.aiBudgetWhatsappGroups}</FormLabel>
                                                <GroupChecklist
                                                    groups={whatsappGroups}
                                                    loading={loadingGroups}
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    emptyLabel={t.aiBudgetNoWhatsappGroups}
                                                    manageLabel={t.manageInNotifications}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : null}
                            </div>

                            <div className="flex justify-end">
                                <Button type="submit" size="sm" isLoading={pending}>
                                    {t.aiCreateBudget}
                                </Button>
                            </div>
                        </form>
                    </Form>
                ) : null}

                {budgets.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t.aiNoBudgets}</p>
                ) : (
                    <ul className="space-y-2">
                        {budgets.map((budget) => {
                            const status = statusById[budget.id];
                            const percent = status?.percent;
                            const spent = status?.spentOfficial;
                            return (
                                <li
                                    key={budget.id}
                                    className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium">{budget.name}</p>
                                            <Badge variant="outline">{budget.period}</Badge>
                                            {(budget.alertChannels ?? []).map((channel) => (
                                                <Badge key={channel} variant="secondary">
                                                    {channel}
                                                </Badge>
                                            ))}
                                        </div>
                                        <p className="text-muted-foreground text-xs">
                                            {scopeLabel(budget)} · {String(budget.budgetAmount)}{' '}
                                            {budget.currency}
                                            {budget.alertThresholds?.length
                                                ? ` · ${budget.alertThresholds.join('/')}%`
                                                : ''}
                                        </p>
                                        {percent != null ? (
                                            <div className="space-y-1 pt-1">
                                                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                                                    <div
                                                        className={cn(
                                                            'h-full rounded-full transition-all',
                                                            percent >= 100
                                                                ? 'bg-destructive'
                                                                : percent >= 75
                                                                  ? 'bg-amber-500'
                                                                  : 'bg-primary',
                                                        )}
                                                        style={{
                                                            width: `${Math.min(100, Math.max(0, percent))}%`,
                                                        }}
                                                    />
                                                </div>
                                                <p className="text-muted-foreground text-xs tabular-nums">
                                                    {t.aiBudgetSpendOf
                                                        .replace(
                                                            '{spent}',
                                                            Number(spent ?? 0).toFixed(2),
                                                        )
                                                        .replace(
                                                            '{limit}',
                                                            String(budget.budgetAmount),
                                                        )
                                                        .replace(
                                                            '{percent}',
                                                            percent.toFixed(1),
                                                        )}
                                                </p>
                                            </div>
                                        ) : null}
                                    </div>
                                    {canManage ? (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-destructive shrink-0"
                                            disabled={pending}
                                            onClick={() =>
                                                startTransition(async () => {
                                                    const res = await deleteAiFinopsBudget(
                                                        tenantId,
                                                        budget.id,
                                                    );
                                                    if (!res.ok && res.status !== 204) {
                                                        const body = await res
                                                            .json()
                                                            .catch(() => ({}));
                                                        toast.error(extractErrorMessage(body));
                                                        return;
                                                    }
                                                    toast.success(t.aiBudgetRemoved);
                                                    onChanged();
                                                })
                                            }
                                        >
                                            <Trash2 className="size-3.5" />
                                            {tc.delete}
                                        </Button>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            ) : null}

            {showPolicies ? (
            <div className={cn('space-y-3', mode === 'all' && 'border-t pt-6')}>
                <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">{t.aiPoliciesTitle}</p>
                        <p className="text-muted-foreground text-xs text-pretty">{t.aiPoliciesDesc}</p>
                    </div>
                    {canManage ? (
                        <Button
                            size="sm"
                            className="w-full justify-center lg:w-auto"
                            variant={showPolicyForm ? 'outline' : 'default'}
                            onClick={() => setShowPolicyForm((v) => !v)}
                        >
                            <Plus className="size-3.5" />
                            {showPolicyForm ? tc.cancel : t.aiCreatePolicy}
                        </Button>
                    ) : null}
                </div>

                {showPolicyForm && canManage ? (
                    <Form {...policyForm}>
                        <form
                            onSubmit={onCreatePolicy}
                            className="space-y-4 rounded-xl border p-3 sm:p-4"
                        >
                            <p className="text-muted-foreground text-xs text-pretty">
                                {t.aiPoliciesGatewayNote}
                            </p>
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                <FormField
                                    control={policyForm.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem className="lg:col-span-2">
                                            <FormLabel>{tc.name}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder={t.aiPolicyNamePlaceholder}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={policyForm.control}
                                    name="maxTokens"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.aiPolicyMaxTokens}</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={0} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={policyForm.control}
                                    name="maxCost"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.aiPolicyMaxCost}</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={0} step="0.01" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={policyForm.control}
                                    name="maxRequestsPerMinute"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.aiPolicyMaxRpm}</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={1} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={policyForm.control}
                                    name="onLimitAction"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.aiPolicyOnLimit}</FormLabel>
                                            <SearchableSelect
                                                mode="single"
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                options={[
                                                    { value: 'notify', label: t.aiPolicyActionNotify },
                                                    { value: 'block', label: t.aiPolicyActionBlock },
                                                    {
                                                        value: 'rate_limit',
                                                        label: t.aiPolicyActionRateLimit,
                                                    },
                                                ]}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="flex justify-stretch lg:justify-end">
                                <Button
                                    type="submit"
                                    size="sm"
                                    className="w-full justify-center lg:w-auto"
                                    isLoading={pending}
                                >
                                    {t.aiCreatePolicy}
                                </Button>
                            </div>
                        </form>
                    </Form>
                ) : null}

                {policies.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t.aiNoPolicies}</p>
                ) : (
                    <ul className="space-y-2">
                        {policies.map((policy) => (
                            <li
                                key={policy.id}
                                className="flex min-w-0 flex-col gap-3 rounded-xl border px-3 py-3 sm:px-4 lg:flex-row lg:items-start lg:justify-between"
                            >
                                <div className="min-w-0 space-y-2">
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <p className="min-w-0 break-words font-medium">{policy.name}</p>
                                        <Badge variant="outline" className="shrink-0">
                                            {policy.onLimitAction}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                                        <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                                            <p className="text-muted-foreground">{t.aiPolicyMaxTokens}</p>
                                            <p className="font-medium tabular-nums">
                                                {policy.maxTokens != null ? String(policy.maxTokens) : '—'}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                                            <p className="text-muted-foreground">{t.aiPolicyMaxCost}</p>
                                            <p className="font-medium tabular-nums">
                                                {policy.maxCost != null ? String(policy.maxCost) : '—'}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-muted/40 px-2.5 py-2">
                                            <p className="text-muted-foreground">{t.aiPolicyMaxRpm}</p>
                                            <p className="font-medium tabular-nums">
                                                {policy.maxRequestsPerMinute != null
                                                    ? String(policy.maxRequestsPerMinute)
                                                    : '—'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                {canManage ? (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive w-full justify-center shrink-0 lg:w-auto"
                                        disabled={pending}
                                        onClick={() =>
                                            startTransition(async () => {
                                                const res = await deleteAiFinopsPolicy(
                                                    tenantId,
                                                    policy.id,
                                                );
                                                if (!res.ok && res.status !== 204) {
                                                    const body = await res.json().catch(() => ({}));
                                                    toast.error(extractErrorMessage(body));
                                                    return;
                                                }
                                                toast.success(t.aiPolicyRemoved);
                                                const policiesRes = await fetchAiFinopsPolicies(
                                                    tenantId,
                                                    midOrgId,
                                                );
                                                setPolicies(
                                                    policiesRes.ok
                                                        ? asArray<PolicyRow>(
                                                              await policiesRes.json(),
                                                          )
                                                        : [],
                                                );
                                                onChanged();
                                            })
                                        }
                                    >
                                        <Trash2 className="size-3.5" />
                                        {tc.delete}
                                    </Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            ) : null}
        </div>
    );
}
