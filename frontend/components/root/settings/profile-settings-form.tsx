'use client';

import { type UseFormReturn } from 'react-hook-form';
import { Mail, User2 } from 'lucide-react';
import { type UpdateProfileFormData } from '@/components/root/settings/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from '@/lib/i18n';

type ProfileSettingsFormProps = {
    form: UseFormReturn<UpdateProfileFormData>;
    isLoading: boolean;
    onSubmit: () => void;
};

export function ProfileSettingsForm({ form, isLoading, onSubmit }: ProfileSettingsFormProps) {
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
