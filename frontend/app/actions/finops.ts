export async function fetchFinopsConsent(organizationId: string, cloudAccountId: string, cloudProvider: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/consent?organizationId=${encodeURIComponent(organizationId)}&cloudProvider=${encodeURIComponent(cloudProvider)}`,
        { cache: 'no-store' }
    );
}

export async function acceptFinopsConsent(organizationId: string, cloudAccountId: string, cloudProvider: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/consent?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cloudProvider }),
        }
    );
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
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/sync?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cloudProvider, granularity, startDate, endDate }),
        }
    );
}

export async function fetchFinopsJobs(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/jobs?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchFinopsJobStatus(organizationId: string, cloudAccountId: string, jobId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/jobs/${encodeURIComponent(jobId)}?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchFinopsDashboard(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/dashboard?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchFinopsScore(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/score?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchFinopsRecommendations(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/recommendations?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchFinopsSavings(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/savings?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchFinopsCostByService(
    organizationId: string,
    cloudAccountId: string,
    year?: number,
    month?: number,
) {
    const params = new URLSearchParams({ organizationId });
    if (year !== undefined) params.set('year', String(year));
    if (month !== undefined) params.set('month', String(month));
    return fetch(
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/cost-by-service?${params.toString()}`,
        { cache: 'no-store' }
    );
}
