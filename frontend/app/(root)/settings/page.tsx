'use client';

import { AccountSecuritySettings } from '@/components/root/settings/account-security-settings';
import { ThemeSelection } from '@/components/root/settings/theme-selector';
import { LanguageSelector } from '@/components/root/settings/language-selector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Languages, Palette } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

export default function SettingsPage() {
    const t = useTranslations('settings');

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
                <p className="text-sm text-muted-foreground">{t.description}</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Palette className="size-4" />
                        {t.appearance}
                    </CardTitle>
                    <CardDescription>{t.appearanceDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                    <ThemeSelection />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Languages className="size-4" />
                        {t.language}
                    </CardTitle>
                    <CardDescription>{t.languageDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                    <LanguageSelector />
                </CardContent>
            </Card>

            <AccountSecuritySettings />
        </div>
    );
}
