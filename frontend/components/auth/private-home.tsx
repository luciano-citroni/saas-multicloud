'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
        <div className="flex  items-center justify-center p-6">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle>Area privada</CardTitle>
                    <CardDescription>Somente usuarios autenticados conseguem acessar esta pagina.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Carregando sua sessao...</p>
                    ) : (
                        <div className="space-y-1 text-sm">
                            <p>
                                <span className="font-medium">Nome:</span> {user?.name ?? 'Nao informado'}
                            </p>
                            <p>
                                <span className="font-medium">Email:</span> {user?.email ?? 'Nao informado'}
                            </p>
                            <p>
                                <span className="font-medium">ID:</span> {user?.id ?? 'Nao informado'}
                            </p>
                        </div>
                    )}
                    <LogoutButton />
                </CardContent>
            </Card>
        </div>
    );
}
