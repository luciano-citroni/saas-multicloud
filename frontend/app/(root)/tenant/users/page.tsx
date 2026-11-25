'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TenantUsersPage } from '@/components/root/tenant/users/tenant-users-page';
import {
    canInviteAsOrganizationAdmin,
    canManageMembers,
    normalizeOrganizationRole,
    type OrganizationRole,
} from '@/lib/organization-rbac';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { useTranslations } from '@/lib/i18n';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';

async function hasOrganizationInviteAccess(tenantId: string): Promise<boolean> {
    try {
        const response = await fetch(`/api/orgs?organizationId=${encodeURIComponent(tenantId)}`, {
            cache: 'no-store',
        });
        if (!response.ok) return false;
        const payload = await response.json().catch(() => null);
        const items = Array.isArray(payload)
            ? payload
            : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
              ? (payload as { items: unknown[] }).items
              : [];
        const roles = items.map((item) =>
            normalizeOrganizationRole(
                typeof item === 'object' && item !== null
                    ? ((item as { currentRole?: string | null }).currentRole ?? null)
                    : null,
            ),
        );
        return canInviteAsOrganizationAdmin(roles);
    } catch {
        return false;
    }
}

export default function TenantUsers() {
    const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
    const [canAccess, setCanAccess] = useState<boolean | null>(null);
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

        if (!orgId || !role) {
            toast.error(to.noEditPermission);
            router.replace('/');
            return;
        }

        if (canManageMembers(role)) {
            setCanAccess(true);
            return;
        }

        let cancelled = false;
        void hasOrganizationInviteAccess(orgId).then((allowed) => {
            if (cancelled) return;
            if (!allowed) {
                toast.error(to.noEditPermission);
                router.replace('/');
                setCanAccess(false);
                return;
            }
            setCanAccess(true);
        });

        return () => {
            cancelled = true;
        };
    }, [activeOrgId, router, sidebarQuery.data, sidebarQuery.isError, sidebarQuery.isFetched, sidebarQuery.isLoading, to]);

    if (!sidebarQuery.isFetched || sidebarQuery.isLoading || !sidebarQuery.data || canAccess !== true) {
        return null;
    }

    const orgId = activeOrgId ?? sidebarQuery.data.organizations[0]?.id;
    const org = sidebarQuery.data.organizations.find((o) => o.id === orgId);
    const currentRole = normalizeOrganizationRole(org?.currentRole ?? null) as OrganizationRole | null;

    if (!orgId || !currentRole) {
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
