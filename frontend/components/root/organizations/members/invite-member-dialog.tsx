'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorMessages, extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';

type Props = {
    organizationId: string;
    onSuccess: () => void;
};

type OrganizationOption = {
    id: string;
    name: string;
};

function normalizeOrganizations(payload: unknown): OrganizationOption[] {
    if (!Array.isArray(payload)) {
        return [];
    }

    return payload.filter(
        (item): item is OrganizationOption =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { id?: unknown }).id === 'string' &&
            typeof (item as { name?: unknown }).name === 'string'
    );
}

export function InviteMemberDialog({ organizationId, onSuccess }: Props) {
    const [open, setOpen] = useState(false);
    const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
    const [loadingOrganizations, setLoadingOrganizations] = useState(false);
    const t = useTranslations('members');
    const tc = useTranslations('common');
    const router = useRouter();

    const schema = z.object({
        email: z.string().email(t.inviteEmailInvalid),
        role: z.enum(['ADMIN', 'MEMBER', 'VIEWER'], { message: t.inviteRoleRequired }),
        organizationIds: z.array(z.string().uuid()).min(1, t.inviteOrganizationRequired),
    });
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

                const selectedIds = form.getValues('organizationIds');
                if (selectedIds.length === 0 && nextOrganizations.length > 0) {
                    form.setValue('organizationIds', [nextOrganizations[0].id], { shouldValidate: true });
                }
            } catch {
                toast.error(t.inviteLoadOrganizationsError);
                setOrganizations([]);
            } finally {
                setLoadingOrganizations(false);
            }
        };

        void loadOrganizations();
    }, [form, open, organizationId, t.inviteLoadOrganizationsError]);

    const onSubmit = form.handleSubmit(async (data) => {
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
            form.reset();
            setOrganizations([]);
            setOpen(false);
            onSuccess();
        } catch {
            toast.error(t.inviteError);
        }
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    {t.inviteButton}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
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
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="ADMIN">{t.roleAdmin}</SelectItem>
                                            <SelectItem value="MEMBER">{t.roleMember}</SelectItem>
                                            <SelectItem value="VIEWER">{t.roleViewer}</SelectItem>
                                        </SelectContent>
                                    </Select>
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
                                    <div className="rounded-md border p-3">
                                        {loadingOrganizations ? (
                                            <p className="text-sm text-muted-foreground">{tc.loading}</p>
                                        ) : organizations.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">{t.inviteNoOrganizations}</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {organizations.map((org) => {
                                                    const checked = field.value.includes(org.id);

                                                    return (
                                                        <label key={org.id} className="flex items-center gap-2 text-sm">
                                                            <Checkbox
                                                                checked={checked}
                                                                onCheckedChange={(nextChecked) => {
                                                                    if (nextChecked) {
                                                                        field.onChange([...field.value, org.id]);
                                                                        return;
                                                                    }

                                                                    field.onChange(field.value.filter((selectedId) => selectedId !== org.id));
                                                                }}
                                                            />
                                                            <span>{org.name}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">{t.inviteOrganizationsHint}</p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                {tc.cancel}
                            </Button>
                            <Button type="submit" isLoading={form.formState.isSubmitting}>
                                {t.sendInvite}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
