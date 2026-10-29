'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DefaultFramer } from '@/components/ui/frame-motion';
import { RegisterWithInviteForm } from '@/components/auth/invite/register-with-invite-form';
import { useTranslations } from '@/lib/i18n';

type InviteAcceptedState = {
    status: 'accepted';
    organizationId: string;
    role: string;
};

type InviteNeedsRegistrationState = {
    status: 'needs_registration';
    email: string;
    organizationId: string;
    organizationName: string;
    role: string;
    inviteToken: string;
};

type InviteRequiresAuthState = {
    status: 'requires_authentication';
    email: string;
    organizationId: string;
    organizationName: string;
    role: string;
    inviteToken: string;
};

type InviteState =
    | { phase: 'loading' }
    | { phase: 'accepted'; data: InviteAcceptedState }
    | { phase: 'needs_registration'; data: InviteNeedsRegistrationState }
    | { phase: 'requires_authentication'; data: InviteRequiresAuthState }
    | { phase: 'error'; message: string };

export default function InviteAcceptPage() {
    const { token } = useParams<{ token: string }>();
    const router = useRouter();
    const ti = useTranslations('invite');
    const [state, setState] = useState<InviteState>({ phase: 'loading' });

    useEffect(() => {
        if (!token) {
            setState({ phase: 'error', message: ti.invalidToken });
            return;
        }

        let cancelled = false;

        const run = async () => {
            try {
                const previewRes = await fetch(`/api/invites/accept/${encodeURIComponent(token)}`);
                const previewBody = await previewRes.json().catch(() => null);

                if (cancelled) return;

                if (!previewRes.ok) {
                    setState({ phase: 'error', message: previewBody?.message ?? ti.genericError });
                    return;
                }

                if (previewBody?.status === 'needs_registration') {
                    setState({ phase: 'needs_registration', data: previewBody as InviteNeedsRegistrationState });
                    return;
                }

                if (previewBody?.status === 'requires_authentication') {
                    const acceptRes = await fetch(`/api/invites/accept/${encodeURIComponent(token)}`, {
                        method: 'POST',
                    });
                    const acceptBody = await acceptRes.json().catch(() => null);

                    if (cancelled) return;

                    if (acceptRes.ok && acceptBody?.status === 'accepted') {
                        setState({ phase: 'accepted', data: acceptBody as InviteAcceptedState });
                        return;
                    }

                    if (acceptRes.status === 401) {
                        setState({
                            phase: 'requires_authentication',
                            data: previewBody as InviteRequiresAuthState,
                        });
                        return;
                    }

                    setState({
                        phase: 'error',
                        message: acceptBody?.message ?? ti.genericError,
                    });
                    return;
                }

                if (previewBody?.status === 'accepted') {
                    setState({ phase: 'accepted', data: previewBody as InviteAcceptedState });
                    return;
                }

                setState({ phase: 'error', message: ti.genericError });
            } catch {
                if (!cancelled) setState({ phase: 'error', message: ti.genericError });
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [token, ti.invalidToken, ti.genericError]);

    const signInHref = token
        ? `/auth/sign-in?next=${encodeURIComponent(`/invite/accept/${token}`)}`
        : '/auth/sign-in';

    return (
        <div className="flex justify-center items-center min-h-screen px-4">
            <DefaultFramer className="w-full max-w-md">
                {state.phase === 'loading' && (
                    <Card>
                        <CardContent className="flex flex-col items-center gap-3 py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">{ti.loading}</p>
                        </CardContent>
                    </Card>
                )}

                {state.phase === 'accepted' && (
                    <Card>
                        <CardHeader className="items-center text-center gap-2">
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                            <CardTitle>{ti.acceptedTitle}</CardTitle>
                            <CardDescription>{ti.acceptedDesc}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <Button
                                className="w-full"
                                onClick={() => {
                                    router.replace('/');
                                    router.refresh();
                                }}
                            >
                                {ti.goToDashboard}
                            </Button>
                            <Button variant="outline" className="w-full" asChild>
                                <Link href="/auth/sign-in">{ti.signIn}</Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {state.phase === 'requires_authentication' && (
                    <Card>
                        <CardHeader className="items-center text-center gap-2">
                            <CardTitle>{ti.signInToAcceptTitle}</CardTitle>
                            <CardDescription>
                                {ti.signInToAcceptDesc} ({state.data.email})
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <Button className="w-full" asChild>
                                <Link href={signInHref}>{ti.signIn}</Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {state.phase === 'needs_registration' && (
                    <Card>
                        <CardHeader>
                            <CardTitle>{ti.registerTitle}</CardTitle>
                            <CardDescription>{ti.registerDesc}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <RegisterWithInviteForm
                                email={state.data.email}
                                inviteToken={state.data.inviteToken}
                                organizationName={state.data.organizationName}
                                role={state.data.role}
                            />
                            <p className="mt-4 text-center text-sm text-muted-foreground">
                                {ti.alreadyHaveAccount}{' '}
                                <Link
                                    href={signInHref}
                                    className="text-primary underline underline-offset-4 hover:opacity-80 font-medium"
                                >
                                    {ti.signIn}
                                </Link>
                            </p>
                        </CardContent>
                    </Card>
                )}

                {state.phase === 'error' && (
                    <Card>
                        <CardHeader className="items-center text-center gap-2">
                            <XCircle className="h-10 w-10 text-destructive" />
                            <CardTitle>{ti.errorTitle}</CardTitle>
                            <CardDescription>{state.message}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full" asChild>
                                <Link href="/auth/sign-in">{ti.signIn}</Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </DefaultFramer>
        </div>
    );
}
