export type InventoryPeriod = 'thismonth' | 'last6months' | 'last12months' | 'ytd' | 'all';

export type InventoryResource = {
    id: string;
    name: string;
    resourceType: string;
    region: string | null;
    status: string | null;
    /** Provider birth date when known; null when only DB sync time exists. */
    createdAt: string | null;
    provider: 'aws' | 'azure' | 'gcp';
    attributes?: Record<string, string | null>;
    tags?: Record<string, string>;
};

export type InventoryMonthlyPoint = {
    month: string;
    count: number;
};

export type InventoryOverview = {
    totalResources: number;
    newThisMonth: number;
    byType: Record<string, number>;
    regions: string[];
    tags: string[];
    resourceTypes: string[];
    monthlyNew: InventoryMonthlyPoint[];
    provider: 'aws' | 'azure' | 'gcp';
    cloudAccountId: string;
    cloudAccountAlias: string;
};

export type InventoryResourcesFacets = {
    regions: string[];
    tags: string[];
};

export type InventoryResourcesResponse = {
    items: InventoryResource[];
    pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    facets?: InventoryResourcesFacets;
    /** Counts by type after tag/region/name filters (selected type ignored). */
    byType?: Record<string, number>;
};

export type InventoryResourcesQuery = {
    q?: string;
    resourceType?: string;
    region?: string;
    tag?: string;
    period?: InventoryPeriod;
    page?: number;
    limit?: number;
};

function buildQuery(organizationId: string, filters: InventoryResourcesQuery = {}) {
    const params = new URLSearchParams();
    params.set('organizationId', organizationId);
    if (filters.q) params.set('q', filters.q);
    if (filters.resourceType) params.set('resourceType', filters.resourceType);
    if (filters.region) params.set('region', filters.region);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.period) params.set('period', filters.period);
    if (typeof filters.page === 'number') params.set('page', String(filters.page));
    if (typeof filters.limit === 'number') params.set('limit', String(filters.limit));
    return params.toString();
}

export async function fetchInventoryOverview(
    organizationId: string,
    cloudAccountId: string,
    period: InventoryPeriod = 'all',
) {
    const params = new URLSearchParams({
        organizationId,
        period,
    });
    return fetch(
        `/api/cloud/inventory/accounts/${encodeURIComponent(cloudAccountId)}/overview?${params.toString()}`,
        { cache: 'no-store' },
    );
}

export async function fetchInventoryResources(
    organizationId: string,
    cloudAccountId: string,
    filters: InventoryResourcesQuery = {},
) {
    const query = buildQuery(organizationId, filters);
    return fetch(
        `/api/cloud/inventory/accounts/${encodeURIComponent(cloudAccountId)}/resources?${query}`,
        { cache: 'no-store' },
    );
}
