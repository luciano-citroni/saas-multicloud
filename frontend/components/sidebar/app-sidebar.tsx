'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Cloud, GitBranch, LayoutDashboard, Layers, Plus, ShieldCheck, DollarSign, Users, Workflow } from 'lucide-react';
import { AccountSwitcher } from '@/components/sidebar/account-switcher';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { NavMain } from '@/components/sidebar/nav-main';
import { NavUser } from '@/components/sidebar/nav-user';
import { toast } from 'sonner';
import {
    ACTIVE_ORG_MODULES_STORAGE_KEY,
    ACTIVE_ORG_STORAGE_KEY,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
    notifyActiveCloudAccountChanged,
    notifyActiveOrganizationChanged,
} from '@/lib/sidebar-context';
import { hasAutomationModuleAccess, hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';
import { canManageMembers, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useTranslations } from '@/lib/i18n';

const ACTIVE_CLOUD_STORAGE_KEY_PREFIX = 'smc_active_cloud_account_id:';
const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const ACTIVE_MID_ORG_STORAGE_KEY_PREFIX = 'smc_active_mid_org_id:';

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

type BackendOrganization = {
    id?: string;
    name?: string;
    currentRole?: string;
    current_role?: string;
    maxCloudAccounts?: number;
    maxUsers?: number;
    max_cloud_accounts?: number;
    max_users?: number;
    plans?: unknown;
};

type SidebarMidOrgsResponse = SidebarMidOrg[] | { items?: SidebarMidOrg[] };

type SidebarCloudAccountsResponse = {
    items?: SidebarCloudAccount[];
};

type SidebarContextResponse = {
    user: SidebarUser;
    organizations: SidebarOrganization[];
};

type OrganizationsApiResponse =
    | BackendOrganization[]
    | {
          items?: BackendOrganization[];
      };

function getCloudStorageKey(organizationId: string) {
    return `${ACTIVE_CLOUD_STORAGE_KEY_PREFIX}${organizationId}`;
}

function getMidOrgStorageKey(tenantId: string) {
    return `${ACTIVE_MID_ORG_STORAGE_KEY_PREFIX}${tenantId}`;
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

function parseOrganizationPlans(plans: unknown): string[] {
    const normalize = (values: string[]) => {
        const normalized = values.map((value) => value.trim().toLowerCase()).filter(Boolean);

        if (normalized.includes('*')) {
            return ['*'];
        }

        return Array.from(new Set(normalized));
    };

    if (Array.isArray(plans)) {
        return normalize(plans.filter((entry): entry is string => typeof entry === 'string'));
    }

    if (typeof plans !== 'string') {
        return [];
    }

    const raw = plans.trim();

    if (!raw) {
        return [];
    }

    if (raw === '*') {
        return ['*'];
    }

    if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
            const parsed = JSON.parse(raw) as unknown;

            if (Array.isArray(parsed)) {
                return normalize(parsed.filter((entry): entry is string => typeof entry === 'string'));
            }
        } catch {
            return normalize(raw.split(','));
        }
    }

    if (raw.startsWith('{') && raw.endsWith('}')) {
        const entries = raw
            .slice(1, -1)
            .split(',')
            .map((entry) => entry.replace(/^"|"$/g, '').trim())
            .filter(Boolean);

        return normalize(entries);
    }

    return normalize(raw.split(','));
}

function toSlug(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function normalizeOrganizationsPayload(payload: OrganizationsApiResponse | null | undefined): SidebarOrganization[] {
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];

    return items
        .filter((organization): organization is BackendOrganization => typeof organization?.id === 'string' && typeof organization?.name === 'string')
        .map((organization) => ({
            id: organization.id as string,
            name: organization.name as string,
            slug: toSlug(organization.name as string),
            currentRole:
                typeof organization.currentRole === 'string'
                    ? organization.currentRole
                    : typeof organization.current_role === 'string'
                      ? organization.current_role
                      : null,
            maxCloudAccounts:
                typeof organization.maxCloudAccounts === 'number'
                    ? organization.maxCloudAccounts
                    : typeof organization.max_cloud_accounts === 'number'
                      ? organization.max_cloud_accounts
                      : 0,
            maxUsers:
                typeof organization.maxUsers === 'number'
                    ? organization.maxUsers
                    : typeof organization.max_users === 'number'
                      ? organization.max_users
                      : 0,
            plans: parseOrganizationPlans(organization.plans),
        }));
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const router = useRouter();
    const tn = useTranslations('nav');
    const [loading, setLoading] = React.useState(true);
    const [user, setUser] = React.useState<SidebarUser | null>(null);
    const [organizations, setOrganizations] = React.useState<SidebarOrganization[]>([]);
    const [cloudAccounts, setCloudAccounts] = React.useState<SidebarCloudAccount[]>([]);
    const [activeOrganizationId, setActiveOrganizationId] = React.useState<string | undefined>(undefined);
    const [midOrgs, setMidOrgs] = React.useState<SidebarMidOrg[]>([]);
    const [activeMidOrgId, setActiveMidOrgId] = React.useState<string | undefined>(undefined);
    const [activeCloudAccountId, setActiveCloudAccountId] = React.useState<string | undefined>(undefined);
    const [activeOrganizationModules, setActiveOrganizationModules] = React.useState<string[]>([]);

    React.useEffect(() => {
        const storedOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (storedOrganizationId) {
            setActiveOrganizationId(storedOrganizationId);
        }
    }, []);

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
                const allCloudAccounts = normalizeCloudAccountsPayload(payload);
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
            } catch {
                setCloudAccounts([]);
                setActiveCloudAccountId(undefined);
                window.localStorage.removeItem(ACTIVE_CLOUD_GLOBAL_KEY);
                notifyActiveCloudAccountChanged();
                toast.error(tn.loadCloudError);
            }
        },
        [router, tn]
    );

    const loadMidOrgs = React.useCallback(async (tenantId: string) => {
        try {
            const response = await fetch(`/api/orgs?organizationId=${encodeURIComponent(tenantId)}`, {
                cache: 'no-store',
            });

            if (!response.ok) {
                setMidOrgs([]);
                setActiveMidOrgId(undefined);
                return undefined;
            }

            const payload = (await response.json()) as SidebarMidOrgsResponse;
            const list = normalizeMidOrgsPayload(payload);
            setMidOrgs(list);

            const key = getMidOrgStorageKey(tenantId);
            const stored = window.localStorage.getItem(key);
            const valid = stored && list.some((o) => o.id === stored) ? stored : list[0]?.id;

            if (!valid) {
                setActiveMidOrgId(undefined);
                window.localStorage.removeItem(key);
                return undefined;
            }

            window.localStorage.setItem(key, valid);
            setActiveMidOrgId(valid);
            return valid;
        } catch {
            setMidOrgs([]);
            setActiveMidOrgId(undefined);
            return undefined;
        }
    }, []);

    const loadSidebarContext = React.useCallback(async () => {
        setLoading(true);

        try {
            const response = await fetch('/api/sidebar/context', {
                cache: 'no-store',
            });

            if (response.status === 401) {
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            if (!response.ok) {
                toast.error(tn.loadSidebarError);
                return;
            }

            const payload = (await response.json()) as SidebarContextResponse;
            setUser(payload.user);

            let nextOrganizations = payload.organizations ?? [];

            if (nextOrganizations.length === 0) {
                const organizationsResponse = await fetch('/api/organization?page=1&limit=100', {
                    cache: 'no-store',
                });

                if (organizationsResponse.ok) {
                    const organizationsPayload = (await organizationsResponse.json().catch(() => null)) as OrganizationsApiResponse | null;

                    nextOrganizations = normalizeOrganizationsPayload(organizationsPayload);
                }
            }

            setOrganizations(nextOrganizations);

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
                return;
            }

            window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, validStoredOrganization);
            setActiveOrganizationId(validStoredOrganization);
            const activeOrganization = nextOrganizations.find((organization) => organization.id === validStoredOrganization);
            const activeModules = normalizePlanModules(activeOrganization?.plans ?? []);
            setActiveOrganizationModules(activeModules);
            window.localStorage.setItem(ACTIVE_ORG_MODULES_STORAGE_KEY, JSON.stringify(activeModules));
            const selectedMidOrgId = await loadMidOrgs(validStoredOrganization);
            await loadCloudAccounts(validStoredOrganization, selectedMidOrgId);
        } catch {
            toast.error(tn.loadSidebarError);
        } finally {
            setLoading(false);
        }
    }, [loadCloudAccounts, loadMidOrgs, router, tn]);

    React.useEffect(() => {
        void loadSidebarContext();
    }, [loadSidebarContext]);

    React.useEffect(() => {
        const handleSidebarContextUpdated = () => {
            void loadSidebarContext();
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key && event.key !== ACTIVE_ORG_STORAGE_KEY) {
                return;
            }

            void loadSidebarContext();
        };

        window.addEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, handleSidebarContextUpdated);
        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, handleSidebarContextUpdated);
            window.removeEventListener('storage', handleStorage);
        };
    }, [loadSidebarContext]);

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
            void loadMidOrgs(tenant.id).then((selectedMidOrgId) => {
                void loadCloudAccounts(tenant.id, selectedMidOrgId);
            });
        },
        [loadCloudAccounts, loadMidOrgs, organizations]
    );

    const handleMidOrgChange = React.useCallback(
        (org: SidebarMidOrg) => {
            if (!activeOrganizationId) return;
            const key = getMidOrgStorageKey(activeOrganizationId);
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
            { title: tn.plans, url: '/billing', icon: DollarSign },
            ...(canManage
                ? [
                      { title: tn.groups, url: '/tenant/organizations', icon: Layers },
                      { title: tn.users, url: '/tenant/users', icon: Users },
                  ]
                : []),
            { title: tn.tenants, url: '/tenant', icon: Layers },
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
