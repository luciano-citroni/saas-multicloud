'use client';

import { PrivateHome } from '@/components/auth/private-home';
import { House } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

export default function HomePage() {
    const t = useTranslations('home');

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    <House className="size-5" />
                    {t.title}
                </h1>
                <p className="text-sm text-muted-foreground">{t.description}</p>
            </div>

            <PrivateHome />
        </div>
    );
}
