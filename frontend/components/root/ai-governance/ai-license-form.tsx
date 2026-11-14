'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createAiFinopsLicense } from '@/app/actions/ai-finops';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { createLicenseSchema, type LicenseFormValues } from './schema';

type Props = {
    tenantId: string;
    midOrgId: string;
    onSuccess: () => void;
};

export function AiLicenseForm({ tenantId, midOrgId, onSuccess }: Props) {
    const t = useTranslations('aiGovernance');
    const tc = useTranslations('common');
    const [pending, setPending] = useState(false);

    const schema = useMemo(
        () =>
            createLicenseSchema({
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

    const form = useForm<LicenseFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: '',
            provider: 'openai',
            licenseType: 'seat',
            quantity: '1',
            unitCost: '0',
        },
    });

    const onSubmit = form.handleSubmit(async (data) => {
        setPending(true);
        try {
            const response = await createAiFinopsLicense(tenantId, {
                organizationId: midOrgId,
                provider: data.provider,
                licenseType: data.licenseType,
                name: data.name,
                quantity: Number(data.quantity),
                unitCost: Number(data.unitCost),
                source: 'manual',
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.licenseSaved);
            form.reset({
                name: '',
                provider: data.provider,
                licenseType: 'seat',
                quantity: '1',
                unitCost: '0',
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
            <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
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
                    name="provider"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.providers}</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="licenseType"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.licenseType}</FormLabel>
                            <SearchableSelect
                                mode="single"
                                value={field.value}
                                onValueChange={field.onChange}
                                options={[
                                    { value: 'seat', label: t.licenseSeat },
                                    { value: 'credit_pack', label: t.licenseCreditPack },
                                    { value: 'commitment', label: t.licenseCommitment },
                                ]}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.quantity}</FormLabel>
                            <FormControl>
                                <Input type="number" min={1} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="unitCost"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.unitCost}</FormLabel>
                            <FormControl>
                                <Input type="number" min={0} step="any" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex items-end md:col-span-2">
                    <Button type="submit" size="sm" isLoading={pending}>
                        <Plus className="size-3.5" />
                        {t.createLicense}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
