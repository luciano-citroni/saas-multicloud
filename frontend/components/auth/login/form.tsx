'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { extractErrorMessage } from '@/lib/error-messages';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Button } from '@/components/ui/button';
import { GoogleButton } from '@/components/auth/google-button';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from '@/lib/i18n';

type LoginFormData = { email: string; password: string };

export function LoginForm() {
    const [viewPassword, setViewPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('auth');
    const tc = useTranslations('common');

    const loginScheme = useMemo(
        () =>
            z.object({
                email: z.email(t.emailInvalid),
                password: z.string().min(1, t.passwordRequired),
            }),
        [t]
    );

    useEffect(() => {
        const error = searchParams.get('error');

        if (!error) {
            return;
        }

        if (error === 'google_auth_failed') {
            toast.error(t.googleLoginError);
        } else {
            toast.error(t.loginError);
        }

        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('error');
        window.history.replaceState({}, '', currentUrl.toString());
    }, [searchParams, t.googleLoginError, t.loginError]);

    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginScheme),
        defaultValues: { email: '', password: '' },
    });

    const onSubmit = async (data: LoginFormData) => {
        setLoading(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const body = await response.json();

            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }

            router.replace('/');
            router.refresh();
        } catch {
            toast.error(tc.connectionError);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-4 flex-col">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{tc.email}</FormLabel>
                                <FormControl>
                                    <IconInput placeholder={t.emailPlaceholder} StartIcon={Mail} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.passwordLabel}</FormLabel>
                                <FormControl>
                                    <IconInput
                                        placeholder={t.passwordPlaceholder}
                                        StartIcon={LockKeyhole}
                                        type={viewPassword ? 'text' : 'password'}
                                        ButtonIcon={{
                                            icon: viewPassword ? EyeOff : Eye,
                                            onClick: () => setViewPassword(!viewPassword),
                                        }}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <Button type="submit" isLoading={loading} loadingText={t.signingIn}>
                        {t.signIn}
                    </Button>
                </form>
            </Form>

            <div className="relative flex items-center gap-2">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">{t.or}</span>
                <div className="flex-1 border-t border-border" />
            </div>

            <GoogleButton label={t.signInWithGoogle} />

            <Link href="/auth/sign-up" className="">
                <p className="text-center text-sm text-muted-foreground">
                    {t.noAccount} <span className="font-medium text-primary hover:underline">{t.signUp}</span>
                </p>
            </Link>
        </div>
    );
}
