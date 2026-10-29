'use client';

import { useQuery } from '@tanstack/react-query';
import {
    fetchOrganizationCloudAccounts,
    type OrganizationCloudAccount,
} from '@/app/actions/organization';
import { queryKeys } from '@/lib/queries/keys';

function unwrapAccounts(payload: unknown): OrganizationCloudAccount[] {
    if (Array.isArray(payload)) {
        return payload as OrganizationCloudAccount[];
    }

    if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
        return (payload as { items: OrganizationCloudAccount[] }).items;
    }

    return [];
}

async function fetchCloudAccounts(organizationId: string): Promise<OrganizationCloudAccount[]> {
    const response = await fetchOrganizationCloudAccounts(organizationId, { page: 1, limit: 100 });

    if (response.status === 401) {
        const error = new Error('UNAUTHORIZED') as Error & { status: number };
        error.status = 401;
        throw error;
    }

    if (!response.ok) {
        const error = new Error('CLOUD_ACCOUNTS_FAILED') as Error & { status: number };
        error.status = response.status;
        throw error;
    }

    return unwrapAccounts(await response.json());
}

export function useCloudAccounts(organizationId: string | null | undefined, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.cloudAccounts(organizationId ?? ''),
        queryFn: () => fetchCloudAccounts(organizationId as string),
        enabled: Boolean(organizationId) && options?.enabled !== false,
    });
}
