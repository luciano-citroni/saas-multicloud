'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCloudAccount } from '@/components/root/cloud-accounts/new/form-cloud-account';
import { canManageCloudAccounts, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { fetchOrganizationCloudAccounts } from '@/app/actions/organization';
import { useTranslations } from '@/lib/i18n';

type SidebarContextPayload = {
    organizations?: Array<{
        id?: string;
        currentRole?: string | null;
        maxCloudAccounts?: number;
    }>;
};

export default function NewCloudAccountPage() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const router = useRouter();
    const tca = useTranslations('cloudAccounts');

    useEffect(() => {
        const loadPermissions = async () => {
            const orgId = window.localStorage.getItem('smc_active_organization_id');

            if (!orgId) {
                toast.error(tca.noOrgSelected);
                router.replace('/');
                return;
            }

            try {
                const response = await fetch('/api/sidebar/context', { cache: 'no-store' });
                if (!response.ok) {
                    setIsAuthorized(false);
                    toast.error(tca.validatePermissionsError);
                    router.replace('/');
                    return;
                }

                const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
                const activeOrganization = payload?.organizations?.find((organization) => organization?.id === orgId);
                const role = normalizeOrganizationRole(activeOrganization?.currentRole ?? null);
                const maxCloudAccounts = typeof activeOrganization?.maxCloudAccounts === 'number' ? activeOrganization.maxCloudAccounts : 0;

                if (!canManageCloudAccounts(role)) {
                    setIsAuthorized(false);
                    toast.error(tca.noManagePermission);
                    router.replace('/organizations');
                    return;
                }

                const accountsResponse = await fetchOrganizationCloudAccounts(orgId);
                const accountsPayload = (await accountsResponse.json().catch(() => null)) as unknown;

                if (!accountsResponse.ok) {
                    setIsAuthorized(false);
                    toast.error(tca.validateLimitError);
                    router.replace('/cloud-accounts');
                    return;
                }

                const accountItems = Array.isArray(accountsPayload)
                    ? accountsPayload
                    : accountsPayload && typeof accountsPayload === 'object' && Array.isArray((accountsPayload as { items?: unknown[] }).items)
                      ? (accountsPayload as { items: unknown[] }).items
                      : [];

                if (maxCloudAccounts > 0 && accountItems.length >= maxCloudAccounts) {
                    setIsAuthorized(false);
                    toast.error(tca.planLimitReached);
                    router.replace('/cloud-accounts');
                    return;
                }

                setOrganizationId(orgId);
                setIsAuthorized(true);
            } catch {
                setIsAuthorized(false);
                toast.error(tca.validatePermissionsError);
                router.replace('/');
            }
        };

        void loadPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    if (!organizationId || isAuthorized !== true) {
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
