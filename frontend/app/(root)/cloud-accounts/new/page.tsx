'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCloudAccount } from '@/components/root/cloud-accounts/new/form-cloud-account';
import { canManageCloudAccounts, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useTranslations } from '@/lib/i18n';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';
import { useCloudAccounts } from '@/lib/queries/use-cloud-accounts';

export default function NewCloudAccountPage() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const router = useRouter();
    const tca = useTranslations('cloudAccounts');
    const sidebarQuery = useSidebarContext({ enabled: Boolean(organizationId) });
    const accountsQuery = useCloudAccounts(organizationId);

    useEffect(() => {
        const orgId = window.localStorage.getItem('smc_active_organization_id');

        if (!orgId) {
            toast.error(tca.noOrgSelected);
            router.replace('/');
            return;
        }

        setOrganizationId(orgId);
    }, [router, tca.noOrgSelected]);

    useEffect(() => {
        if (!organizationId || !sidebarQuery.isFetched || sidebarQuery.isLoading) {
            return;
        }

        if (sidebarQuery.isError || !sidebarQuery.data) {
            toast.error(tca.validatePermissionsError);
            router.replace('/');
            return;
        }

        const activeOrganization = sidebarQuery.data.organizations.find((organization) => organization.id === organizationId);
        const role = normalizeOrganizationRole(activeOrganization?.currentRole ?? null);
        const maxCloudAccounts = activeOrganization?.maxCloudAccounts ?? 0;

        if (!canManageCloudAccounts(role)) {
            toast.error(tca.noManagePermission);
            router.replace('/organizations');
            return;
        }

        if (!accountsQuery.isFetched || accountsQuery.isLoading) {
            return;
        }

        if (accountsQuery.isError) {
            toast.error(tca.validateLimitError);
            router.replace('/cloud-accounts');
            return;
        }

        if (maxCloudAccounts > 0 && (accountsQuery.data?.length ?? 0) >= maxCloudAccounts) {
            toast.error(tca.planLimitReached);
            router.replace('/cloud-accounts');
        }
    }, [
        accountsQuery.data,
        accountsQuery.isError,
        accountsQuery.isFetched,
        accountsQuery.isLoading,
        organizationId,
        router,
        sidebarQuery.data,
        sidebarQuery.isError,
        sidebarQuery.isFetched,
        sidebarQuery.isLoading,
        tca,
    ]);

    if (!organizationId || !sidebarQuery.isFetched || sidebarQuery.isLoading || !sidebarQuery.data) {
        return null;
    }

    if (!accountsQuery.isFetched || accountsQuery.isLoading) {
        return null;
    }

    const activeOrganization = sidebarQuery.data.organizations.find((organization) => organization.id === organizationId);
    const role = normalizeOrganizationRole(activeOrganization?.currentRole ?? null);
    const maxCloudAccounts = activeOrganization?.maxCloudAccounts ?? 0;

    if (!canManageCloudAccounts(role)) {
        return null;
    }

    if (maxCloudAccounts > 0 && (accountsQuery.data?.length ?? 0) >= maxCloudAccounts) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>{tca.newAccountTitle}</CardTitle>
                    <CardDescription>{tca.newAccountDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormCloudAccount organizationId={organizationId} />
                </CardContent>
            </Card>
        </div>
    );
}
