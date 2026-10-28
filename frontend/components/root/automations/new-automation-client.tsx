'use client';

import { useEffect, useState } from 'react';
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
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { createAutomation, type AutomationCloudProvider } from '@/app/actions/automations';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';

const schema = z.object({
    name: z.string().min(1, 'Nome é obrigatório'),
    description: z.string(),
});

type FormValues = z.infer<typeof schema>;

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
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [cloudAccount, setCloudAccount] = useState<OrganizationCloudAccount | null>(null);
    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', description: '' },
    });

    useEffect(() => {
        const orgId = getOrgId();
        const cloudAccountId = getCloudAccountId();
        if (!orgId || !cloudAccountId) return;
        void fetchOrganizationCloudAccounts(orgId)
            .then(async (response) => {
                if (!response.ok) return;
                const payload = await response.json();
                const items = Array.isArray(payload) ? payload : (payload as { items?: OrganizationCloudAccount[] }).items ?? [];
                const active = items.find((item) => item.id === cloudAccountId) ?? null;
                setCloudAccount(active);
            })
            .catch(() => undefined);
    }, []);

    async function onSubmit(data: FormValues) {
        const orgId = getOrgId();
        const cloudAccountId = getCloudAccountId();

        if (!orgId) {
            toast.error('Selecione uma organização');
            return;
        }
        if (!cloudAccountId) {
            toast.error('Selecione uma conta cloud');
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
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            const created = body as { id: string };
            toast.success('Automação criada');
            router.push(`/automations/${created.id}`);
        } catch {
            toast.error('Falha ao criar automação');
        } finally {
            setLoading(false);
        }
    }

    const providerLabel = cloudAccount ? normalizeCloudProvider(cloudAccount.provider) : '—';

    return (
        <div className="mx-auto max-w-lg space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold">Nova automação</h1>
                <p className="text-sm text-muted-foreground">
                    Crie um fluxo de provisionamento multi-cloud. Provedor da conta ativa: {providerLabel}
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
                                    <FormLabel>Nome</FormLabel>
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
                                    <FormLabel>Descrição</FormLabel>
                                    <FormControl>
                                        <Textarea rows={3} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="flex justify-end">
                            <Button type="submit" isLoading={loading} loadingText="Salvando...">
                                Salvar
                            </Button>
                        </div>
                    </form>
                </Form>
            </div>
        </div>
    );
}
