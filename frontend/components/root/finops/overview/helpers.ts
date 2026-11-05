import type { FinopsJob, PaginationMeta } from '@/components/root/finops/overview/types';
import { getLocale } from '@/lib/locale';
import { translations } from '@/lib/i18n/translations';
import {
    formatCurrency as formatCurrencyIntl,
    formatDateTime as formatDateTimeIntl,
} from '@/lib/i18n/format';

export const DEFAULT_JOBS_PAGE = 1;
export const DEFAULT_JOBS_LIMIT = 10;
export const JOBS_LIMIT_OPTIONS = [5, 10, 20, 30] as const;

export function parsePositiveInteger(value: string | null, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeJobsLimit(value: number): number {
    return JOBS_LIMIT_OPTIONS.includes(value as (typeof JOBS_LIMIT_OPTIONS)[number]) ? value : DEFAULT_JOBS_LIMIT;
}

export function readPaginationFromLocation(): { page: number; limit: number } {
    if (typeof window === 'undefined') {
        return { page: DEFAULT_JOBS_PAGE, limit: DEFAULT_JOBS_LIMIT };
    }

    const params = new URLSearchParams(window.location.search);
    const page = parsePositiveInteger(params.get('page'), DEFAULT_JOBS_PAGE);
    const limit = normalizeJobsLimit(parsePositiveInteger(params.get('limit'), DEFAULT_JOBS_LIMIT));

    return { page, limit };
}

export function normalizeJobs(payload: unknown): FinopsJob[] {
    const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown })?.items)
          ? (payload as { items: unknown[] }).items
          : [];

    const parsedJobs = items.filter((item): item is FinopsJob => typeof (item as FinopsJob)?.id === 'string');

    return parsedJobs.sort((left, right) => {
        const leftDate = Date.parse(left.completedAt ?? left.createdAt);
        const rightDate = Date.parse(right.completedAt ?? right.createdAt);
        return rightDate - leftDate;
    });
}

export function normalizePagination(payload: unknown): PaginationMeta | null {
    const pagination = (payload as { pagination?: unknown })?.pagination;
    if (!pagination || typeof pagination !== 'object') return null;

    const page = (pagination as { page?: unknown }).page;
    const limit = (pagination as { limit?: unknown }).limit;
    const totalItems = (pagination as { totalItems?: unknown }).totalItems;
    const totalPages = (pagination as { totalPages?: unknown }).totalPages;
    const hasNextPage = (pagination as { hasNextPage?: unknown }).hasNextPage;
    const hasPreviousPage = (pagination as { hasPreviousPage?: unknown }).hasPreviousPage;

    if (
        typeof page !== 'number' ||
        typeof limit !== 'number' ||
        typeof totalItems !== 'number' ||
        typeof totalPages !== 'number' ||
        typeof hasNextPage !== 'boolean' ||
        typeof hasPreviousPage !== 'boolean'
    ) {
        return null;
    }

    return { page, limit, totalItems, totalPages, hasNextPage, hasPreviousPage };
}

export function scoreColor(score: number): string {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
}

export function scoreLabel(score: number): string {
    const t = translations[getLocale()].finops;
    if (score >= 80) return t.scoreExcellent;
    if (score >= 60) return t.scoreRegular;
    return t.scoreCritical;
}

export function priorityColor(priority: string): string {
    switch (priority) {
        case 'critical': return 'text-destructive';
        case 'high': return 'text-orange-500';
        case 'medium': return 'text-yellow-500';
        default: return 'text-muted-foreground';
    }
}

export function priorityLabel(priority: string): string {
    const locale = getLocale();
    if (locale === 'en') {
        switch (priority) {
            case 'critical':
                return 'Critical';
            case 'high':
                return 'High';
            case 'medium':
                return 'Medium';
            default:
                return 'Low';
        }
    }
    switch (priority) {
        case 'critical':
            return 'Crítica';
        case 'high':
            return 'Alta';
        case 'medium':
            return 'Média';
        default:
            return 'Baixa';
    }
}

export function formatCurrency(value: number, currency = 'USD'): string {
    return formatCurrencyIntl(value, currency);
}

export function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return formatDateTimeIntl(dateStr);
}

export function granularityLabel(granularity: string): string {
    if (getLocale() === 'en') {
        return granularity === 'daily' ? 'Daily' : 'Monthly';
    }
    return granularity === 'daily' ? 'Diária' : 'Mensal';
}

/** Impostos e taxas não são recurso — fora de gráficos de consumo. */
export function isTaxService(service: string): boolean {
    const normalized = service.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'tax' || normalized === 'taxes' || normalized === 'vat') return true;
    return /\btax(es)?\b/.test(normalized) || /\bimposto\b/.test(normalized);
}
