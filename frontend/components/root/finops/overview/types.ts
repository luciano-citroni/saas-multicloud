export type FinopsJob = {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    cloudProvider: string;
    granularity: 'daily' | 'monthly';
    startDate: string;
    endDate: string;
    recordsCollected: number | null;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
};

export type FinopsDashboard = {
    totalCost: number;
    currency: string;
    topServices: Array<{ service: string; cost: number; percentage: number }>;
    costTrend: number;
    lastSyncAt: string | null;
};

export type FinopsScore = {
    score: number;
    label: string;
    components: {
        efficiency: number;
        growth: number;
        waste: number;
    };
};

export type FinopsRecommendation = {
    id: string;
    type: string;
    resourceType: string;
    resourceId: string;
    description: string;
    recommendation: string;
    potentialSaving: number | null;
    currency: string;
    priority: 'low' | 'medium' | 'high';
    status: 'open' | 'dismissed' | 'resolved';
    cloudProvider: string;
    createdAt: string;
};

export type CostByServiceItem = {
    service: string;
    currentMonthCost: number;
    previousMonthCost: number;
    change: number;
    changePercentage: number;
    trend: 'up' | 'down' | 'stable';
    currency: string;
};

export type FinopsConsent = {
    cloudAccountId: string;
    cloudProvider: string;
    accepted: boolean;
    acceptedAt: string | null;
    version: string;
    terms: string;
};

export type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

export type SidebarContextPayload = {
    organizations?: Array<{ id?: string; currentRole?: string | null }>;
};
