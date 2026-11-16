'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessages, extractErrorMessage } from '@/lib/error-messages';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Button } from '@/components/ui/button';
import { GoogleButton } from '@/components/auth/google-button';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSafeNextPath } from '@/lib/auth/request-origin';
import { useTranslations } from '@/lib/i18n';

type LoginFormData = { email: string; password: string };

function isEmailNotVerifiedError(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    const message = (body as { message?: unknown }).message;
    if (typeof message !== 'string') return false;
    return (
        message === ErrorMessages.AUTH.EMAIL_NOT_VERIFIED.en ||
        message === ErrorMessages.AUTH.EMAIL_NOT_VERIFIED.pt
    );
}

export function LoginForm() {
    const [viewPassword, setViewPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [needsVerificationEmail, setNeedsVerificationEmail] = useState<string | null>(null);
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

    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginScheme),
        defaultValues: {
            email: searchParams.get('email') ?? '',
            password: '',
        },
    });

    useEffect(() => {
        const error = searchParams.get('error');
        const registered = searchParams.get('registered');

        if (registered === '1') {
            toast.success(t.registerSuccessVerifyEmail);
            setNeedsVerificationEmail(searchParams.get('email'));
        }

        if (error === 'google_auth_failed') {
            toast.error(t.googleLoginError);
        } else if (error) {
            toast.error(t.loginError);
        }

        if (!error && registered !== '1') {
            return;
        }

        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('error');
        currentUrl.searchParams.delete('registered');
        window.history.replaceState({}, '', currentUrl.toString());
    }, [searchParams, t.googleLoginError, t.loginError, t.registerSuccessVerifyEmail]);

    const resendVerification = async (email: string) => {
        setResending(true);
        try {
            const response = await fetch('/api/auth/email/resend-by-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            if (response.status === 429) {
                toast.error(extractErrorMessage(await response.json().catch(() => null)));
                return;
            }

            toast.success(t.verifyEmailResentPublic);
        } catch {
            toast.error(tc.connectionError);
        } finally {
            setResending(false);
        }
    };

    const onSubmit = async (data: LoginFormData) => {
        setLoading(true);
        setNeedsVerificationEmail(null);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const body = await response.json();

            if (!response.ok) {
                if (isEmailNotVerifiedError(body)) {
                    setNeedsVerificationEmail(data.email);
                    toast.error(extractErrorMessage(body));
                    return;
                }

                toast.error(extractErrorMessage(body));
                return;
            }

            const nextPath = getSafeNextPath(searchParams.get('next'), '/');
            router.replace(nextPath);
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

            {needsVerificationEmail ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <p className="text-muted-foreground">{t.loginNeedsVerificationHint}</p>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-3 w-full"
                        isLoading={resending}
                        loadingText={t.verifyEmailResending}
                        onClick={() => resendVerification(needsVerificationEmail)}
                    >
                        {t.verifyEmailResend}
                    </Button>
                </div>
            ) : null}

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
