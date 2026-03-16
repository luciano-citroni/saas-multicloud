'use client';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronsUpDown, Coins, LogOut, Settings, WalletCards } from 'lucide-react';
import Link from 'next/link';

type NavUserProps = {
    loading?: boolean;
    user?: {
        name: string;
        email: string;
    };
    onLogout?: () => void | Promise<void>;
};

export function NavUser({ loading = false, user, onLogout }: NavUserProps) {
    const { isMobile } = useSidebar();

    const userProfile = user ?? { name: 'Usuário', email: 'email@teste.com' };

    const handleLogout = () => {
        onLogout?.();
    };

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="lg" className="min-h-15 group cursor-pointer transition-colors duration-200">
                            {loading ? (
                                <div className="grid flex-1 text-left gap-1">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                            ) : (
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium text-base">{userProfile.name}</span>
                                    <span className="text-muted-foreground truncate text-xs">{userProfile.email}</span>
                                </div>
                            )}
                            <ChevronsUpDown className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg animate-in fade-in duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out "
                        side={isMobile ? 'bottom' : 'right'}
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-2 text-left text-sm">
                                {loading ? (
                                    <div className="grid flex-1 text-left gap-1">
                                        <Skeleton className="h-4 w-28" />
                                        <Skeleton className="h-3 w-20" />
                                    </div>
                                ) : (
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-medium text-base">{userProfile.name}</span>
                                        <span className="text-muted-foreground truncate text-xs">{userProfile?.email}</span>
                                    </div>
                                )}
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href="/billing">
                                    <Coins />
                                    Planos
                                </Link>
                            </DropdownMenuItem>

                            <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href="/configuracoes">
                                    <Settings />
                                    Configurações
                                </Link>
                            </DropdownMenuItem>

                            <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href="/ajuda">
                                    <WalletCards />
                                    Ajuda
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                            <LogOut />
                            Sair
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
