'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCloudAccount } from '@/components/root/cloud-accounts/new/form-cloud-account';
import { canManageCloudAccounts, normalizeOrganizationRole } from '@/lib/organization-rbac';

type SidebarContextPayload = {
    organizations?: Array<{
        id?: string;
        currentRole?: string | null;
    }>;
};

export default function NewCloudAccountPage() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const router = useRouter();

    useEffect(() => {
        const loadPermissions = async () => {
            const orgId = window.localStorage.getItem('smc_active_organization_id');

            if (!orgId) {
                toast.error('Selecione uma organização antes de conectar uma cloud account.');
                router.replace('/');
                return;
            }

            try {
                const response = await fetch('/api/sidebar/context', { cache: 'no-store' });
                if (!response.ok) {
                    setIsAuthorized(false);
                    toast.error('Não foi possível validar suas permissões.');
                    router.replace('/');
                    return;
                }

                const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
                const activeOrganization = payload?.organizations?.find((organization) => organization?.id === orgId);
                const role = normalizeOrganizationRole(activeOrganization?.currentRole ?? null);

                if (!canManageCloudAccounts(role)) {
                    setIsAuthorized(false);
                    toast.error('Apenas OWNER ou ADMIN pode conectar cloud accounts.');
                    router.replace('/organizations');
                    return;
                }

                setOrganizationId(orgId);
                setIsAuthorized(true);
            } catch {
                setIsAuthorized(false);
                toast.error('Não foi possível validar suas permissões.');
                router.replace('/');
            }
        };

        void loadPermissions();
    }, [router]);

    if (!organizationId || isAuthorized !== true) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>Conectar nova cloud account</CardTitle>
                    <CardDescription>Adicione uma conta de cloud à sua organização para começar a gerenciar recursos.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormCloudAccount organizationId={organizationId} />
                </CardContent>
            </Card>
        </div>
    );
}
