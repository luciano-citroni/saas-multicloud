'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TenantUsersPage } from '@/components/root/tenant/users/tenant-users-page';
import { canManageMembers, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { useTranslations } from '@/lib/i18n';

type SidebarOrg = { id?: string; currentRole?: string | null; name?: string };

type SidebarContextPayload = {
    organizations?: SidebarOrg[];
    user?: { id?: string };
};

export default function TenantUsers() {
    const [ready, setReady] = useState(false);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
    const [organizationId, setOrganizationId] = useState<string | undefined>(undefined);
    const [organizationName, setOrganizationName] = useState('');
    const router = useRouter();
    const to = useTranslations('organizations');

    useEffect(() => {
        const checkAccess = async () => {
            try {
                const activeOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
                const response = await fetch('/api/sidebar/context', { cache: 'no-store' });

                if (!response.ok) {
                    toast.error(to.validatePermissionsError);
                    router.replace('/');
                    return;
                }

                const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
                const orgId = activeOrgId ?? payload?.organizations?.[0]?.id;
                const org = payload?.organizations?.find((o) => o?.id === orgId);
                const role = normalizeOrganizationRole(org?.currentRole ?? null);

                if (!canManageMembers(role)) {
                    toast.error(to.noEditPermission);
                    router.replace('/');
                    return;
                }

                setOrganizationId(orgId);
                setOrganizationName(org?.name ?? '');
                setCurrentRole(role);
                setCurrentUserId(payload?.user?.id);
                setReady(true);
            } catch {
                toast.error(to.validatePermissionsError);
                router.replace('/');
            }
        };

        void checkAccess();
    }, [router, to]);

    if (!ready || !organizationId || !currentRole) return null;

    return (
        <TenantUsersPage
            organizationId={organizationId}
            organizationName={organizationName}
            currentRole={currentRole}
            currentUserId={currentUserId}
        />
    );
}
