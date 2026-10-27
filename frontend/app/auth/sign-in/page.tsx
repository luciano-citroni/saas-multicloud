'use client';

import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DefaultFramer } from '@/components/ui/frame-motion';
import { useTranslations } from '@/lib/i18n';

export default function SignInPage() {
    const t = useTranslations('auth');

    return (
        <div className="flex justify-center items-center w-full h-screen">
            <DefaultFramer className="w-[96%] sm:w-[75%] xl:w-[45%] max-w-xl">
                <Card>
                    <CardHeader className="mb-2 mt-2">
                        <CardTitle className="text-xl">{t.signInTitle}</CardTitle>
                        <CardDescription>{t.signInDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={null}>
                            <LoginForm />
                        </Suspense>
                    </CardContent>
                </Card>
            </DefaultFramer>
        </div>
    );
}