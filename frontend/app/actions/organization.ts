export type OrganizationCloudAccount = {
    id: string;
    alias: string;
    provider: string;
    isActive?: boolean;
    isSyncInProgress?: boolean;
    lastGeneralSyncAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
};

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

    const url = `/api/cloud/accounts?${searchParams.toString()}`;

    return fetch(url, {
        cache: 'no-store',
    });
}

export async function enqueueGeneralSync(organizationId: string, cloudAccountId: string, provider = 'aws') {
    const url =
        provider === 'azure'
            ? `/api/azure/assessment/accounts/${encodeURIComponent(cloudAccountId)}?organizationId=${encodeURIComponent(organizationId)}`
            : `/api/aws/assessment/accounts/${encodeURIComponent(cloudAccountId)}/sync?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, {
        method: 'POST',
    });
}
