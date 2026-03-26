'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { Building2, IdCardLanyard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    deleteUserOrganization,
    fetchUserOrganizationById,
    leaveUserOrganization,
    updateUserOrganization,
    type UserOrganization,
} from '@/app/actions/organization';
import { organizationFormScheme } from '@/components/root/organizations/new/scheme';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY, notifySidebarContextUpdated } from '@/lib/sidebar-context';
import { formatCNPJ } from '@/lib/validators/cnpj';
import { type OrganizationRole } from '@/lib/organization-rbac';
import { OrganizationEditActions } from '@/components/root/organizations/edit/organization-edit-actions';

type FormValues = z.infer<typeof organizationFormScheme>;

type ApiErrorPayload = {
    message?: string | string[];
    statusCode?: number;
    error?: string;
    path?: string;
    timestamp?: string;
};

function normalizeOrganization(payload: unknown): UserOrganization | null {
    if (typeof payload !== 'object' || payload === null) {
        return null;
    }

    const organization = payload as UserOrganization;

    if (typeof organization.id !== 'string' || typeof organization.name !== 'string') {
        return null;
    }

    return organization;
}

type Props = {
    organizationId: string;
    currentRole: OrganizationRole;
};

export function FormOrganizationEdit({ organizationId, currentRole }: Props) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingOrganization, setIsLoadingOrganization] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(organizationFormScheme),
        defaultValues: {
            name: '',
            cnpj: '',
        },
    });

    useEffect(() => {
        const loadOrganization = async () => {
            setIsLoadingOrganization(true);

            try {
                const response = await fetchUserOrganizationById(organizationId);
                const payload = (await response.json().catch(() => null)) as unknown;

                if (!response.ok) {
                    toast.error(extractErrorMessage(payload, 'pt'));
                    router.replace('/organizations');
                    return;
                }

                const organization = normalizeOrganization(payload);

                if (!organization) {
                    toast.error('Não foi possível carregar os dados da organização.');
                    router.replace('/organizations');
                    return;
                }

                form.reset({
                    name: organization.name,
                    cnpj: organization.cnpj ?? '',
                });
            } catch {
                toast.error('Não foi possível carregar os dados da organização.');
                router.replace('/organizations');
            } finally {
                setIsLoadingOrganization(false);
            }
        };

        void loadOrganization();
    }, [form, organizationId, router]);

    const onSubmit = form.handleSubmit(async (data) => {
        setIsLoading(true);

        try {
            const response = await updateUserOrganization(organizationId, {
                name: data.name.trim(),
                cnpj: data.cnpj?.trim() || undefined,
            });
            const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                return;
            }

            notifySidebarContextUpdated();
            toast.success('Organização atualizada com sucesso.');
            router.replace('/organizations');
            router.refresh();
        } catch {
            toast.error('Não foi possível atualizar a organização.');
        } finally {
            setIsLoading(false);
        }
    });

    const onDeleteOrganization = async (): Promise<boolean> => {
        setIsDeleting(true);

        try {
            const response = await deleteUserOrganization(organizationId);
            const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                return false;
            }

            if (window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) === organizationId) {
                window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
            }

            notifySidebarContextUpdated();
            toast.success('Organização excluída com sucesso.');
            router.replace('/organizations');
            router.refresh();
            return true;
        } catch {
            toast.error('Não foi possível excluir a organização.');
            return false;
        } finally {
            setIsDeleting(false);
        }
    };

    const onLeaveOrganization = async (): Promise<boolean> => {
        setIsLeaving(true);

        try {
            const response = await leaveUserOrganization(organizationId);
            const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                return false;
            }

            if (window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) === organizationId) {
                window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
            }

            notifySidebarContextUpdated();
            toast.success('Você saiu da organização com sucesso.');
            router.replace('/organizations');
            router.refresh();
            return true;
        } catch {
            toast.error('Não foi possível sair da organização.');
            return false;
        } finally {
            setIsLeaving(false);
        }
    };

    if (isLoadingOrganization) {
        return <div className="py-6 text-sm text-muted-foreground">Carregando organização...</div>;
    }

    return (
        <Form {...form}>
            <form onSubmit={onSubmit} className="flex flex-col gap-5 sm:gap-6">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nome</FormLabel>
                            <FormControl>
                                <IconInput placeholder="Nome da organização" StartIcon={Building2} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="cnpj"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>CNPJ</FormLabel>
                            <FormControl>
                                <IconInput
                                    placeholder="CNPJ da organização"
                                    StartIcon={IdCardLanyard}
                                    {...field}
                                    value={formatCNPJ(field.value ?? '')}
                                    onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ''))}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <OrganizationEditActions
                    canDelete={currentRole === 'OWNER'}
                    canLeave={currentRole !== 'OWNER'}
                    isSaving={isLoading}
                    isDeleting={isDeleting}
                    isLeaving={isLeaving}
                    onConfirmDelete={onDeleteOrganization}
                    onConfirmLeave={onLeaveOrganization}
                />
            </form>
        </Form>
    );
}
