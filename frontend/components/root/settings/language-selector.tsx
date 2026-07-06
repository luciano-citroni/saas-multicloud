'use client';

import { useEffect, useState } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/components/providers/locale-provider';
import { useTranslations } from '@/lib/i18n';
import type { AppLocale } from '@/lib/locale';

export function LanguageSelector() {
    const { locale, changeLocale } = useLocale();
    const t = useTranslations('settings');
    const tLang = useTranslations('language');
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const options: { value: AppLocale; label: string; description: string }[] = [
        { value: 'pt', label: tLang.pt, description: 'pt-BR' },
        { value: 'en', label: tLang.en, description: 'en' },
    ];

    if (!isMounted) {
        return (
            <div className="flex flex-col w-full gap-3">
                <Label className="text-base font-semibold">{t.language}</Label>
                <div className="flex flex-col gap-2">
                    {options.map((opt) => (
                        <div key={opt.value} className="h-14 w-full rounded-md border-2 border-muted bg-muted/40 animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full gap-3">
            <Label className="text-base font-semibold">{t.language}</Label>
            <RadioGroup value={locale} onValueChange={(v) => changeLocale(v as AppLocale)} className="flex flex-col gap-2">
                {options.map((opt) => (
                    <label
                        key={opt.value}
                        htmlFor={`locale-${opt.value}`}
                        className="flex items-center gap-3 rounded-md border-2 border-muted px-4 py-3 cursor-pointer hover:border-accent transition-colors [&:has([data-state=checked])]:border-primary"
                    >
                        <RadioGroupItem id={`locale-${opt.value}`} value={opt.value} />
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">{opt.label}</span>
                            <span className="text-xs text-muted-foreground">{opt.description}</span>
                        </div>
                    </label>
                ))}
            </RadioGroup>
        </div>
    );
}
