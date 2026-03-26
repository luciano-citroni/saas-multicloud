'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCloudAccount } from '@/components/root/cloud-accounts/new/form-cloud-account';
import { canManageCloudAccounts, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { fetchOrganizationCloudAccounts } from '@/app/actions/organization';

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

    useEffect(() => {
        const loadPermissions = async () => {
            const orgId = window.localStorage.getItem('smc_active_organization_id');

            if (!orgId) {
                toast.error('Selecione uma organização antes de conectar uma conta cloud.');
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
                const maxCloudAccounts = typeof activeOrganization?.maxCloudAccounts === 'number' ? activeOrganization.maxCloudAccounts : 0;

                if (!canManageCloudAccounts(role)) {
                    setIsAuthorized(false);
                    toast.error('Apenas OWNER ou ADMIN pode conectar contas cloud.');
                    router.replace('/organizations');
                    return;
                }

                const accountsResponse = await fetchOrganizationCloudAccounts(orgId);
                const accountsPayload = (await accountsResponse.json().catch(() => null)) as unknown;

                if (!accountsResponse.ok) {
                    setIsAuthorized(false);
                    toast.error('Não foi possível validar o limite de contas cloud da organização.');
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
                    toast.error('O limite de contas cloud do plano atual foi atingido.');
                    router.replace('/cloud-accounts');
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
                    <CardTitle>Conectar nova Conta Cloud</CardTitle>
                    <CardDescription>Adicione uma conta cloud à sua organização para começar a gerenciar recursos.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormCloudAccount organizationId={organizationId} />
                </CardContent>
            </Card>
        </div>
    );
}
