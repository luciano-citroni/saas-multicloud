'use client';

import * as React from 'react';
import Link from 'next/link';
import { Building2, Check, ChevronsUpDown, Cloud, Plus, Search } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';

type OrganizationItem = {
    id: string;
    name: string;
    slug: string;
};

type CloudAccountItem = {
    id: string;
    alias: string;
    provider: string;
};

const PLACEHOLDER_ORGANIZATION: OrganizationItem = {
    id: 'none',
    name: 'Nenhuma organização',
    slug: '',
};

type AccountSwitcherProps = {
    organizations: OrganizationItem[];
    activeOrganizationId?: string;
    cloudAccounts?: CloudAccountItem[];
    activeCloudAccountId?: string;
    createOrganizationHref?: string;
    createCloudAccountHref?: string;
    onOrganizationChange?: (organization: OrganizationItem) => void;
    onCloudAccountChange?: (cloudAccount: CloudAccountItem) => void;
};

export function AccountSwitcher({
    organizations,
    activeOrganizationId,
    cloudAccounts = [],
    activeCloudAccountId,
    createOrganizationHref = '/organizations/new',
    createCloudAccountHref = '/cloud-accounts/new',
    onOrganizationChange,
    onCloudAccountChange,
}: AccountSwitcherProps) {
    const { isMobile } = useSidebar();
    const [selectedOrganizationId, setSelectedOrganizationId] = React.useState<string | undefined>(activeOrganizationId ?? organizations[0]?.id);
    const [selectedCloudAccountId, setSelectedCloudAccountId] = React.useState<string | undefined>(activeCloudAccountId ?? cloudAccounts[0]?.id);
    const [orgSearch, setOrgSearch] = React.useState('');
    const [cloudSearch, setCloudSearch] = React.useState('');

    React.useEffect(() => {
        if (activeOrganizationId) {
            setSelectedOrganizationId(activeOrganizationId);
        }
    }, [activeOrganizationId]);

    React.useEffect(() => {
        if (activeCloudAccountId) {
            setSelectedCloudAccountId(activeCloudAccountId);
            return;
        }

        if (!cloudAccounts.length) {
            setSelectedCloudAccountId(undefined);
        }
    }, [activeCloudAccountId, cloudAccounts]);

    React.useEffect(() => {
        if (!organizations.length) {
            setSelectedOrganizationId(undefined);
            return;
        }

        const hasSelected = organizations.some((organization) => organization.id === selectedOrganizationId);

        if (!hasSelected) {
            setSelectedOrganizationId(organizations[0].id);
        }
    }, [organizations, selectedOrganizationId]);

    React.useEffect(() => {
        if (!cloudAccounts.length) {
            setSelectedCloudAccountId(undefined);
            return;
        }

        const hasSelected = cloudAccounts.some((cloudAccount) => cloudAccount.id === selectedCloudAccountId);

        if (!hasSelected) {
            setSelectedCloudAccountId(cloudAccounts[0].id);
        }
    }, [cloudAccounts, selectedCloudAccountId]);

    const selectedOrganization = React.useMemo(
        () => organizations.find((organization) => organization.id === selectedOrganizationId) ?? organizations[0] ?? PLACEHOLDER_ORGANIZATION,
        [organizations, selectedOrganizationId]
    );

    const selectedCloudAccount = React.useMemo(
        () => cloudAccounts.find((cloudAccount) => cloudAccount.id === selectedCloudAccountId) ?? cloudAccounts[0],
        [cloudAccounts, selectedCloudAccountId]
    );

    const filteredOrganizations = React.useMemo(() => {
        const q = orgSearch.trim().toLowerCase();
        if (!q) return organizations;
        return organizations.filter((organization) => organization.name.toLowerCase().includes(q));
    }, [organizations, orgSearch]);

    const filteredCloudAccounts = React.useMemo(() => {
        const q = cloudSearch.trim().toLowerCase();
        if (!q) return cloudAccounts;
        return cloudAccounts.filter((cloudAccount) => cloudAccount.alias.toLowerCase().includes(q) || cloudAccount.provider.toLowerCase().includes(q));
    }, [cloudAccounts, cloudSearch]);

    const handleSelectOrganization = (organization: OrganizationItem) => {
        setSelectedOrganizationId(organization.id);
        onOrganizationChange?.(organization);
    };

    const handleSelectCloudAccount = (cloudAccount: CloudAccountItem) => {
        setSelectedCloudAccountId(cloudAccount.id);
        onCloudAccountChange?.(cloudAccount);
    };

    // impede que o dropdown feche ao pressionar teclas no input de busca
    const stopPropagation = (e: React.KeyboardEvent) => e.stopPropagation();

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu
                    onOpenChange={() => {
                        setOrgSearch('');
                        setCloudSearch('');
                    }}
                >
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground  group cursor-pointer transition-colors duration-200"
                        >
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                                <Building2 className="size-4" />
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{selectedOrganization.name}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {selectedCloudAccount
                                        ? `${selectedCloudAccount.provider.toUpperCase()} · ${selectedCloudAccount.alias}`
                                        : 'Sem cloud account'}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-64 max-h-[80svh] overflow-y-auto rounded-lg animate-in fade-in duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out"
                        align="start"
                        side={isMobile ? 'bottom' : 'right'}
                        sideOffset={4}
                    >
                        {/* ── Enterprise ── */}
                        <div className="flex items-center justify-between px-1.5 pt-1 pb-0.5">
                            <DropdownMenuLabel className="px-0 py-0 text-xs font-medium text-muted-foreground">Enterprise</DropdownMenuLabel>
                            <Link
                                href={createOrganizationHref}
                                className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                                <Plus className="size-3.5" />
                                Nova
                            </Link>
                        </div>

                        {organizations.length > 3 && (
                            <div className="px-1.5 pb-1">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                                    <input
                                        placeholder="Filtrar organização…"
                                        value={orgSearch}
                                        onChange={(e) => setOrgSearch(e.target.value)}
                                        onKeyDown={stopPropagation}
                                        className="h-7 w-full rounded-md border border-input bg-transparent pl-6 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                </div>
                            </div>
                        )}

                        {filteredOrganizations.length > 0 ? (
                            filteredOrganizations.map((organization) => (
                                <DropdownMenuItem key={organization.id} onClick={() => handleSelectOrganization(organization)} className="gap-2 p-2">
                                    <div className="flex size-6 items-center justify-center rounded-md border">
                                        <Building2 className="size-3.5 shrink-0" />
                                    </div>
                                    <div className="flex flex-1 flex-col">
                                        <span className="font-medium">{organization.name}</span>
                                    </div>
                                    {organization.id === selectedOrganization.id && <Check className="ml-auto size-4" />}
                                </DropdownMenuItem>
                            ))
                        ) : (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                {orgSearch ? 'Nenhum resultado.' : 'Nenhuma organização encontrada.'}
                            </p>
                        )}

                        <DropdownMenuSeparator />

                        {/* ── Cloud account ── */}
                        <div className="flex items-center justify-between px-1.5 pt-1 pb-0.5">
                            <DropdownMenuLabel className="px-0 py-0 text-xs font-medium text-muted-foreground">Cloud account</DropdownMenuLabel>
                            <Link
                                href={createCloudAccountHref}
                                className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                                <Plus className="size-3.5" />
                                Nova
                            </Link>
                        </div>

                        {cloudAccounts.length > 3 && (
                            <div className="px-1.5 pb-1">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                                    <input
                                        placeholder="Filtrar cloud account…"
                                        value={cloudSearch}
                                        onChange={(e) => setCloudSearch(e.target.value)}
                                        onKeyDown={stopPropagation}
                                        className="h-7 w-full rounded-md border border-input bg-transparent pl-6 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                </div>
                            </div>
                        )}

                        {filteredCloudAccounts.length > 0 ? (
                            filteredCloudAccounts.map((cloudAccount) => (
                                <DropdownMenuItem key={cloudAccount.id} onClick={() => handleSelectCloudAccount(cloudAccount)} className="gap-2 p-2">
                                    <div className="flex size-6 items-center justify-center rounded-md border">
                                        <Cloud className="size-3.5 shrink-0" />
                                    </div>
                                    <div className="flex flex-1 flex-col">
                                        <span className="font-medium">{cloudAccount.alias}</span>
                                        <span className="text-xs text-muted-foreground">{cloudAccount.provider.toUpperCase()}</span>
                                    </div>
                                    {cloudAccount.id === selectedCloudAccount?.id && <Check className="ml-auto size-4" />}
                                </DropdownMenuItem>
                            ))
                        ) : (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                {cloudSearch ? 'Nenhum resultado.' : 'Sem cloud account para esta enterprise.'}
                            </p>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

export const VersionSwitcher = AccountSwitcher;
