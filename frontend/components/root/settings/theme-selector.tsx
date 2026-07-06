'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/lib/i18n';

export function ThemeSelection() {
    const { setTheme, theme } = useTheme();
    const t = useTranslations('settings');

    const [isMounted, setIsMounted] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>('system');

    useEffect(() => {
        setIsMounted(true);
        if (theme) setSelectedTheme(theme as 'light' | 'dark' | 'system');
    }, [theme]);

    const handleChangeTheme = (value: string) => {
        const next = value as 'light' | 'dark' | 'system';
        setTheme(next);
        setSelectedTheme(next);
    };

    if (!isMounted) {
        return (
            <div className="flex flex-col w-full gap-3">
                <Label className="text-base font-semibold">{t.selectTheme}</Label>
                <div className="flex flex-col md:flex-row gap-2 w-full">
                    <label htmlFor="theme-light" className="h-48 w-52 md:h-44 md:w-48 flex flex-col" aria-label={t.lightAriaLabel}>
                        <div className="items-center rounded-md border-2 border-muted p-1 hover:border-accent transition-colors w-full h-full">
                            <div className="space-y-2 rounded-sm bg-[#ecedef] p-2">
                                <div className="space-y-2 rounded-md bg-white p-2 shadow-sm">
                                    <div className="h-2 w-20 rounded-lg bg-[#ecedef]" />
                                    <div className="h-2 w-25 rounded-lg bg-[#ecedef]" />
                                </div>
                                {[...Array(2)].map((_, i) => (
                                    <div key={i} className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
                                        <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
                                        <div className="h-2 w-25 rounded-lg bg-[#ecedef]" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <span className="block w-full p-2 text-center font-normal">{t.light}</span>
                    </label>
                    <label htmlFor="theme-dark" className="h-48 w-52 md:h-44 md:w-48 flex flex-col" aria-label={t.darkAriaLabel}>
                        <div className="items-center rounded-md border-2 border-muted bg-popover p-1 hover:border-accent hover:text-accent-foreground transition-colors w-full h-full">
                            <div className="space-y-2 rounded-sm bg-slate-950 p-2">
                                <div className="space-y-2 rounded-md bg-slate-800 p-2 shadow-sm">
                                    <div className="h-2 w-20 rounded-lg bg-slate-400" />
                                    <div className="h-2 w-25 rounded-lg bg-slate-400" />
                                </div>
                                {[...Array(2)].map((_, i) => (
                                    <div key={i} className="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-sm">
                                        <div className="h-4 w-4 rounded-full bg-slate-400" />
                                        <div className="h-2 w-25 rounded-lg bg-slate-400" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <span className="block w-full p-2 text-center font-normal">{t.dark}</span>
                    </label>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full gap-3">
            <Label className="text-base font-semibold">{t.selectTheme}</Label>
            <RadioGroup value={selectedTheme} onValueChange={handleChangeTheme} className="flex flex-col md:flex-row gap-2 w-full">
                <label
                    htmlFor="theme-light"
                    className="h-48 w-52 md:h-44 md:w-48 flex flex-col [&:has([data-state=checked])>div]:border-primary cursor-pointer"
                    aria-label={t.lightAriaLabel}
                >
                    <RadioGroupItem id="theme-light" value="light" className="sr-only" />
                    <div className="items-center rounded-md border-2 border-muted p-1 hover:border-accent transition-colors w-full h-full">
                        <div className="space-y-2 rounded-sm bg-[#ecedef] p-2">
                            <div className="space-y-2 rounded-md bg-white p-2 shadow-sm">
                                <div className="h-2 w-20 rounded-lg bg-[#ecedef]" />
                                <div className="h-2 w-25 rounded-lg bg-[#ecedef]" />
                            </div>
                            {[...Array(2)].map((_, i) => (
                                <div key={i} className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
                                    <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
                                    <div className="h-2 w-25 rounded-lg bg-[#ecedef]" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <span className="block w-full p-2 text-center font-normal">{t.light}</span>
                </label>
                <label
                    htmlFor="theme-dark"
                    className="h-48 w-52 md:h-44 md:w-48 flex flex-col [&:has([data-state=checked])>div]:border-primary cursor-pointer"
                    aria-label={t.darkAriaLabel}
                >
                    <RadioGroupItem id="theme-dark" value="dark" className="sr-only" />
                    <div className="items-center rounded-md border-2 border-muted bg-popover p-1 hover:border-accent hover:text-accent-foreground transition-colors w-full h-full">
                        <div className="space-y-2 rounded-sm bg-slate-950 p-2">
                            <div className="space-y-2 rounded-md bg-slate-800 p-2 shadow-sm">
                                <div className="h-2 w-20 rounded-lg bg-slate-400" />
                                <div className="h-2 w-25 rounded-lg bg-slate-400" />
                            </div>
                            {[...Array(2)].map((_, i) => (
                                <div key={i} className="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-sm">
                                    <div className="h-4 w-4 rounded-full bg-slate-400" />
                                    <div className="h-2 w-25 rounded-lg bg-slate-400" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <span className="block w-full p-2 text-center font-normal">{t.dark}</span>
                </label>
            </RadioGroup>
        </div>
    );
}
