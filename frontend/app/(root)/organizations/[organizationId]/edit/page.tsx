'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormOrganizationEdit } from '@/components/root/organizations/edit/form-organization-edit';
import { OrganizationMembersTab } from '@/components/root/organizations/members/organization-members-tab';
import { canEditOrganization, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import { useTranslations } from '@/lib/i18n';

type SidebarContextPayload = {
    organizations?: Array<{
        id?: string;
        currentRole?: string | null;
    }>;
    user?: {
        id?: string;
    };
};

export default function EditOrganizationPage() {
    const params = useParams<{ organizationId: string }>();
    const organizationId = params?.organizationId;
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
    const router = useRouter();
    const to = useTranslations('organizations');
    const tm = useTranslations('members');

    useEffect(() => {
        const loadPermissions = async () => {
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
                const targetOrganization = payload?.organizations?.find((organization) => organization?.id === organizationId);
                const role = normalizeOrganizationRole(targetOrganization?.currentRole ?? null);

                if (!canEditOrganization(role)) {
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

        void loadPermissions();
    }, [organizationId, router, to]);

    if (!organizationId || !currentRole || isAuthorized !== true) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-3xl px-3 pb-6 pt-3 sm:px-6 sm:py-6 lg:px-8">
            <Tabs defaultValue="settings">
                <TabsList className="mb-4">
                    <TabsTrigger value="settings">{to.tabSettings}</TabsTrigger>
                    <TabsTrigger value="users">{to.tabUsers}</TabsTrigger>
                </TabsList>

                <TabsContent value="settings">
                    <Card size="sm" className="border-border/70 shadow-xs">
                        <CardHeader className="gap-2 px-3 sm:px-4">
                            <CardTitle className="text-base sm:text-lg">{to.editTitle}</CardTitle>
                            <CardDescription className="max-w-2xl text-sm leading-relaxed text-pretty">
                                {to.editDesc}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="min-w-0 px-3 pb-3 sm:px-4 sm:pb-4">
                            <FormOrganizationEdit organizationId={organizationId} currentRole={currentRole} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="users">
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
                </TabsContent>
            </Tabs>
        </div>
    );
}
