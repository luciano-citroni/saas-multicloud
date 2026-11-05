import { type AppLocale, getLocale } from '@/lib/locale';

/** BCP 47 tags used by Intl for UI formatting. */
export function toIntlLocale(locale: AppLocale = getLocale()): string {
    return locale === 'en' ? 'en-US' : 'pt-BR';
}

/** HTML `lang` attribute value. */
export function toHtmlLang(locale: AppLocale = getLocale()): string {
    return locale === 'en' ? 'en' : 'pt-BR';
}

export function formatDate(
    value: string | Date | null | undefined,
    options?: Intl.DateTimeFormatOptions,
    locale?: AppLocale
): string {
    if (value == null || value === '') return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(toIntlLocale(locale), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        ...options,
    }).format(date);
}

export function formatDateTime(
    value: string | Date | null | undefined,
    options?: Intl.DateTimeFormatOptions,
    locale?: AppLocale
): string {
    if (value == null || value === '') return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(toIntlLocale(locale), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...options,
    }).format(date);
}

export function formatNumber(
    value: number,
    options?: Intl.NumberFormatOptions,
    locale?: AppLocale
): string {
    return new Intl.NumberFormat(toIntlLocale(locale), options).format(value);
}

export function formatCurrency(
    value: number,
    currency = 'USD',
    options?: Intl.NumberFormatOptions,
    locale?: AppLocale
): string {
    return new Intl.NumberFormat(toIntlLocale(locale), {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...options,
    }).format(value);
}
