'use client';

import { useLocale } from '@/components/providers/locale-provider';
import { translations, type TranslationNamespace, type Translations } from './translations';

export function useTranslations<T extends TranslationNamespace>(namespace: T) {
    const { locale } = useLocale();
    return translations[locale][namespace];
}

export { translations };
export type { TranslationNamespace, Translations };
