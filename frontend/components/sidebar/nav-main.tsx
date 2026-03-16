'use client';

import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

export function NavMain({
    items,
}: {
    items: {
        title: string;
        url: string;
        icon?: LucideIcon;
        disabled?: boolean;
        disabledReason?: string;
    }[];
}) {
    const pathname = usePathname();

    /**
     * Descobre qual é o item mais específico da rota atual.
     */
    const activeItem = React.useMemo(() => {
        const matches = items.filter((item) => pathname === item.url || (item.url.length > 1 && pathname.includes(item.url)));

        if (!matches.length) return null;

        return matches.sort((a, b) => b.url.length - a.url.length)[0];
    }, [pathname, items]);

    return (
        <SidebarGroup>
            <SidebarGroupContent className="flex flex-col gap-2">
                <SidebarMenu>
                    {items.map((item) => {
                        const isActive = activeItem?.url === item.url;
                        const tooltip = item.disabled && item.disabledReason ? `${item.title}: ${item.disabledReason}` : item.title;

                        if (item.disabled) {
                            return (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton tooltip={tooltip} disabled isActive={false} className="cursor-not-allowed">
                                        {item.icon && <item.icon />}
                                        <span>{item.title}</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            );
                        }

                        return (
                            <Link href={item.url} key={item.title}>
                                <SidebarMenuItem>
                                    <SidebarMenuButton tooltip={tooltip} isActive={isActive} className="cursor-pointer">
                                        {item.icon && <item.icon />}
                                        <span>{item.title}</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </Link>
                        );
                    })}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}
