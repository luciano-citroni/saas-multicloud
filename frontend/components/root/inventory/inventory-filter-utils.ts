import type { InventoryPeriod } from '@/app/actions/cloud-inventory';

export const INVENTORY_PERIODS: InventoryPeriod[] = ['last6months', 'last12months', 'ytd', 'all'];

/** Default `all` so the table shows full inventory; the chart still uses last 12 months when period is `all`. */
export const DEFAULT_INVENTORY_PERIOD: InventoryPeriod = 'all';
export const DEFAULT_INVENTORY_PAGE = 1;
export const DEFAULT_INVENTORY_LIMIT = 25;

export type InventoryUrlFilters = {
    period: InventoryPeriod;
    q: string;
    resourceType: string;
    region: string;
    page: number;
    limit: number;
};

export function parseInventoryPeriod(value: string | null): InventoryPeriod {
    if (value && INVENTORY_PERIODS.includes(value as InventoryPeriod)) {
        return value as InventoryPeriod;
    }
    return DEFAULT_INVENTORY_PERIOD;
}

export function parseInventoryUrlFilters(searchParams: URLSearchParams): InventoryUrlFilters {
    const pageRaw = Number.parseInt(searchParams.get('page') ?? '', 10);
    const limitRaw = Number.parseInt(searchParams.get('limit') ?? '', 10);

    return {
        period: parseInventoryPeriod(searchParams.get('period')),
        q: searchParams.get('q')?.trim() ?? '',
        resourceType: searchParams.get('resourceType')?.trim() ?? '',
        region: searchParams.get('region')?.trim() ?? '',
        page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : DEFAULT_INVENTORY_PAGE,
        limit:
            Number.isFinite(limitRaw) && limitRaw > 0
                ? Math.min(100, limitRaw)
                : DEFAULT_INVENTORY_LIMIT,
    };
}

export function buildInventoryQuery(
    current: URLSearchParams,
    next: Partial<InventoryUrlFilters>,
): string {
    const params = new URLSearchParams(current.toString());
    const merged: InventoryUrlFilters = {
        ...parseInventoryUrlFilters(params),
        ...next,
    };

    if (merged.period === DEFAULT_INVENTORY_PERIOD) params.delete('period');
    else params.set('period', merged.period);

    if (!merged.q) params.delete('q');
    else params.set('q', merged.q);

    if (!merged.resourceType) params.delete('resourceType');
    else params.set('resourceType', merged.resourceType);

    if (!merged.region) params.delete('region');
    else params.set('region', merged.region);

    if (merged.page === DEFAULT_INVENTORY_PAGE) params.delete('page');
    else params.set('page', String(merged.page));

    if (merged.limit === DEFAULT_INVENTORY_LIMIT) params.delete('limit');
    else params.set('limit', String(merged.limit));

    return params.toString();
}
