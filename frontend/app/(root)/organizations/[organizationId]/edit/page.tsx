'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormOrganizationEdit } from '@/components/root/organizations/edit/form-organization-edit';
import { canDeleteOrganization, canEditOrganization, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';

type SidebarContextPayload = {
    organizations?: Array<{
        id?: string;
        currentRole?: string | null;
    }>;
};

export default function EditOrganizationPage() {
    const params = useParams<{ organizationId: string }>();
    const organizationId = params?.organizationId;
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);
    const router = useRouter();

    useEffect(() => {
        const loadPermissions = async () => {
            if (!organizationId) {
                toast.error('Organização inválida.');
                router.replace('/organizations');
                return;
            }

            try {
                const response = await fetch('/api/sidebar/context', { cache: 'no-store' });

                if (!response.ok) {
                    setIsAuthorized(false);
                    toast.error('Não foi possível validar suas permissões.');
                    router.replace('/organizations');
                    return;
                }

                const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
                const targetOrganization = payload?.organizations?.find((organization) => organization?.id === organizationId);
                const role = normalizeOrganizationRole(targetOrganization?.currentRole ?? null);

                if (!canEditOrganization(role)) {
                    setIsAuthorized(false);
                    toast.error('Apenas admin ou owner podem editar esta organização.');
                    router.replace('/organizations');
                    return;
                }

                setCurrentRole(role);
                setIsAuthorized(true);
            } catch {
                setIsAuthorized(false);
                toast.error('Não foi possível validar suas permissões.');
                router.replace('/organizations');
            }
        };

        void loadPermissions();
    }, [organizationId, router]);

    if (!organizationId || !currentRole || isAuthorized !== true) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-2xl px-3 pb-6 pt-3 sm:px-6 sm:py-6 lg:px-8">
            <Card size="sm" className="border-border/70 shadow-xs">
                <CardHeader className="gap-2 px-3 sm:px-4">
                    <CardTitle className="text-base sm:text-lg">Editar organização</CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-relaxed text-pretty">
                        Atualize os dados cadastrais da organização. Admin e owner podem editar; somente owner pode excluir.
                    </CardDescription>
                </CardHeader>
                <CardContent className="min-w-0 px-3 pb-3 sm:px-4 sm:pb-4">
                    <FormOrganizationEdit organizationId={organizationId} currentRole={currentRole} />
                </CardContent>
            </Card>
        </div>
    );
}
