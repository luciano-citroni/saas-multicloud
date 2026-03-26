import type { GovernanceJob, PaginationMeta } from '@/components/root/governance/overview/types';

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

export function normalizeJobs(payload: unknown): GovernanceJob[] {
    const items = Array.isArray(payload) ? payload : Array.isArray((payload as { items?: unknown })?.items) ? (payload as { items: unknown[] }).items : [];
    return items.filter((item): item is GovernanceJob => typeof (item as GovernanceJob)?.id === 'string');
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
    if (score >= 80) return 'Bom';
    if (score >= 60) return 'Regular';
    return 'Crítico';
}

export function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';

    return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
