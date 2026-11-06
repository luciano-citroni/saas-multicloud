'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';

import { saveCommercialDelivery } from '@/app/actions/finops';
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
import { Separator } from '@/components/ui/separator';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import { useTranslations, type Translations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type NotificationGroupOption = {
    id: string;
    name: string;
    channel: 'email' | 'whatsapp';
    isActive: boolean;
};

type FinopsT = Record<keyof Translations['finops'], string>;

type DeliverySettings = {
    enabled: boolean;
    alertChannels?: Array<'email' | 'whatsapp'>;
    alertNotificationGroupIds?: string[];
    currency?: 'USD' | 'BRL';
};

type ReportCurrency = 'USD' | 'BRL';

function createSchema(t: FinopsT) {
    return z
        .object({
            enabled: z.boolean(),
            alertChannelEmail: z.boolean(),
            alertChannelWhatsapp: z.boolean(),
            alertEmailGroupIds: z.array(z.string().uuid()),
            alertWhatsappGroupIds: z.array(z.string().uuid()),
            currency: z.enum(['USD', 'BRL']),
        })
        .superRefine((data, ctx) => {
            if (!data.enabled) return;
            if (!data.alertChannelEmail && !data.alertChannelWhatsapp) {
                ctx.addIssue({ code: 'custom', message: t.errSelectChannel, path: ['alertChannelEmail'] });
            }
            if (data.alertChannelEmail && data.alertEmailGroupIds.length === 0) {
                ctx.addIssue({ code: 'custom', message: t.errSelectEmailGroup, path: ['alertEmailGroupIds'] });
            }
            if (data.alertChannelWhatsapp && data.alertWhatsappGroupIds.length === 0) {
                ctx.addIssue({ code: 'custom', message: t.errSelectWhatsappGroup, path: ['alertWhatsappGroupIds'] });
            }
        });
}

type FormData = z.infer<ReturnType<typeof createSchema>>;

function parseGroups(payload: unknown): NotificationGroupOption[] {
    const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown } | null)?.items)
          ? (payload as { items: unknown[] }).items
          : [];

    return items
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            if (typeof row.id !== 'string' || typeof row.name !== 'string') return null;
            if (row.channel !== 'email' && row.channel !== 'whatsapp') return null;
            return {
                id: row.id,
                name: row.name,
                channel: row.channel,
                isActive: row.isActive !== false,
            } satisfies NotificationGroupOption;
        })
        .filter((group): group is NotificationGroupOption => group != null && group.isActive);
}

function settingsToForm(
    settings: DeliverySettings | undefined,
    emailGroups: NotificationGroupOption[],
    whatsappGroups: NotificationGroupOption[],
    sourceCurrency: ReportCurrency,
    canConvert: boolean,
): FormData {
    const emailIds = new Set(emailGroups.map((group) => group.id));
    const whatsappIds = new Set(whatsappGroups.map((group) => group.id));
    const groupIds = settings?.alertNotificationGroupIds ?? [];
    const channels = settings?.alertChannels ?? [];
    const saved = settings?.currency === 'USD' || settings?.currency === 'BRL' ? settings.currency : sourceCurrency;
    return {
        enabled: settings?.enabled ?? false,
        alertChannelEmail: channels.includes('email'),
        alertChannelWhatsapp: channels.includes('whatsapp'),
        alertEmailGroupIds: groupIds.filter((id) => emailIds.has(id)),
        alertWhatsappGroupIds: groupIds.filter((id) => whatsappIds.has(id)),
        currency: !canConvert && saved !== sourceCurrency ? sourceCurrency : saved,
    };
}

function GroupChecklist({
    groups,
    loading,
    value,
    onChange,
    emptyLabel,
    disabled,
    t,
}: {
    groups: NotificationGroupOption[];
    loading: boolean;
    value: string[];
    onChange: (next: string[]) => void;
    emptyLabel: string;
    disabled?: boolean;
    t: FinopsT;
}) {
    if (loading) return <p className="text-sm text-muted-foreground">{t.loadingGroups}</p>;
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
                        className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                    >
                        <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(next) => {
                                const on = next === true;
                                onChange(on ? [...value, group.id] : value.filter((id) => id !== group.id));
                            }}
                        />
                        <span className="leading-snug">{group.name}</span>
                    </label>
                );
            })}
        </div>
    );
}

export function CommercialReportDelivery({
    organizationId,
    delivery,
    sourceCurrency = 'BRL',
    canConvert = false,
    onSaved,
}: {
    organizationId: string;
    delivery?: DeliverySettings;
    sourceCurrency?: ReportCurrency;
    canConvert?: boolean;
    onSaved: () => Promise<void> | void;
}) {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');
    const schema = useMemo(() => createSchema(t), [t]);
    const { currentRole: rawRole } = useOrganizationFromSidebar(organizationId);
    const canManage = hasRequiredOrganizationRole(normalizeOrganizationRole(rawRole), 'ADMIN');
    const [open, setOpen] = useState(false);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [emailGroups, setEmailGroups] = useState<NotificationGroupOption[]>([]);
    const [whatsappGroups, setWhatsappGroups] = useState<NotificationGroupOption[]>([]);

    const form = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            enabled: false,
            alertChannelEmail: false,
            alertChannelWhatsapp: false,
            alertEmailGroupIds: [],
            alertWhatsappGroupIds: [],
            currency: 'BRL',
        },
    });
    const enabled = useWatch({ control: form.control, name: 'enabled' });
    const watchedEmailChannel = useWatch({ control: form.control, name: 'alertChannelEmail' });
    const watchedWhatsappChannel = useWatch({ control: form.control, name: 'alertChannelWhatsapp' });

    const loadDialogData = useCallback(async () => {
        setLoadingGroups(true);
        try {
            const [emailRes, whatsappRes] = await Promise.all([
                fetchNotificationGroups(organizationId, 'email', { limit: 100 }),
                fetchNotificationGroups(organizationId, 'whatsapp', { limit: 100 }),
            ]);
            const emailBody = await emailRes.json().catch(() => null);
            const whatsappBody = await whatsappRes.json().catch(() => null);
            const emails = emailRes.ok ? parseGroups(emailBody) : [];
            const whatsapps = whatsappRes.ok ? parseGroups(whatsappBody) : [];
            setEmailGroups(emails);
            setWhatsappGroups(whatsapps);
            form.reset(settingsToForm(delivery, emails, whatsapps, sourceCurrency, canConvert));
        } catch {
            toast.error(t.alertsLoadError);
        } finally {
            setLoadingGroups(false);
        }
    }, [canConvert, delivery, form, organizationId, sourceCurrency, t.alertsLoadError]);

    const onSubmit = async (data: FormData) => {
        if (!canManage) return;
        const channels: Array<'email' | 'whatsapp'> = [];
        if (data.alertChannelEmail) channels.push('email');
        if (data.alertChannelWhatsapp) channels.push('whatsapp');
        const response = await saveCommercialDelivery(organizationId, {
            enabled: data.enabled,
            alertChannels: channels,
            alertNotificationGroupIds: [
                ...(data.alertChannelEmail ? data.alertEmailGroupIds : []),
                ...(data.alertChannelWhatsapp ? data.alertWhatsappGroupIds : []),
            ],
            currency: data.currency,
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            toast.error(extractErrorMessage(body));
            return;
        }
        setOpen(false);
        toast.success(data.enabled ? t.alertsEnabledToast : t.alertsDisabledToast);
        await onSaved();
    };

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                    setOpen(true);
                    void loadDialogData();
                }}
            >
                <Bell className="size-4" />
                {t.commercialAlertsButton}
                <span
                    className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
                        delivery?.enabled
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground',
                    )}
                >
                    {delivery?.enabled ? t.alertsOn : t.alertsOff}
                </span>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent showCloseButton className="flex max-h-[min(90vh,720px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
                    <DialogHeader className="shrink-0 border-b px-4 py-4">
                        <DialogTitle>{t.commercialAlertsDialogTitle}</DialogTitle>
                        <DialogDescription>
                            {t.commercialAlertsDialogDesc}{' '}
                            <Link href="/tenant/notifications">{t.notificationsLink}</Link>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                        <Form {...form}>
                            <form id="commercial-delivery-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                                <FormField
                                    control={form.control}
                                    name="enabled"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-start gap-3 rounded-lg border px-3 py-3">
                                            <FormControl>
                                                <Checkbox
                                                    className="mt-0.5"
                                                    checked={field.value}
                                                    disabled={!canManage}
                                                    onCheckedChange={(checked) => field.onChange(checked === true)}
                                                />
                                            </FormControl>
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-sm font-medium">{t.commercialAlertsEnable}</FormLabel>
                                                <p className="text-xs text-muted-foreground">{canManage ? t.commercialAlertsHint : t.alertsAdminOnly}</p>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="currency"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.commercialCurrencyLabel}</FormLabel>
                                            <div className="flex h-8 w-fit overflow-hidden rounded-lg border">
                                                {(['BRL', 'USD'] as const).map((option) => (
                                                    <button
                                                        key={option}
                                                        type="button"
                                                        className={cn(
                                                            'px-3 text-sm',
                                                            option === 'USD' && 'border-l',
                                                            field.value === option ? 'bg-primary text-primary-foreground' : 'bg-background',
                                                        )}
                                                        disabled={!canManage || (!canConvert && option !== sourceCurrency)}
                                                        onClick={() => field.onChange(option)}
                                                    >
                                                        {option === 'BRL' ? t.commercialCurrencyBrl : t.commercialCurrencyUsd}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-xs text-muted-foreground">{t.commercialAlertsCurrencyHint}</p>
                                        </FormItem>
                                    )}
                                />
                                {enabled ? (
                                    <>
                                        <Separator />
                                        <div className="space-y-3">
                                            <p className="text-sm font-medium">{t.channelsLabel}</p>
                                            <div className="flex flex-wrap gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="alertChannelEmail"
                                                    render={({ field }) => (
                                                        <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                                            <FormControl>
                                                                <Checkbox checked={field.value} disabled={!canManage} onCheckedChange={(checked) => field.onChange(checked === true)} />
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
                                                                <Checkbox checked={field.value} disabled={!canManage} onCheckedChange={(checked) => field.onChange(checked === true)} />
                                                            </FormControl>
                                                            <FormLabel className="font-normal">WhatsApp</FormLabel>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <FormMessage>{form.formState.errors.alertChannelEmail?.message}</FormMessage>
                                        </div>
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
                                                            disabled={!canManage}
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
                                                            disabled={!canManage}
                                                            t={t}
                                                        />
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        ) : null}
                                    </>
                                ) : null}
                            </form>
                        </Form>
                    </div>
                    <DialogFooter className="mx-0 mb-0 shrink-0">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            {tCommon.cancel}
                        </Button>
                        {canManage ? (
                            <Button type="submit" form="commercial-delivery-form" isLoading={form.formState.isSubmitting}>
                                {tCommon.save}
                            </Button>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
