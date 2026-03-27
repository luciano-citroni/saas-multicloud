'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const CALLBACK_REPLAY_STORAGE_KEY = 'smc_google_callback_replay_code';

function isLikelyGoogleAuthorizationCode(code: string): boolean {
    return code.startsWith('4/') || code.includes('/');
}

function GoogleCallbackContent() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const code = searchParams.get('code');

        const createSession = async () => {
            if (!code) {
                window.location.replace('/auth/sign-in?error=google_auth_failed');
                return;
            }

            try {
                const response = await fetch('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });

                if (!response.ok) {
                    const shouldReplayOnBackendCallback =
                        response.status === 401 &&
                        isLikelyGoogleAuthorizationCode(code) &&
                        sessionStorage.getItem(CALLBACK_REPLAY_STORAGE_KEY) !== code;

                    if (shouldReplayOnBackendCallback) {
                        sessionStorage.setItem(CALLBACK_REPLAY_STORAGE_KEY, code);
                        const query = searchParams.toString();
                        const replayUrl = query ? `/api/auth/google/callback/replay?${query}` : '/api/auth/google/callback/replay';
                        window.location.replace(replayUrl);
                        return;
                    }

                    window.location.replace('/auth/sign-in?error=google_auth_failed');
                    return;
                }

                sessionStorage.removeItem(CALLBACK_REPLAY_STORAGE_KEY);

                window.location.replace('/');
            } catch {
                window.location.replace('/auth/sign-in?error=google_auth_failed');
            }
        };

        void createSession();
    }, [searchParams]);

    return (
        <div className="flex items-center justify-center h-screen">
            <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Autenticando com Google...</p>
            </div>
        </div>
    );
}

export default function GoogleCallbackPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center h-screen">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
            }
        >
            <GoogleCallbackContent />
        </Suspense>
    );
}
