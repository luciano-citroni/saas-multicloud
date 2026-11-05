'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
    fetchFinopsAnomalyAlertSettings,
    updateFinopsAnomalyAlertSettings,
    type FinopsAnomalyAlertSettings,
} from '@/app/actions/finops';
import { fetchNotificationGroups } from '@/app/actions/notifications';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import { cn } from '@/lib/utils';
import { useTranslations, type Translations } from '@/lib/i18n';

type NotificationGroupOption = {
    id: string;
    name: string;
    channel: 'email' | 'whatsapp';
    isActive: boolean;
};

type FinopsT = Record<keyof Translations['finops'], string>;

function createSchema(t: FinopsT) {
    return z
        .object({
            enabled: z.boolean(),
            alertChannelEmail: z.boolean(),
            alertChannelWhatsapp: z.boolean(),
            alertEmailGroupIds: z.array(z.string().uuid()),
            alertWhatsappGroupIds: z.array(z.string().uuid()),
            minSeverity: z.enum(['low', 'medium', 'high', 'critical']),
        })
        .superRefine((data, ctx) => {
            if (!data.enabled) return;
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

type FormData = z.infer<ReturnType<typeof createSchema>>;

function severityNoteLabel(t: FinopsT, severity: FormData['minSeverity']): string {
    switch (severity) {
        case 'critical':
            return t.severityCritical.toLowerCase();
        case 'high':
            return t.severityHigh.toLowerCase();
        case 'medium':
            return t.severityMedium.toLowerCase();
        default:
            return t.alertsMinSeverityAll.toLowerCase();
    }
}

function parseGroups(payload: unknown): NotificationGroupOption[] {
    const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown } | null)?.items)
          ? ((payload as { items: unknown[] }).items)
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
        .filter((g): g is NotificationGroupOption => g != null && g.isActive);
}

function settingsToForm(
    settings: FinopsAnomalyAlertSettings,
    emailGroups: NotificationGroupOption[],
    whatsappGroups: NotificationGroupOption[],
): FormData {
    const emailIds = new Set(emailGroups.map((g) => g.id));
    const whatsappIds = new Set(whatsappGroups.map((g) => g.id));
    const groupIds = settings.alertNotificationGroupIds ?? [];
    const channels = settings.alertChannels ?? [];

    return {
        enabled: settings.enabled,
        alertChannelEmail: channels.includes('email'),
        alertChannelWhatsapp: channels.includes('whatsapp'),
        alertEmailGroupIds: groupIds.filter((id) => emailIds.has(id)),
        alertWhatsappGroupIds: groupIds.filter((id) => whatsappIds.has(id)),
        minSeverity: settings.minSeverity ?? 'high',
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

type FinopsAnomalyAlertsCardProps = {
    organizationId: string;
};

export function FinopsAnomalyAlertsCard({ organizationId }: FinopsAnomalyAlertsCardProps) {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');
    const schema = useMemo(() => createSchema(t), [t]);
    const { currentRole: rawRole } = useOrganizationFromSidebar(organizationId);
    const currentRole = normalizeOrganizationRole(rawRole);
    const canManage = hasRequiredOrganizationRole(currentRole, 'ADMIN');

    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [alertsEnabled, setAlertsEnabled] = useState(false);
    const [statusReady, setStatusReady] = useState(false);
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
            minSeverity: 'high',
        },
    });

    const enabled = useWatch({ control: form.control, name: 'enabled' });
    const watchedEmailChannel = useWatch({ control: form.control, name: 'alertChannelEmail' });
    const watchedWhatsappChannel = useWatch({ control: form.control, name: 'alertChannelWhatsapp' });

    const loadStatus = useCallback(async () => {
        try {
            const settingsRes = await fetchFinopsAnomalyAlertSettings(organizationId);
            const settingsBody = await settingsRes.json().catch(() => null);
            if (!settingsRes.ok) return;
            const settings = settingsBody as FinopsAnomalyAlertSettings;
            setAlertsEnabled(Boolean(settings.enabled));
            setStatusReady(true);
        } catch {
            // Status do botão é best-effort; o dialog carrega de novo ao abrir.
        }
    }, [organizationId]);

    const loadDialogData = useCallback(async () => {
        setLoading(true);
        setLoadingGroups(true);
        try {
            const [settingsRes, emailRes, whatsappRes] = await Promise.all([
                fetchFinopsAnomalyAlertSettings(organizationId),
                fetchNotificationGroups(organizationId, 'email', { limit: 100 }),
                fetchNotificationGroups(organizationId, 'whatsapp', { limit: 100 }),
            ]);

            const settingsBody = await settingsRes.json().catch(() => null);
            const emailBody = await emailRes.json().catch(() => null);
            const whatsappBody = await whatsappRes.json().catch(() => null);

            const emails = emailRes.ok ? parseGroups(emailBody) : [];
            const whatsapps = whatsappRes.ok ? parseGroups(whatsappBody) : [];
            setEmailGroups(emails);
            setWhatsappGroups(whatsapps);

            if (!settingsRes.ok) {
                toast.error(extractErrorMessage(settingsBody));
                return;
            }

            const settings = settingsBody as FinopsAnomalyAlertSettings;
            setAlertsEnabled(Boolean(settings.enabled));
            setStatusReady(true);
            form.reset(settingsToForm(settings, emails, whatsapps));
        } catch {
            toast.error(t.alertsLoadError);
        } finally {
            setLoading(false);
            setLoadingGroups(false);
        }
    }, [organizationId, form, t]);

    useEffect(() => {
        setStatusReady(false);
        void loadStatus();
    }, [loadStatus]);

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (next) void loadDialogData();
    };

    const onSubmit = async (data: FormData) => {
        if (!canManage) return;

        const channels: Array<'email' | 'whatsapp'> = [];
        if (data.alertChannelEmail) channels.push('email');
        if (data.alertChannelWhatsapp) channels.push('whatsapp');

        const response = await updateFinopsAnomalyAlertSettings(organizationId, {
            enabled: data.enabled,
            alertChannels: channels,
            alertNotificationGroupIds: [
                ...(data.alertChannelEmail ? data.alertEmailGroupIds : []),
                ...(data.alertChannelWhatsapp ? data.alertWhatsappGroupIds : []),
            ],
            minSeverity: data.minSeverity,
        });

        const body = await response.json().catch(() => null);
        if (!response.ok) {
            toast.error(extractErrorMessage(body));
            return;
        }

        const saved = body as FinopsAnomalyAlertSettings;
        form.reset(settingsToForm(saved, emailGroups, whatsappGroups));
        setAlertsEnabled(Boolean(saved.enabled));
        setOpen(false);
        toast.success(saved.enabled ? t.alertsEnabledToast : t.alertsDisabledToast);
    };

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(true)}
                className="gap-2"
            >
                <Bell className="size-4" />
                {t.alertsButton}
                {statusReady ? (
                    <span
                        className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
                            alertsEnabled
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground',
                        )}
                    >
                        {alertsEnabled ? t.alertsOn : t.alertsOff}
                    </span>
                ) : null}
            </Button>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent
                    showCloseButton
                    className="flex max-h-[min(90vh,720px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
                >
                    <DialogHeader className="shrink-0 border-b px-4 py-4">
                        <DialogTitle>{t.alertsDialogTitle}</DialogTitle>
                        <DialogDescription>
                            {t.alertsDialogDescPrefix}{' '}
                            <Link href="/tenant/notifications">{t.notificationsLink}</Link>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                        {loading ? (
                            <p className="text-sm text-muted-foreground">{t.alertsLoadingPrefs}</p>
                        ) : (
                            <Form {...form}>
                                <form
                                    id="anomaly-alerts-form"
                                    onSubmit={form.handleSubmit(onSubmit)}
                                    className="space-y-5"
                                >
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
                                                        onCheckedChange={(checked) =>
                                                            field.onChange(checked === true)
                                                        }
                                                    />
                                                </FormControl>
                                                <div className="space-y-0.5">
                                                    <FormLabel className="text-sm font-medium">
                                                        {t.alertsEnableDigest}
                                                    </FormLabel>
                                                    <p className="text-xs text-muted-foreground">
                                                        {canManage ? t.alertsDigestHint : t.alertsAdminOnly}
                                                    </p>
                                                </div>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="minSeverity"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.alertsMinSeverityLabel}</FormLabel>
                                                <Select
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    disabled={!canManage || !enabled}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="critical">{t.alertsMinSeverityCritical}</SelectItem>
                                                        <SelectItem value="high">{t.alertsMinSeverityHigh}</SelectItem>
                                                        <SelectItem value="medium">{t.alertsMinSeverityMedium}</SelectItem>
                                                        <SelectItem value="low">{t.alertsMinSeverityAll}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground">
                                                    {t.alertsSeverityNote.replace(
                                                        '{severity}',
                                                        severityNoteLabel(t, field.value),
                                                    )}
                                                </p>
                                                <FormMessage />
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
                                                                    <Checkbox
                                                                        checked={field.value}
                                                                        disabled={!canManage}
                                                                        onCheckedChange={(checked) =>
                                                                            field.onChange(checked === true)
                                                                        }
                                                                    />
                                                                </FormControl>
                                                                <FormLabel className="font-normal">
                                                                    {tCommon.email}
                                                                </FormLabel>
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
                                                                        disabled={!canManage}
                                                                        onCheckedChange={(checked) =>
                                                                            field.onChange(checked === true)
                                                                        }
                                                                    />
                                                                </FormControl>
                                                                <FormLabel className="font-normal">
                                                                    WhatsApp
                                                                </FormLabel>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <FormMessage>
                                                    {form.formState.errors.alertChannelEmail?.message}
                                                </FormMessage>
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
                        )}
                    </div>

                    <DialogFooter className="mx-0 mb-0 shrink-0">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            {tCommon.cancel}
                        </Button>
                        {canManage ? (
                            <Button
                                type="submit"
                                form="anomaly-alerts-form"
                                isLoading={form.formState.isSubmitting}
                                disabled={loading}
                            >
                                {tCommon.save}
                            </Button>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
