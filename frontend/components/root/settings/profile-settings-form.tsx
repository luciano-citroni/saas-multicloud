'use client';

import { z } from 'zod';
import { type UseFormReturn } from 'react-hook-form';
import { IdCard, Mail, User2 } from 'lucide-react';
import { updateProfileSchema } from '@/components/root/settings/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCPF } from '@/lib/validators/cpf';

type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

type ProfileSettingsFormProps = {
    form: UseFormReturn<UpdateProfileFormData>;
    isLoading: boolean;
    onSubmit: () => void;
};

export function ProfileSettingsForm({ form, isLoading, onSubmit }: ProfileSettingsFormProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <User2 className="size-4" />
                    Dados do Usuário
                </CardTitle>
                <CardDescription>Atualize seu nome e CPF da conta.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="grid gap-3">
                        <Skeleton className="h-9 w-full" />
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
                                        <FormLabel>Nome</FormLabel>
                                        <FormControl>
                                            <IconInput placeholder="Seu nome" StartIcon={User2} {...field} />
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
                                        <FormLabel>E-mail</FormLabel>
                                        <FormControl>
                                            <IconInput type="email" StartIcon={Mail} {...field} disabled />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="cpf"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>CPF</FormLabel>
                                        <FormControl>
                                            <IconInput
                                                placeholder="000.000.000-00"
                                                StartIcon={IdCard}
                                                {...field}
                                                onChange={(e) => {
                                                    const formatted = formatCPF(e.target.value);
                                                    field.onChange(formatted);
                                                }}
                                                maxLength={14}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="flex justify-end">
                                <Button type="submit" isLoading={form.formState.isSubmitting}>
                                    Salvar dados
                                </Button>
                            </div>
                        </form>
                    </Form>
                )}
            </CardContent>
        </Card>
    );
}
