'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { upsertAiFinopsAzureCredits } from '@/app/actions/ai-finops';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { createAzureCreditsSchema, type AzureCreditsFormValues } from './schema';

type Props = {
    tenantId: string;
    midOrgId: string;
    onSuccess: () => void;
};

export function AiAzureCreditsForm({ tenantId, midOrgId, onSuccess }: Props) {
    const t = useTranslations('aiGovernance');
    const [pending, setPending] = useState(false);

    const schema = useMemo(
        () =>
            createAzureCreditsSchema({
                nameRequired: t.validation.nameRequired,
                providerRequired: t.validation.providerRequired,
                apiKeyRequired: t.validation.apiKeyRequired,
                roleArnRequired: t.validation.roleArnRequired,
                regionRequired: t.validation.regionRequired,
                endpointRequired: t.validation.endpointRequired,
                entraTenantRequired: t.validation.entraTenantRequired,
                clientIdRequired: t.validation.clientIdRequired,
                clientSecretRequired: t.validation.clientSecretRequired,
                quantityInvalid: t.validation.quantityInvalid,
                unitCostInvalid: t.validation.unitCostInvalid,
                remainingInvalid: t.validation.remainingInvalid,
            }),
        [t],
    );

    const form = useForm<AzureCreditsFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: '',
            quantity: '',
            remainingQuantity: '',
        },
    });

    const onSubmit = form.handleSubmit(async (data) => {
        setPending(true);
        try {
            const quantity = Number(data.quantity);
            const remaining =
                data.remainingQuantity && data.remainingQuantity.trim() !== ''
                    ? Number(data.remainingQuantity)
                    : quantity;
            const response = await upsertAiFinopsAzureCredits(tenantId, {
                organizationId: midOrgId,
                entries: [
                    {
                        name: data.name,
                        quantity,
                        remainingQuantity: remaining,
                    },
                ],
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.azureCreditsSaved);
            form.reset({
                name: '',
                quantity: '',
                remainingQuantity: '',
            });
            onSuccess();
        } catch {
            toast.error(t.loadError);
        } finally {
            setPending(false);
        }
    });

    return (
        <Form {...form}>
            <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <Input placeholder={t.creditName} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <Input type="number" min={1} placeholder={t.quantity} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="remainingQuantity"
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <Input type="number" min={0} placeholder={t.remaining} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="md:col-span-3">
                    <Button type="submit" size="sm" variant="outline" isLoading={pending}>
                        {t.upsertAzureCredits}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
