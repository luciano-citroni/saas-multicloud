'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCloudAccountEdit } from '@/components/root/cloud-accounts/edit/form-cloud-account-edit';
import { canManageCloudAccounts, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useTranslations } from '@/lib/i18n';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';

export default function EditCloudAccountPage() {
    const params = useParams<{ cloudAccountId: string }>();
    const cloudAccountId = params?.cloudAccountId;
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const router = useRouter();
    const tca = useTranslations('cloudAccounts');
    const sidebarQuery = useSidebarContext({ enabled: Boolean(organizationId) });

    useEffect(() => {
        const orgId = window.localStorage.getItem('smc_active_organization_id');

        if (!orgId) {
            toast.error(tca.noOrgSelectedEdit);
            router.replace('/');
            return;
        }

        setOrganizationId(orgId);
    }, [router, tca.noOrgSelectedEdit]);

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

        if (!canManageCloudAccounts(role)) {
            toast.error(tca.noEditPermission);
            router.replace('/organizations');
        }
    }, [organizationId, router, sidebarQuery.data, sidebarQuery.isError, sidebarQuery.isFetched, sidebarQuery.isLoading, tca]);

    if (!cloudAccountId || !organizationId || !sidebarQuery.isFetched || sidebarQuery.isLoading || !sidebarQuery.data) {
        return null;
    }

    const activeOrganization = sidebarQuery.data.organizations.find((organization) => organization.id === organizationId);
    const role = normalizeOrganizationRole(activeOrganization?.currentRole ?? null);

    if (!canManageCloudAccounts(role)) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-5xl px-3 pb-6 pt-3 sm:px-6 sm:py-6 lg:px-8">
            <Card size="sm" className="border-border/70 shadow-xs">
                <CardHeader className="gap-2 px-3 sm:px-4">
                    <CardTitle className="text-base sm:text-lg">{tca.editAccountTitle}</CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-relaxed text-pretty">
                        {tca.editAccountDesc}
                    </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 px-3 pb-3 sm:px-4 sm:pb-4">
                    <FormCloudAccountEdit organizationId={organizationId} cloudAccountId={cloudAccountId} />
                </CardContent>
            </Card>
        </div>
    );
}
