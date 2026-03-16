'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, GitBranch, LayoutDashboard } from 'lucide-react';
import { AccountSwitcher } from '@/components/sidebar/account-switcher';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { NavMain } from '@/components/sidebar/nav-main';
import { NavUser } from '@/components/sidebar/nav-user';
import { toast } from 'sonner';
import { ACTIVE_ORG_STORAGE_KEY, SIDEBAR_CONTEXT_UPDATED_EVENT } from '@/lib/sidebar-context';
import { hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';

const baseData = {
    navMain: [
        {
            title: 'Dashboard',
            url: '/',
            icon: LayoutDashboard,
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

type SidebarContextResponse = {
    user: SidebarUser;
    organizations: SidebarOrganization[];
};

function getCloudStorageKey(organizationId: string) {
    return `${ACTIVE_CLOUD_STORAGE_KEY_PREFIX}${organizationId}`;
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
                    toast.error('Não foi possível carregar as cloud accounts.');
                    return;
                }

                const payload = (await response.json()) as SidebarCloudAccount[];
                const nextCloudAccounts = Array.isArray(payload)
                    ? payload.filter(
                          (cloudAccount) =>
                              typeof cloudAccount?.id === 'string' && typeof cloudAccount?.alias === 'string' && typeof cloudAccount?.provider === 'string'
                      )
                    : [];

                setCloudAccounts(nextCloudAccounts);

                const cloudStorageKey = getCloudStorageKey(organizationId);
                const storedCloudAccountId = window.localStorage.getItem(cloudStorageKey) ?? window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);

                const validStoredCloudAccountId =
                    storedCloudAccountId && nextCloudAccounts.some((cloudAccount) => cloudAccount.id === storedCloudAccountId)
                        ? storedCloudAccountId
                        : nextCloudAccounts[0]?.id;

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
                toast.error('Não foi possível carregar as cloud accounts.');
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
            setOrganizations(payload.organizations ?? []);

            const storedOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);

            const validStoredOrganization =
                storedOrganizationId && payload.organizations?.some((organization) => organization.id === storedOrganizationId)
                    ? storedOrganizationId
                    : payload.organizations?.[0]?.id;

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
            const activeOrganization = payload.organizations?.find((organization) => organization.id === validStoredOrganization);
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
