'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function LogoutButton() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogout = async () => {
        setIsLoading(true);

        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
            });

            router.replace('/auth/sign-in');
            router.refresh();
        } catch {
            toast.error('Não foi possível sair da conta.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button variant="outline" onClick={handleLogout} isLoading={isLoading}>
            Sair
        </Button>
    );
}
