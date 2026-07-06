'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TenantOrganizationsPage } from '@/components/root/tenant/organizations/tenant-organizations-page';
import { canManageMembers, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';

type SidebarOrg = { id?: string; currentRole?: string | null; name?: string };
type SidebarContextPayload = { organizations?: SidebarOrg[]; user?: { id?: string } };

export default function TenantOrganizations() {
    const [ready, setReady] = useState(false);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);
    const [tenantId, setTenantId] = useState<string | undefined>(undefined);
    const router = useRouter();

    useEffect(() => {
        const checkAccess = async () => {
            try {
                const activeOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
                const response = await fetch('/api/sidebar/context', { cache: 'no-store' });

                if (!response.ok) {
                    toast.error('Não foi possível validar as permissões.');
                    router.replace('/');
                    return;
                }

                const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
                const orgId = activeOrgId ?? payload?.organizations?.[0]?.id;
                const org = payload?.organizations?.find((o) => o?.id === orgId);
                const role = normalizeOrganizationRole(org?.currentRole ?? null);

                if (!canManageMembers(role)) {
                    toast.error('Você não tem permissão para acessar esta página.');
                    router.replace('/');
                    return;
                }

                setTenantId(orgId);
                setCurrentRole(role);
                setReady(true);
            } catch {
                toast.error('Não foi possível validar as permissões.');
                router.replace('/');
            }
        };

        void checkAccess();
    }, [router]);

    if (!ready || !tenantId || !currentRole) return null;

    return <TenantOrganizationsPage tenantId={tenantId} currentRole={currentRole} />;
}
