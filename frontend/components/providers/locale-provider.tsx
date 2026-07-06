'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { type AppLocale, DEFAULT_LOCALE, LOCALE_STORAGE_KEY, setLocale } from '@/lib/locale';

type LocaleContextValue = {
    locale: AppLocale;
    changeLocale: (locale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue>({
    locale: DEFAULT_LOCALE,
    changeLocale: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);

    useEffect(() => {
        const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as AppLocale | null;
        const resolved: AppLocale = stored === 'en' || stored === 'pt' ? stored : DEFAULT_LOCALE;
        setLocaleState(resolved);
        setLocale(resolved);
    }, []);

    const changeLocale = useCallback((next: AppLocale) => {
        localStorage.setItem(LOCALE_STORAGE_KEY, next);
        setLocale(next);
        setLocaleState(next);
    }, []);

    return <LocaleContext.Provider value={{ locale, changeLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
    return useContext(LocaleContext);
}
