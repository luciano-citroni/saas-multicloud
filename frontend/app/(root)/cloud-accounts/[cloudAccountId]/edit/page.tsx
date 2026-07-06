'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCloudAccountEdit } from '@/components/root/cloud-accounts/edit/form-cloud-account-edit';
import { canManageCloudAccounts, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useTranslations } from '@/lib/i18n';

type SidebarContextPayload = {
    organizations?: Array<{
        id?: string;
        currentRole?: string | null;
    }>;
};

export default function EditCloudAccountPage() {
    const params = useParams<{ cloudAccountId: string }>();
    const cloudAccountId = params?.cloudAccountId;
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const router = useRouter();
    const tca = useTranslations('cloudAccounts');

    useEffect(() => {
        const loadPermissions = async () => {
            const orgId = window.localStorage.getItem('smc_active_organization_id');

            if (!orgId) {
                toast.error(tca.noOrgSelectedEdit);
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

                if (!canManageCloudAccounts(role)) {
                    setIsAuthorized(false);
                    toast.error(tca.noEditPermission);
                    router.replace('/organizations');
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

    if (!cloudAccountId || !organizationId || isAuthorized !== true) {
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
