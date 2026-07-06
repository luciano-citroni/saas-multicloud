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

type InviteState =
    | { phase: 'loading' }
    | { phase: 'accepted'; data: InviteAcceptedState }
    | { phase: 'needs_registration'; data: InviteNeedsRegistrationState }
    | { phase: 'error'; message: string };

export default function InviteAcceptPage() {
    const { token } = useParams<{ token: string }>();
    const router = useRouter();
    const ti = useTranslations('invite');
    const [state, setState] = useState<InviteState>({ phase: 'loading' });

    useEffect(() => {
        if (!token) { setState({ phase: 'error', message: ti.invalidToken }); return; }

        fetch(`/api/invites/accept/${encodeURIComponent(token)}`)
            .then(async (res) => {
                const body = await res.json().catch(() => null);
                if (!res.ok) {
                    setState({ phase: 'error', message: body?.message ?? ti.genericError });
                    return;
                }

                if (body?.status === 'accepted') {
                    setState({ phase: 'accepted', data: body as InviteAcceptedState });
                } else if (body?.status === 'needs_registration') {
                    setState({ phase: 'needs_registration', data: body as InviteNeedsRegistrationState });
                } else {
                    setState({ phase: 'error', message: ti.genericError });
                }
            })
            .catch(() => setState({ phase: 'error', message: ti.genericError }));
    }, [token, ti.invalidToken, ti.genericError]);

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
                            <Button className="w-full" onClick={() => { router.replace('/'); router.refresh(); }}>
                                {ti.goToDashboard}
                            </Button>
                            <Button variant="outline" className="w-full" asChild>
                                <Link href="/auth/sign-in">{ti.signIn}</Link>
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
                                    href={`/auth/sign-in`}
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
