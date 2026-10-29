'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { extractErrorMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/queries/keys';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';

export function EmailVerificationBanner() {
    const queryClient = useQueryClient();
    const { data } = useSidebarContext();
    const [isResending, setIsResending] = useState(false);

    const emailVerified = data?.user?.emailVerified;
    const email = data?.user?.email;

    if (emailVerified !== false) {
        return null;
    }

    const handleResend = async () => {
        setIsResending(true);

        try {
            const response = await fetch('/api/auth/email/resend', {
                method: 'POST',
            });
            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }

            if (body?.alreadyVerified) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.sidebarContext });
                toast.success('E-mail já confirmado.');
                return;
            }

            toast.success('E-mail de confirmação reenviado. Verifique sua caixa de entrada.');
        } catch {
            toast.error('Não foi possível reenviar o e-mail de confirmação.');
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 lg:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 text-sm text-amber-950 dark:text-amber-100">
                    <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p>
                        Confirme seu e-mail
                        {email ? (
                            <>
                                {' '}
                                <span className="font-medium">{email}</span>
                            </>
                        ) : null}{' '}
                        para manter sua conta segura. Enviamos um link de confirmação para você.
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-amber-600/40 bg-background/60 hover:bg-background"
                    isLoading={isResending}
                    onClick={handleResend}
                >
                    Reenviar e-mail
                </Button>
            </div>
        </div>
    );
}
