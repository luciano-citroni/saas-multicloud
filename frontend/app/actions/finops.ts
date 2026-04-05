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

export async function acknowledgeFinopsAnomaly(organizationId: string, cloudAccountId: string, anomalyId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/anomalies/${encodeURIComponent(anomalyId)}/acknowledge?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'PATCH' }
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
