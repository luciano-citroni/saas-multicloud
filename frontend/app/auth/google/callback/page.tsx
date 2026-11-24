'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const CALLBACK_REPLAY_STORAGE_KEY = 'smc_google_callback_replay_code';
const CALLBACK_EXCHANGE_LOCK_KEY = 'smc_google_callback_exchange_lock';

function isLikelyGoogleAuthorizationCode(code: string): boolean {
    return code.startsWith('4/') || code.includes('/');
}

function claimExchangeLock(code: string): boolean {
    try {
        const existing = sessionStorage.getItem(CALLBACK_EXCHANGE_LOCK_KEY);
        if (existing === code) {
            return false;
        }
        sessionStorage.setItem(CALLBACK_EXCHANGE_LOCK_KEY, code);
        return true;
    } catch {
        return true;
    }
}

function clearExchangeLock(code: string) {
    try {
        if (sessionStorage.getItem(CALLBACK_EXCHANGE_LOCK_KEY) === code) {
            sessionStorage.removeItem(CALLBACK_EXCHANGE_LOCK_KEY);
        }
    } catch {
        // ignore storage errors
    }
}

function GoogleCallbackContent() {
    const searchParams = useSearchParams();
    const startedRef = useRef(false);

    useEffect(() => {
        const code = searchParams.get('code');

        // React Strict Mode remounts effects in dev; the Google code is single-use.
        if (startedRef.current) {
            return;
        }
        startedRef.current = true;

        const createSession = async () => {
            if (!code) {
                window.location.replace('/auth/sign-in?error=google_auth_failed');
                return;
            }

            if (!claimExchangeLock(code)) {
                return;
            }

            try {
                const response = await fetch('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });

                if (!response.ok) {
                    clearExchangeLock(code);

                    const shouldReplayOnBackendCallback =
                        response.status === 401 && isLikelyGoogleAuthorizationCode(code) && sessionStorage.getItem(CALLBACK_REPLAY_STORAGE_KEY) !== code;

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
                clearExchangeLock(code);

                window.location.replace('/');
            } catch {
                clearExchangeLock(code);
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
