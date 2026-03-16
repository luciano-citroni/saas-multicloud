'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import { Label } from '@/components/ui/label';

export function ThemeSelection() {
    const { setTheme, theme } = useTheme();

    const [isMounted, setIsMounted] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>('system');

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMounted(true);
        if (theme) setSelectedTheme(theme as 'light' | 'dark' | 'system');
    }, [theme]);

    const handleChangeTheme = (value: string) => {
        const t = value as 'light' | 'dark' | 'system';
        setTheme(t);
        setSelectedTheme(t);
    };

    if (!isMounted) {
        return (
            <div className="flex flex-col w-full gap-3">
                <Label className="text-base font-semibold">Selecione um Tema</Label>

                <div className="flex flex-col md:flex-row gap-2 w-full ">
                    <label htmlFor="theme-light" className="h-48 w-52 md:h-44 md:w-48 flex flex-col" aria-label="Tema claro">
                        <div className="items-center rounded-md border-2 border-muted p-1 hover:border-accent transition-colors w-full h-full">
                            <div className="space-y-2 rounded-sm bg-[#ecedef] p-2">
                                <div className="space-y-2 rounded-md bg-white p-2 shadow-sm">
                                    <div className="h-2 w-[80px] rounded-lg bg-[#ecedef]" />
                                    <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
                                </div>
                                {[...Array(2)].map((_, i) => (
                                    <div key={i} className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
                                        <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
                                        <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <span className="block w-full p-2 text-center font-normal">Claro</span>
                    </label>

                    {/* Dark Theme */}
                    <label htmlFor="theme-dark" className="h-48 w-52 md:h-44 md:w-48 flex flex-col" aria-label="Tema escuro">
                        <div className="items-center rounded-md border-2 border-muted bg-popover p-1 hover:border-accent hover:text-accent-foreground transition-colors w-full h-full">
                            <div className="space-y-2 rounded-sm bg-slate-950 p-2">
                                <div className="space-y-2 rounded-md bg-slate-800 p-2 shadow-sm">
                                    <div className="h-2 w-[80px] rounded-lg bg-slate-400" />
                                    <div className="h-2 w-[100px] rounded-lg bg-slate-400" />
                                </div>
                                {[...Array(2)].map((_, i) => (
                                    <div key={i} className="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-sm">
                                        <div className="h-4 w-4 rounded-full bg-slate-400" />
                                        <div className="h-2 w-[100px] rounded-lg bg-slate-400" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <span className="block w-full p-2 text-center font-normal">Escuro</span>
                    </label>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full gap-3">
            <Label className="text-base font-semibold">Selecione um Tema</Label>

            <RadioGroup value={selectedTheme} onValueChange={handleChangeTheme} className="flex flex-col md:flex-row gap-2 w-full ">
                {/* Light Theme */}
                <label
                    htmlFor="theme-light"
                    className="h-48 w-52 md:h-44 md:w-48 flex flex-col [&:has([data-state=checked])>div]:border-primary cursor-pointer"
                    aria-label="Tema claro"
                >
                    <RadioGroupItem id="theme-light" value="light" className="sr-only" />
                    <div className="items-center rounded-md border-2 border-muted p-1 hover:border-accent transition-colors w-full h-full">
                        <div className="space-y-2 rounded-sm bg-[#ecedef] p-2">
                            <div className="space-y-2 rounded-md bg-white p-2 shadow-sm">
                                <div className="h-2 w-[80px] rounded-lg bg-[#ecedef]" />
                                <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
                            </div>
                            {[...Array(2)].map((_, i) => (
                                <div key={i} className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
                                    <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
                                    <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <span className="block w-full p-2 text-center font-normal">Claro</span>
                </label>

                {/* Dark Theme */}
                <label
                    htmlFor="theme-dark"
                    className="h-48 w-52 md:h-44 md:w-48 flex flex-col [&:has([data-state=checked])>div]:border-primary cursor-pointer"
                    aria-label="Tema escuro"
                >
                    <RadioGroupItem id="theme-dark" value="dark" className="sr-only" />
                    <div className="items-center rounded-md border-2 border-muted bg-popover p-1 hover:border-accent hover:text-accent-foreground transition-colors w-full h-full">
                        <div className="space-y-2 rounded-sm bg-slate-950 p-2">
                            <div className="space-y-2 rounded-md bg-slate-800 p-2 shadow-sm">
                                <div className="h-2 w-[80px] rounded-lg bg-slate-400" />
                                <div className="h-2 w-[100px] rounded-lg bg-slate-400" />
                            </div>
                            {[...Array(2)].map((_, i) => (
                                <div key={i} className="flex items-center space-x-2 rounded-md bg-slate-800 p-2 shadow-sm">
                                    <div className="h-4 w-4 rounded-full bg-slate-400" />
                                    <div className="h-2 w-[100px] rounded-lg bg-slate-400" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <span className="block w-full p-2 text-center font-normal">Escuro</span>
                </label>
            </RadioGroup>
        </div>
    );
}
