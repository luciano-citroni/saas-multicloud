'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { organizationFormScheme } from './scheme';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Building2, IdCardLanyard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

type CreateOrganizationResponse = {
    id?: string;
    name?: string;
};

export function FormOrganization() {
    const [isLoading, setIsLoading] = useState(false);

    const router = useRouter();

    const form = useForm<z.infer<typeof organizationFormScheme>>({
        resolver: zodResolver(organizationFormScheme),
        defaultValues: {
            name: '',
            cnpj: '',
        },
    });

    const onSubmit = async (data: z.infer<typeof organizationFormScheme>) => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/organization', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const payload = (await response.json().catch(() => null)) as CreateOrganizationResponse | { message?: string } | null;

            if (!response.ok) {
                const message = typeof payload === 'object' && payload && 'message' in payload ? payload.message : null;
                toast.error(typeof message === 'string' ? message : 'Nao foi possivel criar a organizacao.');
                return;
            }

            if (payload && typeof payload === 'object' && 'id' in payload && typeof payload.id === 'string') {
                window.localStorage.setItem('smc_active_organization_id', payload.id);
            }

            toast.success('Organizacao criada com sucesso.');
            router.replace('/');
            router.refresh();
        } catch {
            toast.error('Nao foi possivel criar a organizacao.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full gap-3 flex flex-col">
            <Form {...form}>
                <form className="flex flex-col gap-4">
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
                                    <IconInput placeholder="CNPJ da organização" StartIcon={IdCardLanyard} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </form>
            </Form>
            <div className="w-full flex justify-end items-end">
                <Button isLoading={isLoading}>Criar organização</Button>
            </div>
        </div>
    );
}
