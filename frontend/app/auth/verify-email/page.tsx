'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DefaultFramer } from '@/components/ui/frame-motion';
import { extractErrorMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/queries/keys';

type VerifyPhase = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const token = searchParams.get('token')?.trim() ?? '';

    const [phase, setPhase] = useState<VerifyPhase>(token ? 'loading' : 'error');
    const [message, setMessage] = useState(
        token ? 'Confirmando seu e-mail…' : 'Link de confirmação inválido ou incompleto.',
    );

    useEffect(() => {
        if (!token) {
            return;
        }

        let cancelled = false;

        const run = async () => {
            try {
                const response = await fetch('/api/auth/email/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                const body = await response.json().catch(() => ({}));

                if (cancelled) {
                    return;
                }

                if (!response.ok) {
                    setPhase('error');
                    setMessage(extractErrorMessage(body, 'pt'));
                    return;
                }

                await queryClient.invalidateQueries({ queryKey: queryKeys.sidebarContext });
                setPhase('success');
                setMessage(
                    body?.alreadyVerified
                        ? 'Seu e-mail já estava confirmado.'
                        : 'E-mail confirmado com sucesso.',
                );
            } catch {
                if (!cancelled) {
                    setPhase('error');
                    setMessage('Não foi possível confirmar o e-mail. Tente novamente.');
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [token, queryClient]);

    return (
        <div className="flex justify-center items-center w-full h-screen">
            <DefaultFramer className="w-[96%] sm:w-[75%] xl:w-[45%] max-w-xl">
                <Card>
                    <CardHeader className="mb-2 mt-2">
                        <CardTitle className="text-xl">Confirmação de e-mail</CardTitle>
                        <CardDescription>
                            {phase === 'loading'
                                ? 'Estamos validando o link enviado para o seu e-mail.'
                                : phase === 'success'
                                  ? 'Sua conta está pronta para uso.'
                                  : 'Não foi possível concluir a confirmação.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-4 text-center">
                        {phase === 'loading' ? (
                            <Loader2 className="size-10 animate-spin text-muted-foreground" />
                        ) : phase === 'success' ? (
                            <CheckCircle2 className="size-10 text-emerald-600" />
                        ) : (
                            <XCircle className="size-10 text-destructive" />
                        )}

                        <p className="text-sm text-muted-foreground">{message}</p>

                        {phase !== 'loading' ? (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <Button type="button" onClick={() => router.replace('/')}>
                                    Ir para o app
                                </Button>
                                <Button type="button" variant="outline" asChild>
                                    <Link href="/auth/sign-in">Entrar</Link>
                                </Button>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </DefaultFramer>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-screen items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
            }
        >
            <VerifyEmailContent />
        </Suspense>
    );
}
