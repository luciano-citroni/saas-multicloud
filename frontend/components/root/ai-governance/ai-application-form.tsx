'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createAiFinopsApplication } from '@/app/actions/ai-finops';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { createApplicationSchema, type ApplicationFormValues } from './schema';

type Props = {
    tenantId: string;
    midOrgId: string;
    onSuccess: () => void;
};

export function AiApplicationForm({ tenantId, midOrgId, onSuccess }: Props) {
    const t = useTranslations('aiGovernance');
    const [pending, setPending] = useState(false);

    const schema = useMemo(
        () =>
            createApplicationSchema({
                nameRequired: t.validation.nameRequired,
            }),
        [t],
    );

    const form = useForm<ApplicationFormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: '' },
    });

    const onSubmit = form.handleSubmit(async (data) => {
        setPending(true);
        try {
            const res = await createAiFinopsApplication(tenantId, {
                organizationId: midOrgId,
                name: data.name,
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.applicationCreated);
            form.reset({ name: '' });
            onSuccess();
        } catch {
            toast.error(t.loadError);
        } finally {
            setPending(false);
        }
    });

    return (
        <Form {...form}>
            <form onSubmit={onSubmit} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem className="sm:w-56">
                            <FormControl>
                                <Input placeholder={t.applicationName} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" size="sm" isLoading={pending}>
                    <Plus className="size-3.5" />
                    {t.createApplication}
                </Button>
            </form>
        </Form>
    );
}
