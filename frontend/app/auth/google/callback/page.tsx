'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function GoogleCallbackContent() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const token = searchParams.get('token');

        const createSession = async () => {
            if (!token) {
                window.location.replace('/auth/sign-in?error=google_auth_failed');
                return;
            }

            try {
                const response = await fetch('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                });

                if (!response.ok) {
                    window.location.replace('/auth/sign-in?error=google_auth_failed');
                    return;
                }

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
