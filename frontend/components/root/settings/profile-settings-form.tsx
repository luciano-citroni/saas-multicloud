'use client';

import { type UseFormReturn } from 'react-hook-form';
import { BadgeCheck, Mail, MailWarning, User2 } from 'lucide-react';
import { type UpdateProfileFormData } from '@/components/root/settings/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type ProfileSettingsFormProps = {
    form: UseFormReturn<UpdateProfileFormData>;
    isLoading: boolean;
    emailVerified: boolean;
    isResendingVerification: boolean;
    onSubmit: () => void;
    onResendVerification: () => void;
};

export function ProfileSettingsForm({
    form,
    isLoading,
    emailVerified,
    isResendingVerification,
    onSubmit,
    onResendVerification,
}: ProfileSettingsFormProps) {
    const t = useTranslations('profile');
    const tc = useTranslations('common');

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <User2 className="size-4" />
                    {t.title}
                </CardTitle>
                <CardDescription>{t.description}</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="grid gap-3">
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-9 w-44" />
                    </div>
                ) : (
                    <Form {...form}>
                        <form className="grid gap-4" onSubmit={onSubmit}>
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{tc.name}</FormLabel>
                                        <FormControl>
                                            <IconInput placeholder={t.namePlaceholder} StartIcon={User2} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{tc.email}</FormLabel>
                                        <FormControl>
                                            <IconInput type="email" StartIcon={Mail} {...field} disabled />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            <div
                                className={cn(
                                    'rounded-xl border px-4 py-3',
                                    emailVerified
                                        ? 'border-emerald-500/40 bg-emerald-500/10'
                                        : 'border-amber-500/40 bg-amber-500/10',
                                )}
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-start gap-3">
                                        {emailVerified ? (
                                            <BadgeCheck
                                                className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
                                                aria-hidden
                                            />
                                        ) : (
                                            <MailWarning
                                                className="mt-0.5 size-4 shrink-0 text-amber-800 dark:text-amber-200"
                                                aria-hidden
                                            />
                                        )}
                                        <div className="grid gap-1">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    'w-fit font-normal',
                                                    emailVerified
                                                        ? 'border-emerald-600/40 text-emerald-800 dark:text-emerald-200'
                                                        : 'border-amber-600/40 text-amber-900 dark:text-amber-100',
                                                )}
                                            >
                                                {emailVerified ? t.emailVerified : t.emailNotVerified}
                                            </Badge>
                                            {!emailVerified ? (
                                                <p className="text-sm text-amber-950 dark:text-amber-100">
                                                    {t.emailNotVerifiedHint}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>

                                    {!emailVerified ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 border-amber-600/40 bg-background/60 hover:bg-background"
                                            isLoading={isResendingVerification}
                                            onClick={onResendVerification}
                                        >
                                            {t.resendVerification}
                                        </Button>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button type="submit" isLoading={form.formState.isSubmitting}>
                                    {t.saveData}
                                </Button>
                            </div>
                        </form>
                    </Form>
                )}
            </CardContent>
        </Card>
    );
}
