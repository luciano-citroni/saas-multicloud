export async function startGovernanceScan(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/governance/accounts/${encodeURIComponent(cloudAccountId)}/scan?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'POST' }
    );
}

export async function fetchGovernanceJobs(
    organizationId: string,
    cloudAccountId: string,
    options?: {
        page?: number;
        limit?: number;
    }
) {
    const page = options?.page;
    const limit = options?.limit;
    const query = new URLSearchParams({ organizationId });

    if (page && Number.isInteger(page) && page > 0) {
        query.set('page', String(page));
    }

    if (limit && Number.isInteger(limit) && limit > 0) {
        query.set('limit', String(limit));
    }

    return fetch(
        `/api/governance/accounts/${encodeURIComponent(cloudAccountId)}/jobs?${query.toString()}`,
        { cache: 'no-store' }
    );
}

export async function fetchGovernanceJobStatus(organizationId: string, cloudAccountId: string, jobId: string) {
    return fetch(
        `/api/governance/accounts/${encodeURIComponent(cloudAccountId)}/jobs/${encodeURIComponent(jobId)}?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchGovernanceJobFindings(
    organizationId: string,
    cloudAccountId: string,
    jobId: string,
    options?: {
        page?: number;
        limit?: number;
        name?: string;
        resourceType?: string;
        severity?: string;
    }
) {
    const query = new URLSearchParams({ organizationId });

    if (options?.page && Number.isInteger(options.page) && options.page > 0) {
        query.set('page', String(options.page));
    }

    if (options?.limit && Number.isInteger(options.limit) && options.limit > 0) {
        query.set('limit', String(options.limit));
    }

    if (options?.name?.trim()) {
        query.set('name', options.name.trim());
    }

    if (options?.resourceType?.trim()) {
        query.set('resourceType', options.resourceType.trim());
    }

    if (options?.severity?.trim()) {
        query.set('severity', options.severity.trim());
    }

    return fetch(`/api/governance/accounts/${encodeURIComponent(cloudAccountId)}/jobs/${encodeURIComponent(jobId)}/findings?${query.toString()}`, {
        cache: 'no-store',
    });
}

export async function fetchGovernanceScore(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/governance/accounts/${encodeURIComponent(cloudAccountId)}/score?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}
