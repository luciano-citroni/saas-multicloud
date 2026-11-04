export async function fetchFinopsConsent(organizationId: string, cloudAccountId: string, cloudProvider: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/consent?organizationId=${encodeURIComponent(organizationId)}&cloudProvider=${encodeURIComponent(cloudProvider)}`,
        { cache: 'no-store' }
    );
}

export async function acceptFinopsConsent(organizationId: string, cloudAccountId: string, cloudProvider: string) {
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/consent?organizationId=${encodeURIComponent(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudProvider }),
    });
}

export async function revokeFinopsConsent(organizationId: string, cloudAccountId: string, cloudProvider: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/consent?organizationId=${encodeURIComponent(organizationId)}&cloudProvider=${encodeURIComponent(cloudProvider)}`,
        { method: 'DELETE' }
    );
}

export async function startFinopsSync(
    organizationId: string,
    cloudAccountId: string,
    cloudProvider: string,
    granularity: 'daily' | 'monthly',
    startDate: string,
    endDate: string
) {
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/sync?organizationId=${encodeURIComponent(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudProvider, granularity, startDate, endDate }),
    });
}

export async function fetchFinopsJobs(organizationId: string, cloudAccountId: string, page?: number, limit?: number) {
    const params = new URLSearchParams({ organizationId });
    if (page !== undefined) params.set('page', String(page));
    if (limit !== undefined) params.set('limit', String(limit));

    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/jobs?${params.toString()}`, { cache: 'no-store' });
}

export async function fetchFinopsJobStatus(organizationId: string, cloudAccountId: string, jobId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/jobs/${encodeURIComponent(jobId)}?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchFinopsDashboard(organizationId: string, cloudAccountId: string, year?: number, month?: number) {
    const params = new URLSearchParams({ organizationId });
    if (year !== undefined) params.set('year', String(year));
    if (month !== undefined) params.set('month', String(month));

    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/dashboard?${params.toString()}`, {
        cache: 'no-store',
    });
}

export async function fetchFinopsScore(organizationId: string, cloudAccountId: string, year?: number, month?: number) {
    const params = new URLSearchParams({ organizationId });
    if (year !== undefined) params.set('year', String(year));
    if (month !== undefined) params.set('month', String(month));

    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/score?${params.toString()}`, {
        cache: 'no-store',
    });
}

export async function fetchFinopsRecommendations(organizationId: string, cloudAccountId: string) {
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/recommendations?organizationId=${encodeURIComponent(organizationId)}`, {
        cache: 'no-store',
    });
}

export async function fetchFinopsSavings(organizationId: string, cloudAccountId: string) {
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/savings?organizationId=${encodeURIComponent(organizationId)}`, {
        cache: 'no-store',
    });
}

export async function fetchFinopsCostByService(organizationId: string, cloudAccountId: string, year?: number, month?: number) {
    const params = new URLSearchParams({ organizationId });
    if (year !== undefined) params.set('year', String(year));
    if (month !== undefined) params.set('month', String(month));
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/cost-by-service?${params.toString()}`, { cache: 'no-store' });
}

export async function fetchFinopsCostByResource(
    organizationId: string,
    cloudAccountId: string,
    options?: { year?: number; month?: number; service?: string; limit?: number },
) {
    const params = new URLSearchParams({ organizationId });
    if (options?.year !== undefined) params.set('year', String(options.year));
    if (options?.month !== undefined) params.set('month', String(options.month));
    if (options?.service) params.set('service', options.service);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/cost-by-resource?${params.toString()}`, {
        cache: 'no-store',
    });
}

export async function fetchFinopsAnomalyContributors(
    organizationId: string,
    cloudAccountId: string,
    anomalyId: string,
    limit?: number,
) {
    const params = new URLSearchParams({ organizationId });
    if (limit !== undefined) params.set('limit', String(limit));
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/anomalies/${encodeURIComponent(anomalyId)}/contributors?${params.toString()}`,
        { cache: 'no-store' },
    );
}

export async function fetchFinopsForecast(organizationId: string, cloudAccountId: string) {
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/forecast?organizationId=${encodeURIComponent(organizationId)}`, {
        cache: 'no-store',
    });
}

export async function fetchFinopsForecastNextMonths(organizationId: string, cloudAccountId: string, months?: number) {
    const params = new URLSearchParams({ organizationId });
    if (months !== undefined) params.set('months', String(months));
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/forecast/next-months?${params.toString()}`, { cache: 'no-store' });
}

export async function fetchFinopsAnomalies(organizationId: string, cloudAccountId: string, status?: string, days?: number) {
    const params = new URLSearchParams({ organizationId });
    if (status) params.set('status', status);
    if (days !== undefined) params.set('days', String(days));
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/anomalies?${params.toString()}`, { cache: 'no-store' });
}

export async function fetchFinopsOrgAnomalies(
    organizationId: string,
    options?: {
        status?: string;
        severity?: string;
        period?: string;
        days?: number;
        cloudAccountId?: string;
        cloudAccountIds?: string[];
        provider?: string;
        sort?: string;
        page?: number;
        limit?: number;
    },
) {
    const params = new URLSearchParams({ organizationId });
    if (options?.status) params.set('status', options.status);
    if (options?.severity && options.severity !== 'all') params.set('severity', options.severity);
    if (options?.period) params.set('period', options.period);
    if (options?.days !== undefined) params.set('days', String(options.days));
    if (options?.cloudAccountId) params.set('cloudAccountId', options.cloudAccountId);
    if (options?.cloudAccountIds?.length) params.set('cloudAccountIds', options.cloudAccountIds.join(','));
    if (options?.provider) params.set('provider', options.provider);
    if (options?.sort && options.sort !== 'severity') params.set('sort', options.sort);
    if (options?.page !== undefined) params.set('page', String(options.page));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    return fetch(`/api/finops/anomalies?${params.toString()}`, { cache: 'no-store' });
}

export async function fetchFinopsOrgSavings(
    organizationId: string,
    options?: {
        status?: string;
        priority?: string;
        cloudAccountId?: string;
        cloudAccountIds?: string[];
        provider?: string;
        q?: string;
        sort?: string;
        page?: number;
        limit?: number;
    },
) {
    const params = new URLSearchParams({ organizationId });
    if (options?.status) params.set('status', options.status);
    if (options?.priority && options.priority !== 'all') params.set('priority', options.priority);
    if (options?.cloudAccountId) params.set('cloudAccountId', options.cloudAccountId);
    if (options?.cloudAccountIds?.length) params.set('cloudAccountIds', options.cloudAccountIds.join(','));
    if (options?.provider) params.set('provider', options.provider);
    if (options?.q) params.set('q', options.q);
    if (options?.sort && options.sort !== 'saving') params.set('sort', options.sort);
    if (options?.page !== undefined) params.set('page', String(options.page));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    return fetch(`/api/finops/savings?${params.toString()}`, { cache: 'no-store' });
}

export async function acknowledgeFinopsAnomaly(organizationId: string, cloudAccountId: string, anomalyId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/anomalies/${encodeURIComponent(anomalyId)}/acknowledge?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'PATCH' }
    );
}

export type FinopsAnomalyAlertSettings = {
    id: string | null;
    organizationId: string;
    enabled: boolean;
    alertChannels: Array<'email' | 'whatsapp'>;
    alertNotificationGroupIds: string[];
    minSeverity: 'low' | 'medium' | 'high' | 'critical';
    updatedAt: string | null;
};

export type FinopsAnomalyAlertSettingsPayload = {
    enabled: boolean;
    alertChannels: Array<'email' | 'whatsapp'>;
    alertNotificationGroupIds: string[];
    minSeverity: 'low' | 'medium' | 'high' | 'critical';
};

export async function fetchFinopsAnomalyAlertSettings(organizationId: string) {
    return fetch(
        `/api/finops/anomaly-alerts/settings?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' },
    );
}

export async function updateFinopsAnomalyAlertSettings(
    organizationId: string,
    payload: FinopsAnomalyAlertSettingsPayload,
) {
    return fetch(
        `/api/finops/anomaly-alerts/settings?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        },
    );
}

export async function fetchFinopsInsights(organizationId: string, cloudAccountId: string) {
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/insights?organizationId=${encodeURIComponent(organizationId)}`, {
        cache: 'no-store',
    });
}

export async function computeFinopsBilling(organizationId: string, cloudAccountId: string, startDate: string, endDate: string, markupPercentage: number) {
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/billing/compute?organizationId=${encodeURIComponent(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, markupPercentage }),
    });
}

export async function fetchFinopsBillingHistory(organizationId: string, cloudAccountId: string, limit?: number) {
    const params = new URLSearchParams({ organizationId });
    if (limit !== undefined) params.set('limit', String(limit));
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/billing/history?${params.toString()}`, { cache: 'no-store' });
}

export async function fetchFinopsChargeback(organizationId: string, cloudAccountId: string, tagKey: string, startDate: string, endDate: string) {
    const params = new URLSearchParams({ organizationId, tagKey, startDate, endDate });
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/billing/chargeback?${params.toString()}`, { cache: 'no-store' });
}

export async function fetchFinopsSyncRuns(organizationId: string, cloudAccountId: string) {
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/sync-runs?organizationId=${encodeURIComponent(organizationId)}`, {
        cache: 'no-store',
    });
}

export async function fetchFinopsBudgetStatuses(
    organizationId: string,
    cloudAccountId: string,
    evaluationPeriod?: 'daily' | 'monthly'
) {
    const searchParams = new URLSearchParams({
        organizationId,
        limit: '100',
    });
    if (evaluationPeriod) searchParams.set('evaluationPeriod', evaluationPeriod);
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/budgets/status?${searchParams.toString()}`,
        { cache: 'no-store' }
    );
}

export async function fetchOrganizationFinopsBudgetStatuses(
    organizationId: string,
    accountCap = 8,
    evaluationPeriod?: 'daily' | 'monthly'
) {
    const searchParams = new URLSearchParams({
        organizationId,
        accountCap: String(accountCap),
        limit: '100',
    });
    if (evaluationPeriod) searchParams.set('evaluationPeriod', evaluationPeriod);

    return fetch(`/api/finops/budgets/status?${searchParams.toString()}`, {
        cache: 'no-store',
    });
}

export type FinopsBudgetPayload = {
    name: string;
    amount: number;
    currency?: string;
    period?: 'daily' | 'monthly';
    scope?: 'organization' | 'cloud_account';
    cloudAccountId?: string | null;
    service?: string | null;
    resourceId?: string | null;
    alertThresholds?: number[];
    alertFrequency?: 'daily' | 'monthly';
    alertType?: 'percentage' | 'amount' | 'resource';
    alertAmount?: number | null;
    alertChannels?: Array<'email' | 'whatsapp'>;
    alertEmails?: string[];
    alertNotificationGroupIds?: string[];
};

export async function fetchFinopsBudgets(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/budgets?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchOrganizationBudgetStatuses(
    organizationId: string,
    evaluationPeriod?: 'daily' | 'monthly'
) {
    const searchParams = new URLSearchParams({
        organizationId,
        onlyOrganization: 'true',
        limit: '100',
    });
    if (evaluationPeriod) searchParams.set('evaluationPeriod', evaluationPeriod);
    // Uses /budgets/status?onlyOrganization=true to avoid Next.js conflict with /budgets/[budgetId].
    return fetch(`/api/finops/budgets/status?${searchParams.toString()}`, {
        cache: 'no-store',
    });
}

export async function createFinopsBudget(organizationId: string, cloudAccountId: string, payload: FinopsBudgetPayload) {
    return fetch(`/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/budgets?organizationId=${encodeURIComponent(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/** Cria budget de organização ou conta via endpoint unificado. */
export async function createFinopsBudgetUnified(organizationId: string, payload: FinopsBudgetPayload) {
    return fetch(`/api/finops/budgets?organizationId=${encodeURIComponent(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function updateFinopsBudget(
    organizationId: string,
    cloudAccountId: string,
    budgetId: string,
    payload: Partial<FinopsBudgetPayload>
) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/budgets/${encodeURIComponent(budgetId)}?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
    );
}

export async function updateFinopsBudgetUnified(
    organizationId: string,
    budgetId: string,
    payload: Partial<FinopsBudgetPayload>
) {
    return fetch(
        `/api/finops/budgets/${encodeURIComponent(budgetId)}?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
    );
}

export async function deleteFinopsBudget(organizationId: string, cloudAccountId: string, budgetId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/budgets/${encodeURIComponent(budgetId)}?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'DELETE' }
    );
}

export async function deleteFinopsBudgetUnified(organizationId: string, budgetId: string) {
    return fetch(
        `/api/finops/budgets/${encodeURIComponent(budgetId)}?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'DELETE' }
    );
}

export async function fetchFinopsOrgOverview(
    organizationId: string,
    options?: {
        period?: string;
        year?: number;
        month?: number;
        anomalyDays?: number;
        cloudAccountId?: string;
    }
) {
    const params = new URLSearchParams({ organizationId });
    if (options?.period) params.set('period', options.period);
    if (options?.year !== undefined) params.set('year', String(options.year));
    if (options?.month !== undefined) params.set('month', String(options.month));
    if (options?.anomalyDays !== undefined) params.set('anomalyDays', String(options.anomalyDays));
    if (options?.cloudAccountId) params.set('cloudAccountId', options.cloudAccountId);

    return fetch(`/api/finops/overview?${params.toString()}`, { cache: 'no-store' });
}

export async function fetchFinopsOrgOptimize(
    organizationId: string,
    options?: {
        status?: string;
        days?: number;
        cloudAccountId?: string;
        page?: number;
        limit?: number;
    }
) {
    const params = new URLSearchParams({ organizationId });
    if (options?.status) params.set('status', options.status);
    if (options?.days !== undefined) params.set('days', String(options.days));
    if (options?.cloudAccountId) params.set('cloudAccountId', options.cloudAccountId);
    if (options?.page !== undefined) params.set('page', String(options.page));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));

    return fetch(`/api/finops/optimize?${params.toString()}`, { cache: 'no-store' });
}
