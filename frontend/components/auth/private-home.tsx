'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LogoutButton } from '@/components/auth/logout-button';

type CurrentUser = {
    id?: string;
    name?: string;
    email?: string;
};

export function PrivateHome() {
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
                <CardTitle>Área privada</CardTitle>
                <CardDescription>Somente usuários autenticados conseguem acessar esta página.</CardDescription>
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
                            <span className="font-medium">Nome:</span> {user?.name ?? 'Não informado'}
                        </p>
                        <p>
                            <span className="font-medium">E-mail:</span> {user?.email ?? 'Não informado'}
                        </p>
                        <p>
                            <span className="font-medium">ID:</span> {user?.id ?? 'Não informado'}
                        </p>
                    </div>
                )}
                <LogoutButton />
            </CardContent>
        </Card>
    );
}
