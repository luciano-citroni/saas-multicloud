'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Cloud, GitBranch, LayoutDashboard, Layers, Plus, ShieldCheck, DollarSign, Users, Workflow } from 'lucide-react';
import { AccountSwitcher } from '@/components/sidebar/account-switcher';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { NavMain } from '@/components/sidebar/nav-main';
import { NavUser } from '@/components/sidebar/nav-user';
import { toast } from 'sonner';
import {
    ACTIVE_ORG_MODULES_STORAGE_KEY,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgStorageKey,
    notifyActiveCloudAccountChanged,
    notifyActiveOrganizationChanged,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
} from '@/lib/sidebar-context';
import { hasAutomationModuleAccess, hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';
import { canManageMembers, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useTranslations } from '@/lib/i18n';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';
import type { SidebarContextOrganization } from '@/lib/queries/types';

const ACTIVE_CLOUD_STORAGE_KEY_PREFIX = 'smc_active_cloud_account_id:';
const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

type SidebarUser = {
    id: string;
    name: string;
    email: string;
};

type SidebarOrganization = {
    id: string;
    name: string;
    slug: string;
    currentRole?: string | null;
    maxCloudAccounts: number;
    maxUsers: number;
    plans: string[];
};

type SidebarMidOrg = {
    id: string;
    name: string;
};

type SidebarCloudAccount = {
    id: string;
    alias: string;
    provider: string;
    organizationId?: string | null;
};

type SidebarMidOrgsResponse = SidebarMidOrg[] | { items?: SidebarMidOrg[] };

type SidebarCloudAccountsResponse = {
    items?: SidebarCloudAccount[];
};

function getCloudStorageKey(organizationId: string) {
    return `${ACTIVE_CLOUD_STORAGE_KEY_PREFIX}${organizationId}`;
}

function normalizeMidOrgsPayload(payload: SidebarMidOrgsResponse): SidebarMidOrg[] {
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    return items.filter((o): o is SidebarMidOrg => typeof o?.id === 'string' && typeof o?.name === 'string');
}

function normalizeCloudAccountsPayload(payload: SidebarCloudAccount[] | SidebarCloudAccountsResponse): SidebarCloudAccount[] {
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];

    return items.filter(
        (cloudAccount) =>
            typeof cloudAccount?.id === 'string' &&
            typeof cloudAccount?.alias === 'string' &&
            typeof cloudAccount?.provider === 'string' &&
            (cloudAccount.organizationId === undefined || cloudAccount.organizationId === null || typeof cloudAccount.organizationId === 'string')
    );
}

function toSidebarOrganizations(organizations: SidebarContextOrganization[]): SidebarOrganization[] {
    return organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug ?? organization.id,
        currentRole: organization.currentRole ?? null,
        maxCloudAccounts: organization.maxCloudAccounts ?? 0,
        maxUsers: organization.maxUsers ?? 0,
        plans: normalizePlanModules(organization.plans ?? []),
    }));
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const router = useRouter();
    const tn = useTranslations('nav');
    const sidebarQuery = useSidebarContext();
    const [cloudAccounts, setCloudAccounts] = React.useState<SidebarCloudAccount[]>([]);
    const [activeOrganizationId, setActiveOrganizationId] = React.useState<string | undefined>(undefined);
    const [midOrgs, setMidOrgs] = React.useState<SidebarMidOrg[]>([]);
    const [activeMidOrgId, setActiveMidOrgId] = React.useState<string | undefined>(undefined);
    const [activeCloudAccountId, setActiveCloudAccountId] = React.useState<string | undefined>(undefined);
    const [activeOrganizationModules, setActiveOrganizationModules] = React.useState<string[]>([]);
    const [orgShellLoading, setOrgShellLoading] = React.useState(false);

    const user = sidebarQuery.data?.user ?? null;
    const organizations = React.useMemo(
        () => toSidebarOrganizations(sidebarQuery.data?.organizations ?? []),
        [sidebarQuery.data?.organizations]
    );
    const loading = sidebarQuery.isLoading || orgShellLoading;

    React.useEffect(() => {
        const storedOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (storedOrganizationId) {
            setActiveOrganizationId(storedOrganizationId);
        }
    }, []);

    React.useEffect(() => {
        if (sidebarQuery.error && (sidebarQuery.error as Error & { status?: number }).status === 401) {
            router.replace('/auth/sign-in');
            router.refresh();
        }
    }, [router, sidebarQuery.error]);

    React.useEffect(() => {
        if (sidebarQuery.isError && (sidebarQuery.error as Error & { status?: number }).status !== 401) {
            toast.error(tn.loadSidebarError);
        }
    }, [sidebarQuery.error, sidebarQuery.isError, tn.loadSidebarError]);

    const applyCloudAccounts = React.useCallback(
        (organizationId: string, allCloudAccounts: SidebarCloudAccount[], activeMidOrganizationId?: string) => {
            const cloudAccountsList = activeMidOrganizationId
                ? allCloudAccounts.filter((cloudAccount) => cloudAccount.organizationId === activeMidOrganizationId)
                : allCloudAccounts;

            setCloudAccounts(cloudAccountsList);

            const cloudStorageKey = getCloudStorageKey(organizationId);
            const storedCloudAccountId = window.localStorage.getItem(cloudStorageKey) ?? window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);

            const validStoredCloudAccountId =
                storedCloudAccountId && cloudAccountsList.some((cloudAccount) => cloudAccount.id === storedCloudAccountId)
                    ? storedCloudAccountId
                    : cloudAccountsList[0]?.id;

            if (!validStoredCloudAccountId) {
                setActiveCloudAccountId(undefined);
                window.localStorage.removeItem(cloudStorageKey);
                window.localStorage.removeItem(ACTIVE_CLOUD_GLOBAL_KEY);
                notifyActiveCloudAccountChanged();
                return;
            }

            window.localStorage.setItem(cloudStorageKey, validStoredCloudAccountId);
            window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, validStoredCloudAccountId);
            setActiveCloudAccountId(validStoredCloudAccountId);
            notifyActiveCloudAccountChanged();
        },
        []
    );

    const loadOrgShell = React.useCallback(
        async (organizationId: string) => {
            setOrgShellLoading(true);

            try {
                const [midOrgsResponse, accountsResponse] = await Promise.all([
                    fetch(`/api/orgs?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' }),
                    fetch(`/api/cloud/accounts?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' }),
                ]);

                if (accountsResponse.status === 401 || midOrgsResponse.status === 401) {
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                let selectedMidOrgId: string | undefined;

                if (midOrgsResponse.ok) {
                    const payload = (await midOrgsResponse.json()) as SidebarMidOrgsResponse;
                    const list = normalizeMidOrgsPayload(payload);
                    setMidOrgs(list);

                    const key = getActiveMidOrgStorageKey(organizationId);
                    const stored = window.localStorage.getItem(key);
                    selectedMidOrgId = stored && list.some((o) => o.id === stored) ? stored : list[0]?.id;

                    if (!selectedMidOrgId) {
                        setActiveMidOrgId(undefined);
                        window.localStorage.removeItem(key);
                    } else {
                        window.localStorage.setItem(key, selectedMidOrgId);
                        setActiveMidOrgId(selectedMidOrgId);
                    }
                } else {
                    setMidOrgs([]);
                    setActiveMidOrgId(undefined);
                }

                if (!accountsResponse.ok) {
                    setCloudAccounts([]);
                    setActiveCloudAccountId(undefined);
                    toast.error(tn.loadCloudError);
                    return;
                }

                const accountsPayload = (await accountsResponse.json()) as SidebarCloudAccount[] | SidebarCloudAccountsResponse;
                applyCloudAccounts(organizationId, normalizeCloudAccountsPayload(accountsPayload), selectedMidOrgId);
            } catch {
                setMidOrgs([]);
                setActiveMidOrgId(undefined);
                setCloudAccounts([]);
                setActiveCloudAccountId(undefined);
                toast.error(tn.loadCloudError);
            } finally {
                setOrgShellLoading(false);
            }
        },
        [applyCloudAccounts, router, tn.loadCloudError]
    );

    const loadCloudAccounts = React.useCallback(
        async (organizationId: string, activeMidOrganizationId?: string) => {
            try {
                const response = await fetch(`/api/cloud/accounts?organizationId=${encodeURIComponent(organizationId)}`, {
                    cache: 'no-store',
                });

                if (response.status === 401) {
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!response.ok) {
                    setCloudAccounts([]);
                    setActiveCloudAccountId(undefined);
                    toast.error(tn.loadCloudError);
                    return;
                }

                const payload = (await response.json()) as SidebarCloudAccount[] | SidebarCloudAccountsResponse;
                applyCloudAccounts(organizationId, normalizeCloudAccountsPayload(payload), activeMidOrganizationId);
            } catch {
                setCloudAccounts([]);
                setActiveCloudAccountId(undefined);
                window.localStorage.removeItem(ACTIVE_CLOUD_GLOBAL_KEY);
                notifyActiveCloudAccountChanged();
                toast.error(tn.loadCloudError);
            }
        },
        [applyCloudAccounts, router, tn.loadCloudError]
    );

    React.useEffect(() => {
        if (!sidebarQuery.isSuccess || !sidebarQuery.data) {
            return;
        }

        const nextOrganizations = toSidebarOrganizations(sidebarQuery.data.organizations);
        const storedOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const validStoredOrganization =
            storedOrganizationId && nextOrganizations.some((organization) => organization.id === storedOrganizationId)
                ? storedOrganizationId
                : nextOrganizations[0]?.id;

        if (!validStoredOrganization) {
            window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
            window.localStorage.removeItem(ACTIVE_ORG_MODULES_STORAGE_KEY);
            setActiveOrganizationId(undefined);
            setActiveOrganizationModules([]);
            setCloudAccounts([]);
            setActiveCloudAccountId(undefined);
            setMidOrgs([]);
            setActiveMidOrgId(undefined);
            return;
        }

        window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, validStoredOrganization);
        setActiveOrganizationId(validStoredOrganization);
        const activeOrganization = nextOrganizations.find((organization) => organization.id === validStoredOrganization);
        const activeModules = normalizePlanModules(activeOrganization?.plans ?? []);
        setActiveOrganizationModules(activeModules);
        window.localStorage.setItem(ACTIVE_ORG_MODULES_STORAGE_KEY, JSON.stringify(activeModules));
        void loadOrgShell(validStoredOrganization);
    }, [loadOrgShell, sidebarQuery.data, sidebarQuery.isSuccess]);

    React.useEffect(() => {
        const handleStorage = (event: StorageEvent) => {
            if (event.key && event.key !== ACTIVE_ORG_STORAGE_KEY) {
                return;
            }

            void sidebarQuery.refetch();
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [sidebarQuery]);

    React.useEffect(() => {
        if (!activeOrganizationId) {
            return;
        }

        const handleContextUpdated = () => {
            void loadOrgShell(activeOrganizationId);
        };

        window.addEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, handleContextUpdated);
        return () => window.removeEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, handleContextUpdated);
    }, [activeOrganizationId, loadOrgShell]);

    const handleTenantChange = React.useCallback(
        (tenant: { id: string }) => {
            window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, tenant.id);
            notifyActiveOrganizationChanged();
            setActiveOrganizationId(tenant.id);
            const selectedOrganization = organizations.find((item) => item.id === tenant.id);
            const tenantModules = normalizePlanModules(selectedOrganization?.plans ?? []);
            setActiveOrganizationModules(tenantModules);
            window.localStorage.setItem(ACTIVE_ORG_MODULES_STORAGE_KEY, JSON.stringify(tenantModules));
            setMidOrgs([]);
            setActiveMidOrgId(undefined);
            setCloudAccounts([]);
            setActiveCloudAccountId(undefined);
            void loadOrgShell(tenant.id);
        },
        [loadOrgShell, organizations]
    );

    const handleMidOrgChange = React.useCallback(
        (org: SidebarMidOrg) => {
            if (!activeOrganizationId) return;
            const key = getActiveMidOrgStorageKey(activeOrganizationId);
            window.localStorage.setItem(key, org.id);
            setActiveMidOrgId(org.id);
            void loadCloudAccounts(activeOrganizationId, org.id);
        },
        [activeOrganizationId, loadCloudAccounts]
    );

    const handleCloudAccountChange = React.useCallback(
        (cloudAccount: SidebarCloudAccount) => {
            if (!activeOrganizationId) {
                return;
            }

            const cloudStorageKey = getCloudStorageKey(activeOrganizationId);
            window.localStorage.setItem(cloudStorageKey, cloudAccount.id);
            window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, cloudAccount.id);
            setActiveCloudAccountId(cloudAccount.id);
            notifyActiveCloudAccountChanged();
        },
        [activeOrganizationId]
    );

    const handleLogout = React.useCallback(async () => {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
            });

            router.replace('/auth/sign-in');
            router.refresh();
        } catch {
            toast.error(tn.logoutError);
        }
    }, [router, tn]);

    const { dashboardItems, cloudNavItems, tenantItems, moduleItems, showTenant } = React.useMemo(() => {
        const activeOrg = organizations.find((o) => o.id === activeOrganizationId);
        const activeRole = normalizeOrganizationRole(activeOrg?.currentRole ?? null);
        const canManage = canManageMembers(activeRole);

        const dashboard = [{ title: tn.dashboard, url: '/', icon: LayoutDashboard }];

        const cloudNav = [
            { title: tn.newCloudAccount, url: '/cloud-accounts/new', icon: Plus },
            { title: tn.cloudAccounts, url: '/cloud-accounts', icon: Cloud },
        ];

        const tenant = [
            { title: tn.newTenant, url: '/tenant/new', icon: Plus },
            { title: tn.tenants, url: '/tenant', icon: Layers },
            ...(canManage
                ? [
                      { title: tn.groups, url: '/tenant/organizations', icon: Layers },
                      { title: tn.users, url: '/tenant/users', icon: Users },
                      { title: tn.notifications, url: '/tenant/notifications', icon: Bell },
                  ]
                : []),
            { title: tn.plans, url: '/billing', icon: DollarSign },
        ];

        const modules = [
            { title: tn.assessment, url: '/assessment', icon: GitBranch, module: PlanModule.ASSESSMENT },
            { title: tn.governance, url: '/governance', icon: ShieldCheck, module: PlanModule.GOVERNANCE },
            { title: tn.finops, url: '/finops', icon: DollarSign, module: PlanModule.FINOPS },
            { title: tn.automation, url: '/automations', icon: Workflow, module: PlanModule.AUTOMATION },
        ].map((item) => {
            if (!activeOrganizationId) {
                return { ...item, disabled: true, disabledReason: tn.moduleNotEnabled };
            }

            if (!item.module) return item;
            const enabled =
                item.module === PlanModule.AUTOMATION
                    ? hasAutomationModuleAccess(activeOrganizationModules)
                    : hasModuleAccess(activeOrganizationModules, item.module);
            return { ...item, disabled: !enabled, disabledReason: enabled ? undefined : tn.moduleNotEnabled };
        });

        return { dashboardItems: dashboard, cloudNavItems: cloudNav, tenantItems: tenant, moduleItems: modules, showTenant: true };
    }, [activeOrganizationId, activeOrganizationModules, organizations, tn]);

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <AccountSwitcher
                    loading={loading}
                    tenants={organizations}
                    activeTenantId={activeOrganizationId}
                    midOrgs={midOrgs}
                    activeMidOrgId={activeMidOrgId}
                    cloudAccounts={cloudAccounts}
                    activeCloudAccountId={activeCloudAccountId}
                    createTenantHref="/tenant/new"
                    createMidOrgHref="/tenant/organizations/new"
                    createCloudAccountHref="/cloud-accounts/new"
                    onTenantChange={handleTenantChange}
                    onMidOrgChange={handleMidOrgChange}
                    onCloudAccountChange={handleCloudAccountChange}
                />
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={[...dashboardItems, ...moduleItems]} />
                <NavMain items={cloudNavItems} label={tn.cloudAccounts} />

                {showTenant && <NavMain items={tenantItems} label={tn.tenant} />}
            </SidebarContent>
            <SidebarFooter>
                <NavUser loading={loading} user={user ?? undefined} onLogout={handleLogout} />
            </SidebarFooter>
        </Sidebar>
    );
}
