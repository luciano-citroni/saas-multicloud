export type UserOrganization = {
    id: string;
    name: string;
    cnpj?: string | null;
    currentRole?: string | null;
    maxCloudAccounts?: number;
    maxUsers?: number;
    plans?: string[];
    createdAt?: string;
    updatedAt?: string;
};

export async function fetchUserOrganizations(options: { page?: number; limit?: number } = {}) {
    const searchParams = new URLSearchParams();

    if (typeof options.page === 'number') {
        searchParams.set('page', String(options.page));
    }

    if (typeof options.limit === 'number') {
        searchParams.set('limit', String(options.limit));
    }

    const query = searchParams.toString();
    const url = query ? `/api/organization?${query}` : '/api/organization';

    return fetch(url, {
        cache: 'no-store',
    });
}

export async function fetchUserOrganizationById(organizationId: string) {
    return fetch(`/api/organization/${encodeURIComponent(organizationId)}`, {
        cache: 'no-store',
    });
}

export async function updateUserOrganization(
    organizationId: string,
    body: {
        name?: string;
        cnpj?: string;
    }
) {
    return fetch(`/api/organization/${encodeURIComponent(organizationId)}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

export async function deleteUserOrganization(organizationId: string) {
    return fetch(`/api/organization/${encodeURIComponent(organizationId)}`, {
        method: 'DELETE',
    });
}

export async function leaveUserOrganization(organizationId: string) {
    return fetch(`/api/organization/${encodeURIComponent(organizationId)}/leave`, {
        method: 'DELETE',
    });
}

export type OrganizationCloudAccount = {
    id: string;
    alias: string;
    provider: string;
    organizationId?: string | null;
    tenantId?: string | null;
    isActive?: boolean;
    isSyncInProgress?: boolean;
    lastGeneralSyncAt?: string | null;
    lastGeneralSyncError?: string | null;
    lastGeneralSyncWarning?: string | null;
    createdAt?: string;
    updatedAt?: string;
};

export type OrganizationCloudAccountDetails = OrganizationCloudAccount & {
    credentials?: Record<string, unknown>;
};

export function isAwsProvider(provider: string | undefined | null): boolean {
    return (provider ?? '').trim().toLowerCase() === 'aws';
}

function isAzureProvider(provider: string | undefined | null): boolean {
    return (provider ?? '').trim().toLowerCase() === 'azure';
}

export function isGcpProvider(provider: string | undefined | null): boolean {
    return (provider ?? '').trim().toLowerCase() === 'gcp';
}

type FetchOrganizationCloudAccountsOptions = {
    page?: number;
    limit?: number;
    name?: string;
    isActive?: boolean;
};

export async function fetchOrganizationCloudAccounts(organizationId: string, options: FetchOrganizationCloudAccountsOptions = {}) {
    const searchParams = new URLSearchParams({
        organizationId,
    });

    if (options.name) {
        searchParams.set('name', options.name);
    }

    if (typeof options.isActive === 'boolean') {
        searchParams.set('isActive', String(options.isActive));
    }

    if (typeof options.page === 'number') {
        searchParams.set('page', String(options.page));
    }

    if (typeof options.limit === 'number') {
        searchParams.set('limit', String(options.limit));
    }

    const url = `/api/cloud/accounts?${searchParams.toString()}`;

    return fetch(url, {
        cache: 'no-store',
    });
}

export type GeneralSyncJobStatus = {
    id: string;
    status: string;
    failedReason?: string;
    createdAt?: string;
    completedAt?: string;
};

function buildGeneralSyncJobPath(provider: string, cloudAccountId: string, jobId: string): string | null {
    const normalizedProvider = (provider ?? 'aws').trim().toLowerCase();

    if (normalizedProvider === 'azure') {
        return `/api/azure/assessment/accounts/${encodeURIComponent(cloudAccountId)}/jobs/${encodeURIComponent(jobId)}`;
    }

    if (normalizedProvider === 'gcp') {
        return `/api/gcp/assessment/accounts/${encodeURIComponent(cloudAccountId)}/jobs/${encodeURIComponent(jobId)}`;
    }

    if (normalizedProvider === 'aws') {
        return `/api/aws/assessment/accounts/${encodeURIComponent(cloudAccountId)}/jobs/${encodeURIComponent(jobId)}`;
    }

    return null;
}

export async function pollGeneralSyncJobStatus(
    organizationId: string,
    cloudAccountId: string,
    jobId: string,
    provider: string
): Promise<Response> {
    const basePath = buildGeneralSyncJobPath(provider, cloudAccountId, jobId);

    if (!basePath) {
        throw new Error('Provider de sync não suportado');
    }

    const url = `${basePath}?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, { cache: 'no-store' });
}

export async function enqueueGeneralSync(organizationId: string, cloudAccountId: string, provider = 'aws') {
    let url: string;
    if (isAzureProvider(provider)) {
        url = `/api/azure/assessment/accounts/${encodeURIComponent(cloudAccountId)}?organizationId=${encodeURIComponent(organizationId)}`;
    } else if (isGcpProvider(provider)) {
        url = `/api/gcp/assessment/accounts/${encodeURIComponent(cloudAccountId)}/sync?organizationId=${encodeURIComponent(organizationId)}`;
    } else {
        url = `/api/aws/assessment/accounts/${encodeURIComponent(cloudAccountId)}/sync?organizationId=${encodeURIComponent(organizationId)}`;
    }

    return fetch(url, {
        method: 'POST',
    });
}

export async function fetchOrganizationCloudAccountById(organizationId: string, cloudAccountId: string) {
    const url = `/api/cloud/accounts/${encodeURIComponent(cloudAccountId)}?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, {
        cache: 'no-store',
    });
}

export async function updateOrganizationCloudAccount(
    organizationId: string,
    cloudAccountId: string,
    body: {
        alias?: string;
        credentials?: Record<string, unknown>;
        organizationId?: string | null;
    }
) {
    const url = `/api/cloud/accounts/${encodeURIComponent(cloudAccountId)}?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

export async function setOrganizationCloudAccountActiveStatus(organizationId: string, cloudAccountId: string, isActive: boolean) {
    const url = `/api/cloud/accounts/${encodeURIComponent(cloudAccountId)}?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive }),
    });
}

export async function deleteOrganizationCloudAccount(organizationId: string, cloudAccountId: string) {
    const url = `/api/cloud/accounts/${encodeURIComponent(cloudAccountId)}?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, {
        method: 'DELETE',
    });
}
