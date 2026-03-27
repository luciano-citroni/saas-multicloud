'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Cloudy, GitBranch, LayoutDashboard, ShieldCheck, DollarSign } from 'lucide-react';
import { AccountSwitcher } from '@/components/sidebar/account-switcher';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { NavMain } from '@/components/sidebar/nav-main';
import { NavUser } from '@/components/sidebar/nav-user';
import { toast } from 'sonner';
import {
    ACTIVE_ORG_STORAGE_KEY,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
    notifyActiveCloudAccountChanged,
    notifyActiveOrganizationChanged,
} from '@/lib/sidebar-context';
import { hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';

const baseData = {
    navMain: [
        {
            title: 'Dashboard',
            url: '/',
            icon: LayoutDashboard,
        },
        {
            title: 'Contas Cloud',
            url: '/cloud-accounts',
            icon: Cloudy,
        },
        {
            title: 'Organização',
            url: '/organizations',
            icon: Building2,
        },
        {
            title: 'Assessment',
            url: '/assessment',
            icon: GitBranch,
            module: PlanModule.ASSESSMENT,
        },
        {
            title: 'Governança',
            url: '/governance',
            icon: ShieldCheck,
            module: PlanModule.GOVERNANCE,
        },
        {
            title: 'FinOps',
            url: '/finops',
            icon: DollarSign,
            module: PlanModule.FINOPS,
        },
    ],
};

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

type SidebarCloudAccount = {
    id: string;
    alias: string;
    provider: string;
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

function normalizeCloudAccountsPayload(payload: SidebarCloudAccount[] | SidebarCloudAccountsResponse): SidebarCloudAccount[] {
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];

    return items.filter(
        (cloudAccount) => typeof cloudAccount?.id === 'string' && typeof cloudAccount?.alias === 'string' && typeof cloudAccount?.provider === 'string'
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
    const [loading, setLoading] = React.useState(true);
    const [user, setUser] = React.useState<SidebarUser | null>(null);
    const [organizations, setOrganizations] = React.useState<SidebarOrganization[]>([]);
    const [cloudAccounts, setCloudAccounts] = React.useState<SidebarCloudAccount[]>([]);
    const [activeOrganizationId, setActiveOrganizationId] = React.useState<string | undefined>(undefined);
    const [activeCloudAccountId, setActiveCloudAccountId] = React.useState<string | undefined>(undefined);
    const [activeOrganizationModules, setActiveOrganizationModules] = React.useState<string[]>([]);

    React.useEffect(() => {
        const storedOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (storedOrganizationId) {
            setActiveOrganizationId(storedOrganizationId);
        }
    }, []);

    const loadCloudAccounts = React.useCallback(
        async (organizationId: string) => {
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
                    toast.error('Não foi possível carregar as contas cloud.');
                    return;
                }

                const payload = (await response.json()) as SidebarCloudAccount[] | SidebarCloudAccountsResponse;
                const cloudAccountsList = normalizeCloudAccountsPayload(payload);

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
                    return;
                }

                window.localStorage.setItem(cloudStorageKey, validStoredCloudAccountId);
                window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, validStoredCloudAccountId);
                setActiveCloudAccountId(validStoredCloudAccountId);
            } catch {
                setCloudAccounts([]);
                setActiveCloudAccountId(undefined);
                toast.error('Não foi possível carregar as contas cloud.');
            }
        },
        [router]
    );

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
                toast.error('Não foi possível carregar os dados da sidebar.');
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
                setActiveOrganizationId(undefined);
                setActiveOrganizationModules([]);
                setCloudAccounts([]);
                setActiveCloudAccountId(undefined);
                return;
            }

            window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, validStoredOrganization);
            setActiveOrganizationId(validStoredOrganization);
            const activeOrganization = nextOrganizations.find((organization) => organization.id === validStoredOrganization);
            setActiveOrganizationModules(normalizePlanModules(activeOrganization?.plans ?? []));
            await loadCloudAccounts(validStoredOrganization);
        } catch {
            toast.error('Não foi possível carregar os dados da sidebar.');
        } finally {
            setLoading(false);
        }
    }, [loadCloudAccounts, router]);

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

    const handleOrganizationChange = React.useCallback(
        (organization: { id: string }) => {
            window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, organization.id);
            notifyActiveOrganizationChanged();
            setActiveOrganizationId(organization.id);
            const selectedOrganization = organizations.find((item) => item.id === organization.id);
            setActiveOrganizationModules(normalizePlanModules(selectedOrganization?.plans ?? []));
            setCloudAccounts([]);
            setActiveCloudAccountId(undefined);
            void loadCloudAccounts(organization.id);
        },
        [loadCloudAccounts, organizations]
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
            toast.error('Não foi possível sair da conta.');
        }
    }, [router]);

    const navItems = React.useMemo(() => {
        return baseData.navMain.map((item) => {
            if (!('module' in item) || !item.module || !activeOrganizationId) {
                return item;
            }

            const enabled = hasModuleAccess(activeOrganizationModules, item.module);

            return {
                ...item,
                disabled: !enabled,
                disabledReason: enabled ? undefined : 'Módulo não habilitado no plano atual da organização',
            };
        });
    }, [activeOrganizationId, activeOrganizationModules]);

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <AccountSwitcher
                    organizations={organizations}
                    activeOrganizationId={activeOrganizationId}
                    cloudAccounts={cloudAccounts}
                    activeCloudAccountId={activeCloudAccountId}
                    onOrganizationChange={handleOrganizationChange}
                    onCloudAccountChange={handleCloudAccountChange}
                />
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={navItems} />
            </SidebarContent>
            <SidebarFooter>
                <NavUser loading={loading} user={user ?? undefined} onLogout={handleLogout} />
            </SidebarFooter>
        </Sidebar>
    );
}
