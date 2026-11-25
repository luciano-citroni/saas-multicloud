'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrganizationMembersTab } from '@/components/root/organizations/members/organization-members-tab';
import {
    canInviteAsOrganizationAdmin,
    canManageMembers,
    normalizeOrganizationRole,
    type OrganizationRole,
} from '@/lib/organization-rbac';
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

export default function OrganizationMembersPage() {
    const params = useParams<{ organizationId: string }>();
    const organizationId = params?.organizationId;
    const router = useRouter();
    const tm = useTranslations('members');
    const to = useTranslations('organizations');
    const sidebarQuery = useSidebarContext();
    const [canAccess, setCanAccess] = useState<boolean | null>(null);

    useEffect(() => {
        if (!organizationId) {
            toast.error(to.invalidOrg);
            router.replace('/organizations');
            return;
        }

        if (!sidebarQuery.isFetched || sidebarQuery.isLoading) {
            return;
        }

        if (sidebarQuery.isError || !sidebarQuery.data) {
            toast.error(to.validatePermissionsError);
            router.replace('/organizations');
            return;
        }

        const targetOrg = sidebarQuery.data.organizations.find((o) => o.id === organizationId);
        const role = normalizeOrganizationRole(targetOrg?.currentRole ?? null);

        if (!role) {
            toast.error(to.noEditPermission);
            router.replace('/organizations');
            return;
        }

        if (canManageMembers(role)) {
            setCanAccess(true);
            return;
        }

        let cancelled = false;
        void hasOrganizationInviteAccess(organizationId).then((allowed) => {
            if (cancelled) return;
            if (!allowed) {
                toast.error(to.noEditPermission);
                router.replace('/organizations');
                setCanAccess(false);
                return;
            }
            setCanAccess(true);
        });

        return () => {
            cancelled = true;
        };
    }, [organizationId, router, sidebarQuery.data, sidebarQuery.isError, sidebarQuery.isFetched, sidebarQuery.isLoading, to]);

    if (!organizationId || !sidebarQuery.isFetched || sidebarQuery.isLoading || !sidebarQuery.data || canAccess !== true) {
        return null;
    }

    const targetOrg = sidebarQuery.data.organizations.find((o) => o.id === organizationId);
    const currentRole = normalizeOrganizationRole(targetOrg?.currentRole ?? null) as OrganizationRole | null;

    if (!currentRole) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-4xl px-3 pb-6 pt-3 sm:px-6 sm:py-6 lg:px-8">
            <Card size="sm" className="border-border/70 shadow-xs">
                <CardHeader className="gap-2 px-3 sm:px-4">
                    <CardTitle className="text-base sm:text-lg">{tm.title}</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 px-3 pb-3 sm:px-4 sm:pb-4">
                    <OrganizationMembersTab
                        organizationId={organizationId}
                        currentRole={currentRole}
                        currentUserId={sidebarQuery.data.user.id}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
