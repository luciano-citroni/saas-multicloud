'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LogoutButton } from '@/components/auth/logout-button';
import { useTranslations } from '@/lib/i18n';

type CurrentUser = {
    id?: string;
    name?: string;
    email?: string;
};

export function PrivateHome() {
    const t = useTranslations('auth');
    const tc = useTranslations('common');
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const loadMe = async () => {
            try {
                const response = await fetch('/api/auth/me', { cache: 'no-store' });

                if (response.status === 401) {
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!response.ok) {
                    setUser(null);
                    return;
                }

                const body = (await response.json()) as CurrentUser;
                setUser(body);
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        void loadMe();
    }, [router]);

    return (
        <Card className="w-full max-w-3xl">
            <CardHeader>
                <CardTitle>{t.privateTitle}</CardTitle>
                <CardDescription>{t.privateDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-56" />
                        <Skeleton className="h-4 w-36" />
                    </div>
                ) : (
                    <div className="space-y-1 text-sm">
                        <p>
                            <span className="font-medium">{tc.name}:</span> {user?.name ?? t.notInformed}
                        </p>
                        <p>
                            <span className="font-medium">{tc.email}:</span> {user?.email ?? t.notInformed}
                        </p>
                        <p>
                            <span className="font-medium">ID:</span> {user?.id ?? t.notInformed}
                        </p>
                    </div>
                )}
                <LogoutButton />
            </CardContent>
        </Card>
    );
}
