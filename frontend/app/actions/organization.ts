export type OrganizationCloudAccount = {
    id: string;
    alias: string;
    provider: string;
    isActive?: boolean;
    lastGeneralSyncAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
};

export async function fetchOrganizationCloudAccounts(organizationId: string) {
    const url = `/api/cloud/accounts?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, {
        cache: 'no-store',
    });
}

export async function enqueueGeneralSync(organizationId: string, cloudAccountId: string) {
    const url = `/api/aws/assessment/accounts/${encodeURIComponent(cloudAccountId)}/sync?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, {
        method: 'POST',
    });
}