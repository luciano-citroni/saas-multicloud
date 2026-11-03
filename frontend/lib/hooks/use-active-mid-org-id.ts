'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';

/**
 * Active mid-org (Organização) for the given tenant.
 * Reacts to mid-org and tenant changes from the sidebar.
 */
export function useActiveMidOrgId(tenantId: string | null | undefined): string | null {
    const [midOrgId, setMidOrgId] = useState<string | null>(() => getActiveMidOrgId(tenantId));

    const sync = useCallback(() => {
        setMidOrgId(getActiveMidOrgId(tenantId));
    }, [tenantId]);

    useEffect(() => {
        sync();

        const onMidOrgChanged = () => sync();
        const onOrgChanged = () => sync();
        const onStorage = (event: StorageEvent) => {
            if (!tenantId) {
                return;
            }
            if (event.key === null || event.key.includes('smc_active_mid_org_id') || event.key === 'smc_active_organization_id') {
                sync();
            }
        };

        window.addEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, onMidOrgChanged);
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged);
        window.addEventListener('storage', onStorage);

        return () => {
            window.removeEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, onMidOrgChanged);
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged);
            window.removeEventListener('storage', onStorage);
        };
    }, [sync, tenantId]);

    return midOrgId;
}
