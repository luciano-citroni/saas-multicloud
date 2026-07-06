'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrganizationMembersTab } from '@/components/root/organizations/members/organization-members-tab';
import { canManageMembers, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import { useTranslations } from '@/lib/i18n';

type SidebarContextPayload = {
    organizations?: Array<{ id?: string; currentRole?: string | null }>;
    user?: { id?: string };
};

export default function OrganizationMembersPage() {
    const params = useParams<{ organizationId: string }>();
    const organizationId = params?.organizationId;
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
    const router = useRouter();
    const tm = useTranslations('members');
    const to = useTranslations('organizations');

    useEffect(() => {
        const checkAccess = async () => {
            if (!organizationId) {
                toast.error(to.invalidOrg);
                router.replace('/organizations');
                return;
            }

            try {
                const response = await fetch('/api/sidebar/context', { cache: 'no-store' });

                if (!response.ok) {
                    setIsAuthorized(false);
                    toast.error(to.validatePermissionsError);
                    router.replace('/organizations');
                    return;
                }

                const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
                const targetOrg = payload?.organizations?.find((o) => o?.id === organizationId);
                const role = normalizeOrganizationRole(targetOrg?.currentRole ?? null);

                if (!canManageMembers(role)) {
                    setIsAuthorized(false);
                    toast.error(to.noEditPermission);
                    router.replace('/organizations');
                    return;
                }

                setCurrentRole(role);
                setCurrentUserId(payload?.user?.id);
                setIsAuthorized(true);
            } catch {
                setIsAuthorized(false);
                toast.error(to.validatePermissionsError);
                router.replace('/organizations');
            }
        };

        void checkAccess();
    }, [organizationId, router, to]);

    if (!organizationId || !currentRole || isAuthorized !== true) {
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
                        currentUserId={currentUserId}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
