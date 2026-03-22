'use client';

import { useState } from 'react';
import { z } from 'zod';
import { type UseFormReturn } from 'react-hook-form';
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { updatePasswordSchema } from '@/components/root/settings/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';

type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>;

type PasswordSettingsFormProps = {
    form: UseFormReturn<UpdatePasswordFormData>;
    hasPassword: boolean;
    onSubmit: () => void;
};

export function PasswordSettingsForm({ form, hasPassword, onSubmit }: PasswordSettingsFormProps) {
    const [viewCurrentPassword, setViewCurrentPassword] = useState(false);
    const [viewNewPassword, setViewNewPassword] = useState(false);
    const [viewConfirmPassword, setViewConfirmPassword] = useState(false);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-4" />
                    Alterar Senha
                </CardTitle>
                <CardDescription>
                    {hasPassword
                        ? 'Use uma senha forte para manter sua conta segura.'
                        : 'Sua conta foi criada com Google e ainda não possui senha local. Defina uma nova senha abaixo.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form className="grid gap-4" onSubmit={onSubmit}>
                        {hasPassword ? (
                            <FormField
                                control={form.control}
                                name="currentPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Senha atual</FormLabel>
                                        <FormControl>
                                            <IconInput
                                                StartIcon={LockKeyhole}
                                                autoComplete="current-password"
                                                type={viewCurrentPassword ? 'text' : 'password'}
                                                ButtonIcon={{ icon: viewCurrentPassword ? EyeOff : Eye, onClick: () => setViewCurrentPassword(!viewCurrentPassword) }}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        ) : null}

                        <FormField
                            control={form.control}
                            name="newPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nova senha</FormLabel>
                                    <FormControl>
                                        <IconInput
                                            StartIcon={LockKeyhole}
                                            autoComplete="new-password"
                                            type={viewNewPassword ? 'text' : 'password'}
                                            ButtonIcon={{ icon: viewNewPassword ? EyeOff : Eye, onClick: () => setViewNewPassword(!viewNewPassword) }}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="confirmNewPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Confirmar nova senha</FormLabel>
                                    <FormControl>
                                        <IconInput
                                            StartIcon={LockKeyhole}
                                            autoComplete="new-password"
                                            type={viewConfirmPassword ? 'text' : 'password'}
                                            ButtonIcon={{ icon: viewConfirmPassword ? EyeOff : Eye, onClick: () => setViewConfirmPassword(!viewConfirmPassword) }}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end">
                            <Button type="submit" isLoading={form.formState.isSubmitting}>
                                Atualizar senha
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
