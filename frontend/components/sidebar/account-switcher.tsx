'use client';

import * as React from 'react';
import Link from 'next/link';
import { Building2, Check, Cloud, ChevronsUpDown, Layers, Plus, Search } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

type TenantItem = {
    id: string;
    name: string;
    slug: string;
};

type MidOrgItem = {
    id: string;
    name: string;
};

type CloudAccountItem = {
    id: string;
    alias: string;
    provider: string;
};

type AccountSwitcherProps = {
    loading?: boolean;
    tenants: TenantItem[];
    activeTenantId?: string;
    midOrgs?: MidOrgItem[];
    activeMidOrgId?: string;
    cloudAccounts?: CloudAccountItem[];
    activeCloudAccountId?: string;
    createTenantHref?: string;
    createMidOrgHref?: string;
    createCloudAccountHref?: string;
    onTenantChange?: (tenant: TenantItem) => void;
    onMidOrgChange?: (org: MidOrgItem) => void;
    onCloudAccountChange?: (account: CloudAccountItem) => void;
};

const providerColors: Record<string, string> = {
    aws: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    azure: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    gcp: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const providerLabel: Record<string, string> = {
    aws: 'AWS',
    azure: 'Azure',
    gcp: 'GCP',
};

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
        <div className="px-2 pb-1.5 pt-1">
            <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 pointer-events-none text-muted-foreground" />
                <input
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="h-7 w-full rounded-md border border-input bg-transparent pl-6 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
            </div>
        </div>
    );
}

export function AccountSwitcher({
    loading = false,
    tenants,
    activeTenantId,
    midOrgs = [],
    activeMidOrgId,
    cloudAccounts = [],
    activeCloudAccountId,
    createTenantHref = '/tenant/new',
    createMidOrgHref = '/tenant/organizations/new',
    createCloudAccountHref = '/cloud-accounts/new',
    onTenantChange,
    onMidOrgChange,
    onCloudAccountChange,
}: AccountSwitcherProps) {
    const { isMobile } = useSidebar();
    const [tenantSearch, setTenantSearch] = React.useState('');
    const [orgSearch, setOrgSearch] = React.useState('');
    const [cloudSearch, setCloudSearch] = React.useState('');

    const selectedTenant = tenants.find((t) => t.id === activeTenantId) ?? tenants[0];
    const selectedMidOrg = midOrgs.find((o) => o.id === activeMidOrgId);
    const selectedCloudAccount = cloudAccounts.find((a) => a.id === activeCloudAccountId) ?? cloudAccounts[0];

    const filteredTenants = React.useMemo(() => {
        const q = tenantSearch.trim().toLowerCase();
        return q ? tenants.filter((t) => t.name.toLowerCase().includes(q)) : tenants;
    }, [tenants, tenantSearch]);

    const filteredOrgs = React.useMemo(() => {
        const q = orgSearch.trim().toLowerCase();
        return q ? midOrgs.filter((o) => o.name.toLowerCase().includes(q)) : midOrgs;
    }, [midOrgs, orgSearch]);

    const filteredAccounts = React.useMemo(() => {
        const q = cloudSearch.trim().toLowerCase();
        return q ? cloudAccounts.filter((a) => a.alias.toLowerCase().includes(q) || a.provider.toLowerCase().includes(q)) : cloudAccounts;
    }, [cloudAccounts, cloudSearch]);

    const side = isMobile ? 'bottom' : 'right';

    const cloudProvider = selectedCloudAccount?.provider.toLowerCase() ?? '';
    const cloudIconClass = providerColors[cloudProvider] ?? 'bg-sidebar-primary/15 text-sidebar-primary';

    if (loading) {
        return (
            <SidebarMenu>
                {[0, 1].map((i) => (
                    <SidebarMenuItem key={i}>
                        <SidebarMenuButton size="lg" disabled className="cursor-default">
                            <Skeleton className="size-8 rounded-lg shrink-0" />
                            <div className="flex flex-1 flex-col gap-1.5">
                                <Skeleton className="h-3.5 w-28" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        );
    }

    return (
        <SidebarMenu>
            {/* ── Tenant ── */}
            <SidebarMenuItem>
                <DropdownMenu onOpenChange={() => setTenantSearch('')}>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="group data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                        >
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                                <Building2 className="size-4" />
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">
                                    {selectedTenant?.name ?? 'Nenhum tenant'}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {selectedTenant?.slug ?? 'tenant'}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg animate-in fade-in duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out"
                        align="start"
                        side={side}
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Tenant</DropdownMenuLabel>
                        {tenants.length > 3 && (
                            <SearchInput value={tenantSearch} onChange={setTenantSearch} placeholder="Filtrar tenant…" />
                        )}
                        {filteredTenants.map((tenant) => (
                            <DropdownMenuItem
                                key={tenant.id}
                                onClick={() => onTenantChange?.(tenant)}
                                className="gap-2 p-2"
                            >
                                <div className="flex size-6 items-center justify-center rounded-md border">
                                    <Building2 className="size-3.5 shrink-0" />
                                </div>
                                <span className="flex-1 truncate">{tenant.name}</span>
                                {tenant.id === selectedTenant?.id && <Check className="ml-auto size-4 text-primary shrink-0" />}
                            </DropdownMenuItem>
                        ))}
                        {filteredTenants.length === 0 && (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum resultado.</p>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild className="gap-2 p-2">
                            <Link href={createTenantHref}>
                                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                                    <Plus className="size-4" />
                                </div>
                                <div className="font-medium text-muted-foreground">Novo tenant</div>
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>

            {/* ── Organização + Conta Cloud ── */}
            <SidebarMenuItem>
                <DropdownMenu onOpenChange={() => { setOrgSearch(''); setCloudSearch(''); }}>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="group data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                        >
                            <div className={`flex aspect-square size-8 items-center justify-center rounded-lg ${cloudIconClass}`}>
                                <Cloud className="size-4" />
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">
                                    {selectedMidOrg?.name ?? 'Nenhuma organização'}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {selectedCloudAccount
                                        ? `${selectedCloudAccount.alias} · ${providerLabel[cloudProvider] ?? cloudProvider.toUpperCase()}`
                                        : 'Sem conta cloud'}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg animate-in fade-in duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out"
                        align="start"
                        side={side}
                        sideOffset={4}
                    >
                        {/* Organizações */}
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Organização</DropdownMenuLabel>
                        {midOrgs.length > 3 && (
                            <SearchInput value={orgSearch} onChange={setOrgSearch} placeholder="Filtrar organização…" />
                        )}
                        {midOrgs.length === 0 ? (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma organização criada.</p>
                        ) : filteredOrgs.length > 0 ? (
                            filteredOrgs.map((org) => (
                                <DropdownMenuItem
                                    key={org.id}
                                    onClick={() => onMidOrgChange?.(org)}
                                    className="gap-2 p-2"
                                >
                                    <div className="flex size-6 items-center justify-center rounded-md border">
                                        <Layers className="size-3.5 shrink-0" />
                                    </div>
                                    <span className="flex-1 truncate">{org.name}</span>
                                    {org.id === selectedMidOrg?.id && <Check className="ml-auto size-4 text-primary shrink-0" />}
                                </DropdownMenuItem>
                            ))
                        ) : (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum resultado.</p>
                        )}
                        <DropdownMenuSeparator />

                        {/* Contas Cloud */}
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Conta Cloud</DropdownMenuLabel>
                        {cloudAccounts.length > 3 && (
                            <SearchInput value={cloudSearch} onChange={setCloudSearch} placeholder="Filtrar conta…" />
                        )}
                        {cloudAccounts.length === 0 ? (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">Sem contas cloud neste tenant.</p>
                        ) : filteredAccounts.length > 0 ? (
                            filteredAccounts.map((account) => (
                                <DropdownMenuItem
                                    key={account.id}
                                    onClick={() => onCloudAccountChange?.(account)}
                                    className="gap-2 p-2"
                                >
                                    <div className={`flex size-6 items-center justify-center rounded-md ${providerColors[account.provider.toLowerCase()] ?? 'bg-muted text-muted-foreground'}`}>
                                        <Cloud className="size-3.5 shrink-0" />
                                    </div>
                                    <div className="flex flex-1 flex-col min-w-0">
                                        <span className="truncate text-sm">{account.alias}</span>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {providerLabel[account.provider.toLowerCase()] ?? account.provider.toUpperCase()}
                                        </span>
                                    </div>
                                    {account.id === selectedCloudAccount?.id && <Check className="ml-auto size-4 text-primary shrink-0" />}
                                </DropdownMenuItem>
                            ))
                        ) : (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum resultado.</p>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

export const VersionSwitcher = AccountSwitcher;
