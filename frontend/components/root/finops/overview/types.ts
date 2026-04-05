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
    trend: {
        currentPeriodCost: number;
        previousPeriodCost: number;
        growthAmount: number;
        growthPercentage: number;
    };
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

export type FinopsAnomaly = {
    id: string;
    cloudProvider: string;
    service: string;
    region: string;
    anomalyDate: string;
    expectedCost: number;
    actualCost: number;
    deviationPercentage: number;
    financialImpact: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'acknowledged' | 'resolved';
    currency: string;
    description: string | null;
    createdAt: string;
};

export type ForecastResult = {
    cloudAccountId: string;
    periodStart: string;
    periodEnd: string;
    forecastedCost: number;
    avgDailyCost: number;
    daysElapsed: number;
    daysRemaining: number;
    currency: string;
    confidence: 'low' | 'medium' | 'high';
    byService: Array<{ service: string; forecastedCost: number }>;
};

export type ForecastMonthProjection = {
    month: string;
    forecastedCost: number;
    currency: string;
};

export type OptimizationInsight = {
    cloudAccountId: string;
    topExpensiveServices: Array<{ service: string; cost: number; currency: string }>;
    highestGrowthService: { service: string; growthPercentage: number; cost: number } | null;
    costIncreaseReasons: string[];
    totalWaste: number;
    currency: string;
};

export type ChargebackItem = {
    groupKey: string;
    groupType: 'tag' | 'service' | 'region';
    cost: number;
    percentage: number;
    currency: string;
};

export type BillingRecord = {
    cloudAccountId: string;
    periodStart: string;
    periodEnd: string;
    cloudCost: number;
    markupPercentage: number;
    markupAmount: number;
    finalPrice: number;
    margin: number;
    marginPercentage: number;
    currency: string;
    chargebackBreakdown: ChargebackItem[] | null;
};

export type SyncRun = {
    id: string;
    cloudProvider: string;
    startDate: string;
    endDate: string;
    status: 'running' | 'completed' | 'failed' | 'partial';
    recordsUpserted: number;
    errorMessage: string | null;
    completedAt: string | null;
    triggerType: 'manual' | 'scheduled_daily' | 'scheduled_monthly_close';
    createdAt: string;
};
