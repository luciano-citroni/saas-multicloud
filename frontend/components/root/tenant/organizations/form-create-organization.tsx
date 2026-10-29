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
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';
import {
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgStorageKey,
    notifySidebarContextUpdated,
} from '@/lib/sidebar-context';

type CreatedOrganization = {
    id?: string;
    name?: string;
};

const schema = z.object({
    name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres').max(100, 'Nome deve ter no máximo 100 caracteres'),
});

type FormValues = z.infer<typeof schema>;

export function FormCreateOrganization() {
    const router = useRouter();
    const sidebarQuery = useSidebarContext();
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [storageReady, setStorageReady] = useState(false);
    const [createdName, setCreatedName] = useState('');

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
            toast.error('Não foi possível validar as permissões.');
            router.replace('/');
            return;
        }

        if (!activeTenant) {
            return;
        }

        if (!canCreate) {
            toast.error('Você não tem permissão para criar uma organização.');
            router.replace('/');
        }
    }, [activeTenant, canCreate, router, sidebarQuery.data, sidebarQuery.isError, sidebarQuery.isFetched, sidebarQuery.isLoading, storageReady]);

    const onSubmit = form.handleSubmit(async (data) => {
        if (!activeTenant) {
            toast.error('Selecione um tenant antes de criar a organização.');
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
                toast.error(extractErrorMessage(payload, 'pt'));
                return;
            }

            const createdId = typeof payload?.id === 'string' ? payload.id : null;
            const name = data.name;

            if (createdId) {
                window.localStorage.setItem(getActiveMidOrgStorageKey(activeTenant.id), createdId);
            }

            notifySidebarContextUpdated();
            setCreatedName(name);
            toast.success('Organização criada com sucesso.');
        } catch {
            toast.error('Não foi possível criar a organização.');
        }
    });

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
                <p className="text-sm text-muted-foreground">Selecione ou crie um tenant antes de criar uma organização.</p>
                <Button asChild className="w-fit">
                    <Link href="/tenant/new">Criar tenant</Link>
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
                    <h2 className="text-xl font-semibold">Organização criada</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        <strong>{createdName}</strong> já está ativa no seletor da barra lateral.
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="outline" onClick={() => router.push('/tenant/organizations')}>
                        Ver organizações
                    </Button>
                    <Button
                        onClick={() => {
                            router.replace('/');
                            router.refresh();
                        }}
                    >
                        Ir para o dashboard
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
                                Nome da organização <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                                <IconInput placeholder="Ex: Produção, Homologação, Dev..." StartIcon={Layers} autoFocus {...field} />
                            </FormControl>
                            <FormDescription>
                                Será criada dentro de <strong>{activeTenant.name}</strong> e aparece no seletor da barra lateral.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex items-center justify-between pt-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                    <Button type="submit" isLoading={form.formState.isSubmitting}>
                        Criar organização
                    </Button>
                </div>
            </form>
        </Form>
    );
}
