export type AppLocale = 'en' | 'pt';

export const LOCALE_STORAGE_KEY = 'smc_locale';

const DEFAULT_LOCALE: AppLocale =
    (process.env.NEXT_PUBLIC_APP_LOCALE as AppLocale | undefined) === 'en' ? 'en' : 'pt';

let _locale: AppLocale = DEFAULT_LOCALE;

export function getLocale(): AppLocale {
    return _locale;
}

export function setLocale(locale: AppLocale): void {
    _locale = locale;
}

export { DEFAULT_LOCALE };
