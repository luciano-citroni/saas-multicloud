'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, IdCardLanyard, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { InputMaskForm } from '@/components/ui/mask-input-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ACTIVE_ORG_STORAGE_KEY, notifySidebarContextUpdated } from '@/lib/sidebar-context';
import { formatCNPJ, isValidCNPJ } from '@/lib/validators/cnpj';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';

type CreateTenantResponse = { id: string; name: string };

function createSchema(t: { nameMin: string; nameMax: string; cnpjInvalid: string }) {
    return z.object({
        name: z.string().min(2, t.nameMin).max(100, t.nameMax),
        cnpj: z
            .string()
            .optional()
            .refine((v) => !v || isValidCNPJ(v), t.cnpjInvalid),
    });
}

type FormValues = z.infer<ReturnType<typeof createSchema>>;

export function FormCreateTenant() {
    const router = useRouter();
    const t = useTranslations('organizations');
    const tc = useTranslations('common');
    const [done, setDone] = useState(false);
    const [createdName, setCreatedName] = useState('');
    const schema = useMemo(() => createSchema(t), [t]);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', cnpj: '' },
    });

    const onSubmit = form.handleSubmit(async (data) => {
        try {
            const response = await fetch('/api/organization', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: data.name.trim(),
                    cnpj: data.cnpj?.trim() || undefined,
                }),
            });

            const payload = (await response.json().catch(() => null)) as CreateTenantResponse | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }

            if (payload?.id) {
                window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, payload.id);
                notifySidebarContextUpdated();
            }

            setCreatedName(data.name.trim());
            setDone(true);
        } catch {
            toast.error(t.tenantCreateError);
        }
    });

    const [readyBefore, readyAfter = ''] = t.tenantReadyDesc.split('{name}');

    if (done) {
        return (
            <div className="flex flex-col items-center justify-center gap-6 py-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold">{t.tenantCreatedTitle}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {readyBefore}
                        <strong>{createdName}</strong>
                        {readyAfter}
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => router.push('/organizations')}>
                        {t.tenantViewAll}
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
                {/* Identity */}
                <div className="space-y-4">
                    <div>
                        <h3 className="text-sm font-medium">{t.tenantIdentityTitle}</h3>
                        <p className="text-muted-foreground text-xs mt-0.5">{t.tenantIdentityDesc}</p>
                    </div>

                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    {t.tenantNameLabel} <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                    <IconInput placeholder={t.tenantNamePlaceholder} StartIcon={Building2} autoFocus {...field} />
                                </FormControl>
                                <FormDescription>{t.tenantNameHint}</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <InputMaskForm
                        form={form}
                        label={t.cnpjLabel}
                        name="cnpj"
                        maxLength={18}
                        placeholder="00.000.000/0000-00"
                        icon={IdCardLanyard}
                        formatter={formatCNPJ}
                    />
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {tc.back}
                    </Button>
                    <Button type="submit" isLoading={form.formState.isSubmitting}>
                        {t.tenantCreateButton}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
