'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Layers } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';
import {
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgStorageKey,
    notifyActiveMidOrgChanged,
    notifySidebarContextUpdated,
} from '@/lib/sidebar-context';

type CreatedOrganization = {
    id?: string;
    name?: string;
};

function createSchema(t: { nameMin: string; nameMax: string }) {
    return z.object({
        name: z.string().trim().min(2, t.nameMin).max(100, t.nameMax),
    });
}

type FormValues = z.infer<ReturnType<typeof createSchema>>;

export function FormCreateOrganization() {
    const router = useRouter();
    const t = useTranslations('organizations');
    const tc = useTranslations('common');
    const sidebarQuery = useSidebarContext();
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [storageReady, setStorageReady] = useState(false);
    const [createdName, setCreatedName] = useState('');

    const schema = useMemo(() => createSchema(t), [t]);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: '' },
    });

    useEffect(() => {
        setTenantId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        setStorageReady(true);
    }, []);

    const activeTenant = useMemo(() => {
        const organizations = sidebarQuery.data?.organizations ?? [];
        const resolvedId = tenantId && organizations.some((organization) => organization.id === tenantId) ? tenantId : organizations[0]?.id;
        return organizations.find((organization) => organization.id === resolvedId) ?? null;
    }, [sidebarQuery.data?.organizations, tenantId]);

    const role = normalizeOrganizationRole(activeTenant?.currentRole ?? null);
    const canCreate = hasRequiredOrganizationRole(role, 'MEMBER');

    useEffect(() => {
        if (!storageReady || !sidebarQuery.isFetched || sidebarQuery.isLoading) {
            return;
        }

        if (sidebarQuery.isError || !sidebarQuery.data) {
            toast.error(t.validatePermissionsError);
            router.replace('/');
            return;
        }

        if (!activeTenant) {
            return;
        }

        if (!canCreate) {
            toast.error(t.createNoPermission);
            router.replace('/');
        }
    }, [activeTenant, canCreate, router, sidebarQuery.data, sidebarQuery.isError, sidebarQuery.isFetched, sidebarQuery.isLoading, storageReady, t.createNoPermission, t.validatePermissionsError]);

    const onSubmit = form.handleSubmit(async (data) => {
        if (!activeTenant) {
            toast.error(t.selectTenantFirst);
            return;
        }

        try {
            const response = await fetch(`/api/orgs?organizationId=${encodeURIComponent(activeTenant.id)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: data.name }),
            });
            const payload = (await response.json().catch(() => null)) as CreatedOrganization | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }

            const createdId = typeof payload?.id === 'string' ? payload.id : null;
            const name = data.name;

            if (createdId) {
                window.localStorage.setItem(getActiveMidOrgStorageKey(activeTenant.id), createdId);
                notifyActiveMidOrgChanged();
            }

            notifySidebarContextUpdated();
            setCreatedName(name);
            toast.success(t.createSuccess);
        } catch {
            toast.error(t.createError);
        }
    });

    const [createdActiveBefore, createdActiveAfter = ''] = t.createdActiveDesc.split('{name}');
    const [createInTenantBefore, createInTenantAfter = ''] = t.createInTenantDesc.split('{name}');

    if (!storageReady || !sidebarQuery.isFetched || sidebarQuery.isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-9 w-40" />
            </div>
        );
    }

    if (!activeTenant) {
        return (
            <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">{t.selectOrCreateTenant}</p>
                <Button asChild className="w-fit">
                    <Link href="/tenant/new">{t.createTenantAction}</Link>
                </Button>
            </div>
        );
    }

    if (!canCreate) {
        return null;
    }

    if (createdName) {
        return (
            <div className="flex flex-col items-center justify-center gap-6 py-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold">{t.createdTitle}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {createdActiveBefore}
                        <strong>{createdName}</strong>
                        {createdActiveAfter}
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="outline" onClick={() => router.push('/tenant/organizations')}>
                        {t.viewOrgs}
                    </Button>
                    <Button
                        onClick={() => {
                            router.replace('/');
                            router.refresh();
                        }}
                    >
                        {t.goToDashboard}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-6">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                {t.orgNameLabel} <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                                <IconInput placeholder={t.orgNameExample} StartIcon={Layers} autoFocus {...field} />
                            </FormControl>
                            <FormDescription>
                                {createInTenantBefore}
                                <strong>{activeTenant.name}</strong>
                                {createInTenantAfter}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex items-center justify-between pt-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {tc.back}
                    </Button>
                    <Button type="submit" isLoading={form.formState.isSubmitting}>
                        {t.createOrg}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
