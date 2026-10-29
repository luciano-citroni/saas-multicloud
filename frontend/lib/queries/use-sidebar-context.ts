'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queries/keys';
import type { SidebarContextPayload } from '@/lib/queries/types';

export async function fetchSidebarContext(): Promise<SidebarContextPayload> {
    const response = await fetch('/api/sidebar/context', { cache: 'no-store' });

    if (response.status === 401) {
        const error = new Error('UNAUTHORIZED') as Error & { status: number };
        error.status = 401;
        throw error;
    }

    if (!response.ok) {
        const error = new Error('SIDEBAR_CONTEXT_FAILED') as Error & { status: number };
        error.status = response.status;
        throw error;
    }

    const payload = (await response.json()) as Partial<SidebarContextPayload> | null;

    return {
        user: {
            id: payload?.user?.id ?? '',
            name: payload?.user?.name ?? 'Usuário',
            email: payload?.user?.email ?? '',
            emailVerified: payload?.user?.emailVerified === true,
        },
        organizations: Array.isArray(payload?.organizations) ? payload.organizations : [],
    };
}

export function useSidebarContext(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: queryKeys.sidebarContext,
        queryFn: fetchSidebarContext,
        enabled: options?.enabled !== false,
    });
}

export function useOrganizationFromSidebar(organizationId: string | null | undefined) {
    const query = useSidebarContext({ enabled: Boolean(organizationId) });

    const organization =
        organizationId && query.data
            ? (query.data.organizations.find((org) => org.id === organizationId) ?? null)
            : null;

    return {
        ...query,
        organization,
        currentRole: organization?.currentRole ?? null,
        plans: organization?.plans ?? [],
    };
}
