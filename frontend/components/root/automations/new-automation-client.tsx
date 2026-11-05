'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY, getActiveMidOrgId } from '@/lib/sidebar-context';
import { useTranslations } from '@/lib/i18n';
import { createAutomation, type AutomationCloudProvider } from '@/app/actions/automations';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';

function createSchema(nameRequired: string) {
    return z.object({
        name: z.string().min(1, nameRequired),
        description: z.string(),
    });
}

type FormValues = z.infer<ReturnType<typeof createSchema>>;

function getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

function getCloudAccountId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('smc_active_cloud_account_id');
}

function normalizeCloudProvider(provider: string | null | undefined): AutomationCloudProvider {
    const value = (provider ?? '').trim().toUpperCase();
    if (value === 'GCP') return 'GCP';
    if (value === 'AZURE') return 'AZURE';
    return 'AWS';
}

export function NewAutomationClient() {
    const t = useTranslations('automation');
    const tc = useTranslations('common');
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [cloudAccount, setCloudAccount] = useState<OrganizationCloudAccount | null>(null);
    const schema = useMemo(() => createSchema(t.nameRequired), [t.nameRequired]);
    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', description: '' },
    });

    useEffect(() => {
        const orgId = getOrgId();
        const cloudAccountId = getCloudAccountId();
        if (!orgId || !cloudAccountId) return;
        void fetchOrganizationCloudAccounts(orgId, { midOrgId: getActiveMidOrgId(orgId) })
            .then(async (response) => {
                if (!response.ok) return;
                const payload = await response.json();
                const items = Array.isArray(payload) ? payload : (payload as { items?: OrganizationCloudAccount[] }).items ?? [];
                const active = items.find((item) => item.id === cloudAccountId) ?? items[0] ?? null;
                setCloudAccount(active);
            })
            .catch(() => undefined);
    }, []);

    async function onSubmit(data: FormValues) {
        const orgId = getOrgId();
        const cloudAccountId = cloudAccount?.id ?? getCloudAccountId();

        if (!orgId) {
            toast.error(t.selectOrgFirst);
            return;
        }
        if (!cloudAccountId) {
            toast.error(t.selectAccountFirst);
            return;
        }

        setLoading(true);
        try {
            const cloudProvider = normalizeCloudProvider(cloudAccount?.provider);
            const response = await createAutomation(orgId, {
                name: data.name,
                description: data.description || undefined,
                cloudAccountId,
                cloudProvider,
            });
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never));
                return;
            }
            const created = body as { id: string };
            toast.success(t.created);
            router.push(`/automations/${created.id}`);
        } catch {
            toast.error(t.createError);
        } finally {
            setLoading(false);
        }
    }

    const providerLabel = cloudAccount ? normalizeCloudProvider(cloudAccount.provider) : '—';

    return (
        <div className="mx-auto max-w-lg space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold">{t.newAutomation}</h1>
                <p className="text-sm text-muted-foreground">
                    {t.newAutomationDesc.replace('{provider}', providerLabel)}
                </p>
            </div>
            <div className="rounded-xl border p-4">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{tc.name}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.descriptionLabel}</FormLabel>
                                    <FormControl>
                                        <Textarea rows={3} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="flex justify-end">
                            <Button type="submit" isLoading={loading} loadingText={t.saving}>
                                {tc.save}
                            </Button>
                        </div>
                    </form>
                </Form>
            </div>
        </div>
    );
}
