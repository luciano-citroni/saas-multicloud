'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { createAiFinopsBudget } from '@/app/actions/ai-finops';
import { fetchNotificationGroups } from '@/app/actions/notifications';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';

type NotificationGroupOption = {
    id: string;
    name: string;
    channel: 'email' | 'whatsapp';
    isActive: boolean;
};

type ProviderUserOption = { externalId: string; label: string };
type ConnectionOption = { id: string; name: string; providerSlug: string };

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tenantId: string;
    midOrgId: string;
    connections: ConnectionOption[];
    costUsers: ProviderUserOption[];
    onCreated: () => void;
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

function createSchema(messages: {
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
            if (parseThresholds(data.alertThresholds).length === 0) {
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

type FormValues = z.infer<ReturnType<typeof createSchema>>;

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
    if (loading) return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
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

export function AiBudgetCreateDialog({
    open,
    onOpenChange,
    tenantId,
    midOrgId,
    connections,
    costUsers,
    onCreated,
}: Props) {
    const t = useTranslations('finops');
    const tc = useTranslations('common');
    const [pending, setPending] = useState(false);
    const [emailGroups, setEmailGroups] = useState<NotificationGroupOption[]>([]);
    const [whatsappGroups, setWhatsappGroups] = useState<NotificationGroupOption[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);

    const providerOptions = useMemo(() => {
        return Array.from(new Set(connections.map((c) => c.providerSlug).filter(Boolean))).sort();
    }, [connections]);

    const schema = useMemo(
        () =>
            createSchema({
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

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
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

    const scopeType = useWatch({ control: form.control, name: 'scopeType' });
    const emailChannel = useWatch({ control: form.control, name: 'alertChannelEmail' });
    const whatsappChannel = useWatch({ control: form.control, name: 'alertChannelWhatsapp' });

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadingGroups(true);
        void (async () => {
            try {
                const [emailRes, whatsappRes] = await Promise.all([
                    fetchNotificationGroups(tenantId, 'email', { limit: 100 }),
                    fetchNotificationGroups(tenantId, 'whatsapp', { limit: 100 }),
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
            } finally {
                if (!cancelled) setLoadingGroups(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, tenantId]);

    const onSubmit = form.handleSubmit(async (data) => {
        setPending(true);
        try {
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
            form.reset();
            onOpenChange(false);
            onCreated();
        } catch {
            toast.error(t.budgetLoadError);
        } finally {
            setPending(false);
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t.budgetsNewAi}</DialogTitle>
                    <DialogDescription>{t.budgetsAiHint}</DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem className="sm:col-span-2">
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
                                control={form.control}
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
                                control={form.control}
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
                                control={form.control}
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
                                control={form.control}
                                name="scopeType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t.aiBudgetScope}</FormLabel>
                                        <SearchableSelect
                                            mode="single"
                                            value={field.value}
                                            onValueChange={(value) => {
                                                field.onChange(value);
                                                form.setValue('scopeId', '');
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
                                    control={form.control}
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
                                    control={form.control}
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
                                    control={form.control}
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
                                    control={form.control}
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
                                control={form.control}
                                name="alertThresholds"
                                render={({ field }) => (
                                    <FormItem className="sm:col-span-2">
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
                                    control={form.control}
                                    name="alertChannelEmail"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(v) => field.onChange(v === true)}
                                                />
                                            </FormControl>
                                            <FormLabel className="font-normal">Email</FormLabel>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="alertChannelWhatsapp"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={(v) => field.onChange(v === true)}
                                                />
                                            </FormControl>
                                            <FormLabel className="font-normal">WhatsApp</FormLabel>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            {emailChannel ? (
                                <FormField
                                    control={form.control}
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
                                    control={form.control}
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

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                {tc.cancel}
                            </Button>
                            <Button type="submit" isLoading={pending}>
                                {t.aiCreateBudget}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
