'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Cloud, Layers, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ErrorMessages, extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import {
    canManageMembers,
    getAssignableInviteRoles,
    hasRequiredOrganizationRole,
    normalizeOrganizationRole,
    type OrganizationRole,
} from '@/lib/organization-rbac';
import { cn } from '@/lib/utils';

type Props = {
    organizationId: string;
    currentRole: OrganizationRole;
    onSuccess: () => void;
};

type OrganizationOption = {
    id: string;
    name: string;
    currentRole: OrganizationRole | null;
};

function normalizeOrganizations(payload: unknown): OrganizationOption[] {
    const items = Array.isArray(payload)
        ? payload
        : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
          ? (payload as { items: unknown[] }).items
          : [];

    return items
        .map((item) => {
            if (typeof item !== 'object' || item === null) return null;
            const id = (item as { id?: unknown }).id;
            const name = (item as { name?: unknown }).name;
            if (typeof id !== 'string' || typeof name !== 'string') return null;
            return {
                id,
                name,
                currentRole: normalizeOrganizationRole((item as { currentRole?: unknown }).currentRole as string | null),
            };
        })
        .filter((item): item is OrganizationOption => item !== null);
}

export function InviteMemberDialog({ organizationId, currentRole, onSuccess }: Props) {
    const [open, setOpen] = useState(false);
    const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
    const [loadingOrganizations, setLoadingOrganizations] = useState(false);
    const t = useTranslations('members');
    const tc = useTranslations('common');
    const router = useRouter();

    const isTenantAdmin = canManageMembers(currentRole);

    const invitableOrganizations = useMemo(() => {
        if (isTenantAdmin) return organizations;
        return organizations.filter((org) => hasRequiredOrganizationRole(org.currentRole, 'ADMIN'));
    }, [isTenantAdmin, organizations]);

    const effectiveInviteRole = useMemo<OrganizationRole | null>(() => {
        if (isTenantAdmin) return currentRole;
        if (invitableOrganizations.length === 0) return null;
        const levels: Record<OrganizationRole, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };
        let weakest: OrganizationRole | null = null;
        for (const org of invitableOrganizations) {
            if (!org.currentRole) continue;
            if (!weakest || levels[org.currentRole] < levels[weakest]) {
                weakest = org.currentRole;
            }
        }
        return weakest;
    }, [currentRole, invitableOrganizations, isTenantAdmin]);

    const assignableRoles = useMemo(
        () => getAssignableInviteRoles(effectiveInviteRole),
        [effectiveInviteRole],
    );

    const schema = useMemo(
        () =>
            z.object({
                email: z.string().email(t.inviteEmailInvalid),
                role: z.enum(['ADMIN', 'MEMBER', 'VIEWER'], { message: t.inviteRoleRequired }),
                organizationIds: z.array(z.string().uuid()).min(1, t.inviteOrganizationRequired),
            }),
        [t.inviteEmailInvalid, t.inviteOrganizationRequired, t.inviteRoleRequired],
    );
    type FormValues = z.infer<typeof schema>;

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { email: '', role: 'MEMBER', organizationIds: [] },
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        const loadOrganizations = async () => {
            setLoadingOrganizations(true);

            try {
                const response = await fetch(`/api/orgs?organizationId=${encodeURIComponent(organizationId)}`, {
                    cache: 'no-store',
                });
                const payload = await response.json().catch(() => null);

                if (!response.ok) {
                    toast.error(extractErrorMessage(payload));
                    setOrganizations([]);
                    return;
                }

                const nextOrganizations = normalizeOrganizations(payload);
                setOrganizations(nextOrganizations);

                const selectable = isTenantAdmin
                    ? nextOrganizations
                    : nextOrganizations.filter((org) => hasRequiredOrganizationRole(org.currentRole, 'ADMIN'));

                const selectedIds = form.getValues('organizationIds');
                if (selectedIds.length === 0 && selectable.length > 0) {
                    form.setValue('organizationIds', [selectable[0].id], { shouldValidate: true });
                } else if (selectedIds.length > 0) {
                    const allowed = new Set(selectable.map((org) => org.id));
                    form.setValue(
                        'organizationIds',
                        selectedIds.filter((id) => allowed.has(id)),
                        { shouldValidate: true },
                    );
                }
            } catch {
                toast.error(t.inviteLoadOrganizationsError);
                setOrganizations([]);
            } finally {
                setLoadingOrganizations(false);
            }
        };

        void loadOrganizations();
    }, [form, isTenantAdmin, open, organizationId, t.inviteLoadOrganizationsError]);

    useEffect(() => {
        if (assignableRoles.length === 0) return;
        const current = form.getValues('role');
        if (!assignableRoles.includes(current)) {
            form.setValue('role', assignableRoles[0], { shouldValidate: true });
        }
    }, [assignableRoles, form]);

    const onSubmit = form.handleSubmit(async (data) => {
        if (!assignableRoles.includes(data.role)) {
            toast.error(t.inviteError);
            return;
        }

        try {
            const response = await fetch(`/api/organization/${encodeURIComponent(organizationId)}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const body = await response.json().catch(() => null);

            if (!response.ok) {
                const isUserLimitError = typeof body?.message === 'string' && body.message === ErrorMessages.PLANS.USER_LIMIT_REACHED.en;

                if (isUserLimitError) {
                    toast.error(ErrorMessages.PLANS.USER_LIMIT_REACHED.pt, {
                        action: {
                            label: t.upgradePlan,
                            onClick: () => router.push('/billing'),
                        },
                        duration: 8000,
                    });
                } else {
                    toast.error(extractErrorMessage(body));
                }
                return;
            }

            toast.success(t.inviteSuccess);
            form.reset({ email: '', role: assignableRoles.includes('MEMBER') ? 'MEMBER' : assignableRoles[0], organizationIds: [] });
            setOrganizations([]);
            setOpen(false);
            onSuccess();
        } catch {
            toast.error(t.inviteError);
        }
    });

    const roleOptions = assignableRoles.map((role) => ({
        value: role,
        label: role === 'ADMIN' ? t.roleAdmin : role === 'MEMBER' ? t.roleMember : t.roleViewer,
    }));

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    {t.inviteButton}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t.inviteTitle}</DialogTitle>
                    <DialogDescription>{t.inviteDesc}</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={onSubmit} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.inviteEmailLabel}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t.inviteEmailPlaceholder} type="email" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.inviteRoleLabel}</FormLabel>
                                    <SearchableSelect
                                        mode="single"
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        options={roleOptions}
                                        disabled={roleOptions.length === 0}
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="organizationIds"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.inviteOrganizationsLabel}</FormLabel>
                                    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                                        <div className="flex items-start gap-2.5">
                                            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
                                                <Layers className="size-3.5 text-foreground" aria-hidden="true" />
                                            </div>
                                            <div className="min-w-0 space-y-1">
                                                <p className="text-xs font-medium tracking-wide text-foreground">{t.inviteAccessScopeTitle}</p>
                                                <p className="text-xs leading-relaxed text-muted-foreground">{t.inviteOrganizationsHint}</p>
                                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
                                                    <span className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 font-medium text-foreground">
                                                        <Layers className="size-3" aria-hidden="true" />
                                                        {t.inviteOrgBadge}
                                                    </span>
                                                    <span aria-hidden="true">→</span>
                                                    <span className="inline-flex items-center gap-1 rounded-md border border-dashed bg-background/60 px-1.5 py-0.5">
                                                        <Cloud className="size-3" aria-hidden="true" />
                                                        {t.inviteCloudAccountsNote}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-md border">
                                        {loadingOrganizations ? (
                                            <p className="p-3 text-sm text-muted-foreground">{tc.loading}</p>
                                        ) : invitableOrganizations.length === 0 ? (
                                            <p className="p-3 text-sm text-muted-foreground">{t.inviteNoOrganizations}</p>
                                        ) : (
                                            <div className="divide-y">
                                                {invitableOrganizations.map((org) => {
                                                    const checked = field.value.includes(org.id);

                                                    return (
                                                        <label
                                                            key={org.id}
                                                            className={cn(
                                                                'flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors duration-150',
                                                                checked ? 'bg-primary/5' : 'hover:bg-muted/40'
                                                            )}
                                                        >
                                                            <Checkbox
                                                                className="mt-1"
                                                                checked={checked}
                                                                onCheckedChange={(nextChecked) => {
                                                                    if (nextChecked) {
                                                                        field.onChange([...field.value, org.id]);
                                                                        return;
                                                                    }

                                                                    field.onChange(field.value.filter((selectedId) => selectedId !== org.id));
                                                                }}
                                                            />
                                                            <div className="flex min-w-0 flex-1 items-start gap-2.5">
                                                                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
                                                                    <Layers className="size-3.5" aria-hidden="true" />
                                                                </div>
                                                                <div className="min-w-0 space-y-0.5">
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <span className="truncate text-sm font-medium">{org.name}</span>
                                                                        <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                                            {t.inviteOrgBadge}
                                                                        </span>
                                                                    </div>
                                                                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                                                        <Cloud className="size-3 shrink-0" aria-hidden="true" />
                                                                        <span className="truncate">{t.inviteCloudAccountsNote}</span>
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                {tc.cancel}
                            </Button>
                            <Button
                                type="submit"
                                isLoading={form.formState.isSubmitting}
                                disabled={assignableRoles.length === 0 || invitableOrganizations.length === 0}
                            >
                                {t.sendInvite}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
