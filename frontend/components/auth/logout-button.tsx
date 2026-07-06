'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTranslations } from '@/lib/i18n';

export function LogoutButton() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const tn = useTranslations('nav');

    const handleLogout = async () => {
        setIsLoading(true);

        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
            });

            router.replace('/auth/sign-in');
            router.refresh();
        } catch {
            toast.error(tn.logoutError);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button variant="outline" onClick={handleLogout} isLoading={isLoading}>
            {tn.logout}
        </Button>
    );
}
