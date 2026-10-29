'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TenantUsersPage } from '@/components/root/tenant/users/tenant-users-page';
import { canManageMembers, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { useTranslations } from '@/lib/i18n';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';

export default function TenantUsers() {
    const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
    const router = useRouter();
    const to = useTranslations('organizations');
    const sidebarQuery = useSidebarContext();

    useEffect(() => {
        setActiveOrgId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
    }, []);

    useEffect(() => {
        if (!sidebarQuery.isFetched || sidebarQuery.isLoading) {
            return;
        }

        if (sidebarQuery.isError || !sidebarQuery.data) {
            toast.error(to.validatePermissionsError);
            router.replace('/');
            return;
        }

        const orgId = activeOrgId ?? sidebarQuery.data.organizations[0]?.id;
        const org = sidebarQuery.data.organizations.find((o) => o.id === orgId);
        const role = normalizeOrganizationRole(org?.currentRole ?? null);

        if (!canManageMembers(role)) {
            toast.error(to.noEditPermission);
            router.replace('/');
        }
    }, [activeOrgId, router, sidebarQuery.data, sidebarQuery.isError, sidebarQuery.isFetched, sidebarQuery.isLoading, to]);

    if (!sidebarQuery.isFetched || sidebarQuery.isLoading || !sidebarQuery.data) {
        return null;
    }

    const orgId = activeOrgId ?? sidebarQuery.data.organizations[0]?.id;
    const org = sidebarQuery.data.organizations.find((o) => o.id === orgId);
    const currentRole = normalizeOrganizationRole(org?.currentRole ?? null);

    if (!orgId || !currentRole || !canManageMembers(currentRole)) {
        return null;
    }

    return (
        <TenantUsersPage
            organizationId={orgId}
            organizationName={org?.name ?? ''}
            currentRole={currentRole}
            currentUserId={sidebarQuery.data.user.id}
        />
    );
}
