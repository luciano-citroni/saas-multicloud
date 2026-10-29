'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TenantOrganizationsPage } from '@/components/root/tenant/organizations/tenant-organizations-page';
import { canManageMembers, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';

export default function TenantOrganizations() {
    const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
    const router = useRouter();
    const sidebarQuery = useSidebarContext();

    useEffect(() => {
        setActiveOrgId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
    }, []);

    useEffect(() => {
        if (!sidebarQuery.isFetched || sidebarQuery.isLoading) {
            return;
        }

        if (sidebarQuery.isError || !sidebarQuery.data) {
            toast.error('Não foi possível validar as permissões.');
            router.replace('/');
            return;
        }

        const orgId = activeOrgId ?? sidebarQuery.data.organizations[0]?.id;
        const org = sidebarQuery.data.organizations.find((o) => o.id === orgId);
        const role = normalizeOrganizationRole(org?.currentRole ?? null);

        if (!canManageMembers(role)) {
            toast.error('Você não tem permissão para acessar esta página.');
            router.replace('/');
        }
    }, [activeOrgId, router, sidebarQuery.data, sidebarQuery.isError, sidebarQuery.isFetched, sidebarQuery.isLoading]);

    if (!sidebarQuery.isFetched || sidebarQuery.isLoading || !sidebarQuery.data) {
        return null;
    }

    const orgId = activeOrgId ?? sidebarQuery.data.organizations[0]?.id;
    const org = sidebarQuery.data.organizations.find((o) => o.id === orgId);
    const currentRole = normalizeOrganizationRole(org?.currentRole ?? null);

    if (!orgId || !canManageMembers(currentRole) || !currentRole) {
        return null;
    }

    return <TenantOrganizationsPage tenantId={orgId} currentRole={currentRole} />;
}
