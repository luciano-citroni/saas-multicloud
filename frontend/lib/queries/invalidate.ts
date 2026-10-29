import type { QueryClient } from '@tanstack/react-query';
import {
    ACTIVE_ORG_CHANGED_EVENT,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
} from '@/lib/sidebar-context';
import { queryKeys } from '@/lib/queries/keys';

export function invalidateSidebarContext(queryClient: QueryClient) {
    return queryClient.invalidateQueries({ queryKey: queryKeys.sidebarContext });
}

export function invalidateCloudAccounts(queryClient: QueryClient, organizationId?: string) {
    if (organizationId) {
        return queryClient.invalidateQueries({ queryKey: queryKeys.cloudAccounts(organizationId) });
    }

    return queryClient.invalidateQueries({ queryKey: ['cloud-accounts'] });
}

/** Wire window events → query invalidation. Call once from QueryProvider. */
export function bindQueryInvalidationToSidebarEvents(queryClient: QueryClient) {
    const onSidebarUpdated = () => {
        void invalidateSidebarContext(queryClient);
        void invalidateCloudAccounts(queryClient);
    };

    const onOrgChanged = () => {
        void invalidateCloudAccounts(queryClient);
    };

    window.addEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, onSidebarUpdated);
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged);

    return () => {
        window.removeEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, onSidebarUpdated);
        window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged);
    };
}
