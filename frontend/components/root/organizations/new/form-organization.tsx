'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { createOrganizationSchema, type OrganizationFormValues } from './scheme';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Building2, IdCardLanyard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { formatCNPJ } from '@/lib/validators/cnpj';
import { InputMaskForm } from '@/components/ui/mask-input-form';
import { ACTIVE_ORG_STORAGE_KEY, notifySidebarContextUpdated } from '@/lib/sidebar-context';
import { useTranslations } from '@/lib/i18n';

type CreateOrganizationResponse = {
    id?: string;
    name?: string;
};

export function FormOrganization() {
    const [isLoading, setIsLoading] = useState(false);
    const t = useTranslations('organizations');
    const tc = useTranslations('common');
    const schema = useMemo(() => createOrganizationSchema({ nameMin: t.nameMin, cnpjInvalid: t.cnpjInvalid }), [t]);

    const router = useRouter();

    const form = useForm<OrganizationFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: '',
            cnpj: '',
        },
    });

    const onSubmit = form.handleSubmit(async (data) => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/organization', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: data.name,
                    cnpj: data.cnpj?.trim() || undefined,
                }),
            });

            const payload = (await response.json().catch(() => null)) as CreateOrganizationResponse | { message?: string } | null;

                if (!response.ok) {
                const message = typeof payload === 'object' && payload && 'message' in payload ? payload.message : null;
                toast.error(typeof message === 'string' ? message : t.createError);
                return;
            }

            if (payload && typeof payload === 'object' && 'id' in payload && typeof payload.id === 'string') {
                window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, payload.id);
                notifySidebarContextUpdated();
            }

            toast.success(t.createSuccess);
            router.replace('/');
            router.refresh();
        } catch {
            toast.error(t.createError);
        } finally {
            setIsLoading(false);
        }
    });

    return (
        <div className="w-full gap-3 flex flex-col">
            <Form {...form}>
                <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{tc.name}</FormLabel>
                                <FormControl>
                                    <IconInput placeholder={t.orgNamePlaceholder} StartIcon={Building2} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <InputMaskForm
                        form={form}
                        label={t.cnpjLabel}
                        maxLength={18}
                        name="cnpj"
                        placeholder={t.cnpjPlaceholder}
                        icon={IdCardLanyard}
                        formatter={formatCNPJ}
                    />

                    {/* <FormField
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
                                        onChange={(e) => {
                                            const formatted = formatCNPJ(e.target.value);
                                            field.onChange(formatted);
                                        }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    /> */}
                </form>
            </Form>
            <div className="w-full flex justify-end items-end">
                <Button isLoading={isLoading} onClick={onSubmit}>
                    {t.createOrg}
                </Button>
            </div>
        </div>
    );
}
