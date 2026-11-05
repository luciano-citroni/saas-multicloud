'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import type { OrganizationCloudAccount } from '@/app/actions/organization';
import type { FinopsBudgetPayload } from '@/app/actions/finops';
import { useTranslations, type Translations } from '@/lib/i18n';

export type NotificationGroupOption = {
    id: string;
    name: string;
    channel: 'email' | 'whatsapp';
    isActive: boolean;
};

type FinopsT = Record<keyof Translations['finops'], string>;
type CommonT = Record<keyof Translations['common'], string>;

export function createBudgetFormSchema(t: FinopsT, tCommon: CommonT) {
    return z
        .object({
            name: z.string().min(1, tCommon.nameRequired).max(255),
            amount: z.number().positive(t.budgetFormAmountPositive),
            currency: z.string().length(3, t.budgetFormCurrencyInvalid),
            period: z.enum(['daily', 'monthly']),
            scope: z.enum(['organization', 'cloud_account']),
            cloudAccountId: z.string().uuid().optional().or(z.literal('')),
            service: z.string().max(255).optional(),
            resourceId: z.string().max(512).optional(),
            alertFrequency: z.enum(['daily', 'monthly']),
            /** resource oculto na UI até ingestão de resourceId nos custos. */
            alertType: z.enum(['percentage', 'amount']),
            alertAmount: z.number().positive().optional().nullable(),
            alertThresholds: z.string().optional(),
            alertChannelEmail: z.boolean(),
            alertChannelWhatsapp: z.boolean(),
            alertEmailGroupIds: z.array(z.string().uuid()),
            alertWhatsappGroupIds: z.array(z.string().uuid()),
        })
        .superRefine((data, ctx) => {
            if (data.scope === 'cloud_account' && !data.cloudAccountId) {
                ctx.addIssue({ code: 'custom', message: t.budgetFormSelectAccount, path: ['cloudAccountId'] });
            }
            if (data.alertType === 'amount' && (data.alertAmount == null || data.alertAmount <= 0)) {
                ctx.addIssue({ code: 'custom', message: t.budgetFormAlertAmountRequired, path: ['alertAmount'] });
            }
            if (data.alertType !== 'amount') {
                const parts = (data.alertThresholds ?? '')
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean);
                if (
                    parts.length === 0 ||
                    parts.some((part) => {
                        const n = Number(part);
                        return !Number.isFinite(n) || n < 1 || n > 200;
                    })
                ) {
                    ctx.addIssue({
                        code: 'custom',
                        message: t.budgetFormThresholdsInvalid,
                        path: ['alertThresholds'],
                    });
                }
            }
            if (!data.alertChannelEmail && !data.alertChannelWhatsapp) {
                ctx.addIssue({
                    code: 'custom',
                    message: t.errSelectChannel,
                    path: ['alertChannelEmail'],
                });
            }
            if (data.alertChannelEmail && data.alertEmailGroupIds.length === 0) {
                ctx.addIssue({
                    code: 'custom',
                    message: t.errSelectEmailGroup,
                    path: ['alertEmailGroupIds'],
                });
            }
            if (data.alertChannelWhatsapp && data.alertWhatsappGroupIds.length === 0) {
                ctx.addIssue({
                    code: 'custom',
                    message: t.errSelectWhatsappGroup,
                    path: ['alertWhatsappGroupIds'],
                });
            }
        });
}

export type BudgetFormData = z.infer<ReturnType<typeof createBudgetFormSchema>>;

export function parseThresholds(value: string | undefined): number[] {
    return (value ?? '')
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
}

export function toFinopsBudgetPayload(data: BudgetFormData): FinopsBudgetPayload {
    const channels: Array<'email' | 'whatsapp'> = [];
    if (data.alertChannelEmail) channels.push('email');
    if (data.alertChannelWhatsapp) channels.push('whatsapp');

    return {
        name: data.name.trim(),
        amount: data.amount,
        currency: data.currency.toUpperCase(),
        period: data.period,
        scope: data.scope,
        cloudAccountId: data.scope === 'organization' ? null : data.cloudAccountId || null,
        service: data.service?.trim() ? data.service.trim() : null,
        resourceId: null,
        alertFrequency: data.alertFrequency,
        alertType: data.alertType,
        alertAmount: data.alertType === 'amount' ? (data.alertAmount ?? null) : null,
        alertThresholds: data.alertType === 'amount' ? [100] : parseThresholds(data.alertThresholds),
        alertChannels: channels,
        alertEmails: [],
        alertNotificationGroupIds: [
            ...(data.alertChannelEmail ? data.alertEmailGroupIds : []),
            ...(data.alertChannelWhatsapp ? data.alertWhatsappGroupIds : []),
        ],
    };
}

export function defaultBudgetFormValues(overrides?: Partial<BudgetFormData>): BudgetFormData {
    return {
        name: '',
        amount: 1000,
        currency: 'USD',
        period: 'monthly',
        scope: 'cloud_account',
        cloudAccountId: '',
        service: '',
        resourceId: '',
        alertFrequency: 'daily',
        alertType: 'percentage',
        alertAmount: null,
        alertThresholds: '80, 100',
        alertChannelEmail: true,
        alertChannelWhatsapp: false,
        alertEmailGroupIds: [],
        alertWhatsappGroupIds: [],
        ...overrides,
    };
}

type FinopsBudgetFormProps = {
    mode: 'create' | 'edit';
    defaultValues: BudgetFormData;
    cloudAccounts: OrganizationCloudAccount[];
    emailGroups: NotificationGroupOption[];
    whatsappGroups: NotificationGroupOption[];
    loadingGroups: boolean;
    backHref: string;
    onSubmit: (data: BudgetFormData) => Promise<void>;
};

function GroupChecklist({
    groups,
    loading,
    value,
    onChange,
    emptyLabel,
    t,
}: {
    groups: NotificationGroupOption[];
    loading: boolean;
    value: string[];
    onChange: (next: string[]) => void;
    emptyLabel: string;
    t: FinopsT;
}) {
    if (loading) {
        return <p className="text-sm text-muted-foreground">{t.loadingGroups}</p>;
    }

    if (groups.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {emptyLabel}{' '}
                <Link href="/tenant/notifications" className="underline underline-offset-2">
                    {t.manageInNotifications}
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
                        className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
                    >
                        <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(next) => {
                                const enabled = next === true;
                                onChange(
                                    enabled ? [...value, group.id] : value.filter((id) => id !== group.id)
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

export function FinopsBudgetForm({
    mode,
    defaultValues,
    cloudAccounts,
    emailGroups,
    whatsappGroups,
    loadingGroups,
    backHref,
    onSubmit,
}: FinopsBudgetFormProps) {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');
    const budgetFormSchema = useMemo(() => createBudgetFormSchema(t, tCommon), [t, tCommon]);
    const form = useForm<BudgetFormData>({
        resolver: zodResolver(budgetFormSchema),
        defaultValues,
    });

    const watchedScope = useWatch({ control: form.control, name: 'scope' });
    const watchedAlertType = useWatch({ control: form.control, name: 'alertType' });
    const watchedEmailChannel = useWatch({ control: form.control, name: 'alertChannelEmail' });
    const watchedWhatsappChannel = useWatch({ control: form.control, name: 'alertChannelWhatsapp' });

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {mode === 'edit' ? t.editBudget : t.newBudget}
                        </h1>
                        <p className="text-sm text-muted-foreground">{t.budgetFormDesc}</p>
                    </div>
                    <FinopsSubnav />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                        <Link href={backHref}>{tCommon.cancel}</Link>
                    </Button>
                    <Button
                        size="sm"
                        type="submit"
                        form="finops-budget-form"
                        isLoading={form.formState.isSubmitting}
                    >
                        {mode === 'edit' ? tCommon.save : t.createBudget}
                    </Button>
                </div>
            </div>

            <Form {...form}>
                <form
                    id="finops-budget-form"
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="flex flex-col gap-6"
                >
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{t.budgetFormCardTitle}</CardTitle>
                            <CardDescription>{t.budgetFormCardDesc}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{tCommon.name}</FormLabel>
                                        <FormControl>
                                            <Input placeholder={t.budgetFormNamePlaceholder} {...field} />
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
                                            <FormLabel>{t.scopeLabel}</FormLabel>
                                            <Select
                                                value={field.value}
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    if (value === 'organization') {
                                                        form.setValue('cloudAccountId', '');
                                                    }
                                                }}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="organization">{t.budgetScopeWholeOrg}</SelectItem>
                                                    <SelectItem value="cloud_account">{t.budgetScopeCloudAccount}</SelectItem>
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
                                            <FormLabel>{t.budgetFormLimitPeriod}</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="monthly">{t.monthly}</SelectItem>
                                                    <SelectItem value="daily">{t.daily}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">
                                                {t.budgetFormLimitPeriodHint}
                                            </p>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {watchedScope === 'cloud_account' ? (
                                <FormField
                                    control={form.control}
                                    name="cloudAccountId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.budgetScopeCloudAccount}</FormLabel>
                                            <Select value={field.value || undefined} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder={t.selectAccountPlaceholder} />
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
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.budgetFormLimit}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0.01}
                                                    step={0.01}
                                                    value={Number.isFinite(field.value) ? field.value : ''}
                                                    onChange={(e) => {
                                                        const next = e.target.valueAsNumber;
                                                        field.onChange(Number.isFinite(next) ? next : undefined);
                                                    }}
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
                                            <FormLabel>{t.budgetFormCurrency}</FormLabel>
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
                                        <FormLabel>{t.budgetFormServiceOptional}</FormLabel>
                                        <FormControl>
                                            <Input placeholder={t.budgetFormServicePlaceholder} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{t.budgetFormAlertsTitle}</CardTitle>
                            <CardDescription>{t.budgetFormAlertsDesc}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="alertFrequency"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.budgetFormCadence}</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="daily">{t.budgetFormCadenceDaily}</SelectItem>
                                                    <SelectItem value="monthly">{t.monthly}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">
                                                {t.budgetFormCadenceHint}
                                            </p>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="alertType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.budgetFormType}</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="percentage">{t.budgetFormTypePercentage}</SelectItem>
                                                    <SelectItem value="amount">{t.budgetAlertTypeAmount}</SelectItem>
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
                                            <FormLabel>{t.budgetFormAlertAmount}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0.01}
                                                    step={0.01}
                                                    value={
                                                        field.value != null && Number.isFinite(field.value)
                                                            ? field.value
                                                            : ''
                                                    }
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
                                                {t.budgetFormAlertAmountHint}
                                            </p>
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
                                            <FormLabel>{t.budgetFormThresholds}</FormLabel>
                                            <FormControl>
                                                <Input placeholder="80, 100" {...field} />
                                            </FormControl>
                                            <p className="text-xs text-muted-foreground">
                                                {t.budgetFormThresholdsHint}
                                            </p>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{t.notificationsLink}</CardTitle>
                            <CardDescription>{t.budgetFormNotificationsDesc}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-3">
                                <p className="text-sm font-medium">{t.channelsLabel}</p>
                                <div className="flex flex-wrap gap-4">
                                    <FormField
                                        control={form.control}
                                        name="alertChannelEmail"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={(checked) =>
                                                            field.onChange(checked === true)
                                                        }
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">{tCommon.email}</FormLabel>
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
                                                        onCheckedChange={(checked) =>
                                                            field.onChange(checked === true)
                                                        }
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">WhatsApp</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <FormMessage>
                                    {form.formState.errors.alertChannelEmail?.message}
                                </FormMessage>
                            </div>

                            {watchedEmailChannel || watchedWhatsappChannel ? <Separator /> : null}

                            {watchedEmailChannel ? (
                                <FormField
                                    control={form.control}
                                    name="alertEmailGroupIds"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.emailGroupsLabel}</FormLabel>
                                            <GroupChecklist
                                                groups={emailGroups}
                                                loading={loadingGroups}
                                                value={field.value}
                                                onChange={field.onChange}
                                                emptyLabel={t.noEmailGroups}
                                                t={t}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}

                            {watchedWhatsappChannel ? (
                                <FormField
                                    control={form.control}
                                    name="alertWhatsappGroupIds"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.whatsappGroupsLabel}</FormLabel>
                                            <GroupChecklist
                                                groups={whatsappGroups}
                                                loading={loadingGroups}
                                                value={field.value}
                                                onChange={field.onChange}
                                                emptyLabel={t.noWhatsappGroups}
                                                t={t}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}
                        </CardContent>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
