function withOrg(path: string, organizationId: string) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}organizationId=${encodeURIComponent(organizationId)}`;
}

export type AiUsageBucket = {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    requests: number;
};

export type AiUsageOverview = {
    daily: AiUsageBucket;
    monthly: AiUsageBucket;
    byAgent: Array<AiUsageBucket & { agentType: string }>;
    byUser: Array<AiUsageBucket & { userId: string | null }>;
    engagement?: {
        daily: Record<string, number>;
        monthly: Record<string, number>;
    };
};

export type AiRoiSnapshot = {
    id: string;
    periodStart: string;
    periodEnd: string;
    potentialSaving: number;
    completedSaving: number;
    completedCount: number;
    pendingCount: number;
    currency: string;
};

export type AiQuotaSnapshot = {
    enabled: boolean;
    tier?: string;
    capabilities?: string[];
    dailyLimit: number | null;
    monthlyLimit: number | null;
    dailyUsed: number;
    monthlyUsed: number;
    dailyRemaining: number | null;
    monthlyRemaining: number | null;
    perAgentLimits: Record<string, number>;
    dailyIntelligenceEnabled?: boolean;
    notificationGroupIds?: string[];
};

export type AiRecommendation = {
    id: string;
    agentType: string;
    category: string;
    title: string;
    description: string;
    severity: string;
    priority: string;
    status: string;
    confidence: number;
    evidence?: Record<string, unknown>;
    resourceReference?: Record<string, unknown> | null;
    estimatedImpact?: Record<string, unknown> | null;
    assigneeUserId?: string | null;
    acknowledgedAt?: string | null;
    acknowledgedByUserId?: string | null;
    dismissReason?: string | null;
    createdAt: string;
    updatedAt: string;
};

export type AiDailyReport = {
    id: string;
    reportDate: string;
    summary: string;
    findings: Record<string, unknown>;
    recommendationIds: string[];
    metadata: Record<string, unknown>;
    createdAt: string;
};

export type AiDashboard = {
    score: number;
    usage: AiUsageOverview;
    quotas: AiQuotaSnapshot;
    pendingRecommendations: number;
    openAnomalies: number;
    openFindings: number;
    potentialSaving: number;
    recommendations: AiRecommendation[];
    latestDailyReport: AiDailyReport | null;
};

export async function fetchCloudIntelligenceDashboard(
    organizationId: string,
    params?: Record<string, string | undefined>,
) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
        if (value) search.set(key, value);
    }
    const qs = search.toString();
    const path = qs ? `/api/cloud-intelligence/dashboard?${qs}` : '/api/cloud-intelligence/dashboard';
    return fetch(withOrg(path, organizationId), { cache: 'no-store' });
}

export async function fetchCloudIntelligenceUsage(organizationId: string) {
    return fetch(withOrg('/api/cloud-intelligence/usage', organizationId), { cache: 'no-store' });
}

export async function fetchCloudIntelligenceQuotas(organizationId: string) {
    return fetch(withOrg('/api/cloud-intelligence/quotas', organizationId), { cache: 'no-store' });
}

export async function updateCloudIntelligenceQuotas(
    organizationId: string,
    body: Record<string, unknown>,
) {
    return fetch(withOrg('/api/cloud-intelligence/quotas', organizationId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function fetchCloudIntelligenceRecommendations(
    organizationId: string,
    params?: { status?: string; category?: string; agentType?: string },
) {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.category) search.set('category', params.category);
    if (params?.agentType) search.set('agentType', params.agentType);
    const qs = search.toString();
    const path = qs
        ? `/api/cloud-intelligence/recommendations?${qs}`
        : '/api/cloud-intelligence/recommendations';
    return fetch(withOrg(path, organizationId), { cache: 'no-store' });
}

export async function updateCloudIntelligenceRecommendationStatus(
    organizationId: string,
    recommendationId: string,
    status: string,
) {
    return fetch(
        withOrg(
            `/api/cloud-intelligence/recommendations/${encodeURIComponent(recommendationId)}`,
            organizationId,
        ),
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        },
    );
}

export async function prepareCloudIntelligenceAutomation(
    organizationId: string,
    recommendationId: string,
) {
    return fetch(
        withOrg(
            `/api/cloud-intelligence/recommendations/${encodeURIComponent(recommendationId)}/prepare-automation`,
            organizationId,
        ),
        { method: 'POST' },
    );
}

export async function executeCloudIntelligenceRecommendation(
    organizationId: string,
    recommendationId: string,
) {
    return fetch(
        withOrg(
            `/api/cloud-intelligence/recommendations/${encodeURIComponent(recommendationId)}/execute`,
            organizationId,
        ),
        { method: 'POST' },
    );
}

export async function acknowledgeCloudIntelligenceAnomaly(
    organizationId: string,
    recommendationId: string,
) {
    return fetch(
        withOrg(
            `/api/cloud-intelligence/recommendations/${encodeURIComponent(recommendationId)}/acknowledge-anomaly`,
            organizationId,
        ),
        { method: 'POST' },
    );
}

export async function fetchCloudIntelligenceDailyReports(organizationId: string) {
    return fetch(withOrg('/api/cloud-intelligence/daily-reports', organizationId), {
        cache: 'no-store',
    });
}

export async function generateCloudIntelligenceDailyReport(organizationId: string) {
    return fetch(withOrg('/api/cloud-intelligence/daily-reports/generate', organizationId), {
        method: 'POST',
    });
}

export async function fetchCloudIntelligenceDailySettings(organizationId: string) {
    return fetch(withOrg('/api/cloud-intelligence/daily-settings', organizationId), {
        cache: 'no-store',
    });
}

export async function updateCloudIntelligenceDailySettings(
    organizationId: string,
    body: { dailyIntelligenceEnabled?: boolean; notificationGroupIds?: string[] },
) {
    return fetch(withOrg('/api/cloud-intelligence/daily-settings', organizationId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export type KnowledgeDomain = 'governance' | 'finops' | 'automation' | 'general';
export type KnowledgeRole = 'guidance' | 'rule' | 'tags';

export type KnowledgeStructuredRule =
    | {
          type: 'required_tags';
          keys: string[];
          providers?: Array<'aws' | 'azure' | 'gcp'>;
          resourceTypes?: string[];
      }
    | {
          type: 'finops_threshold';
          anomalyMultiplier?: number;
          minMonthlySavingUsd?: number;
      }
    | {
          type: 'automation_playbook';
          preferredActions?: string[];
          requireHumanApproval?: boolean;
      };

export type AiKnowledgeDocument = {
    id: string;
    title: string;
    source: string;
    content: string;
    contentPreview: string;
    domain?: KnowledgeDomain;
    role?: KnowledgeRole;
    rule?: KnowledgeStructuredRule;
    hasEmbedding: boolean;
    createdAt: string;
    updatedAt: string;
};

export async function fetchCloudIntelligenceKnowledge(
    organizationId: string,
    params?: { page?: number; limit?: number },
) {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    const path = qs
        ? `/api/cloud-intelligence/knowledge?${qs}`
        : '/api/cloud-intelligence/knowledge';
    return fetch(withOrg(path, organizationId), {
        cache: 'no-store',
    });
}

export async function upsertCloudIntelligenceKnowledge(
    organizationId: string,
    body: {
        id?: string;
        title: string;
        content: string;
        source?: string;
        domain?: KnowledgeDomain;
        role?: KnowledgeRole;
        rule?: KnowledgeStructuredRule;
    },
) {
    return fetch(withOrg('/api/cloud-intelligence/knowledge', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function deleteCloudIntelligenceKnowledge(
    organizationId: string,
    documentId: string,
) {
    return fetch(
        withOrg(
            `/api/cloud-intelligence/knowledge/${encodeURIComponent(documentId)}`,
            organizationId,
        ),
        { method: 'DELETE' },
    );
}

export async function fetchCloudIntelligenceRoi(organizationId: string) {
    return fetch(withOrg('/api/cloud-intelligence/roi', organizationId), { cache: 'no-store' });
}
