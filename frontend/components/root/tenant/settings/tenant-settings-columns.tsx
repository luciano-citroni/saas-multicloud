'use client';

import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';
import { EllipsisVertical } from 'lucide-react';
import { type UserOrganization } from '@/app/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatOrganizationRole } from './tenant-settings-utils';

type TenantSettingsColumnLabels = {
    name: string;
    cnpj: string;
    cnpjNotInformed: string;
    permission: string;
    noPermission: string;
    actions: string;
    editAction: string;
    deleteAction: string;
    ownerRequiredAction: string;
    roleOwner: string;
    roleAdmin: string;
    roleMember: string;
    roleViewer: string;
};

type TenantSettingsColumnsProps = {
    labels: TenantSettingsColumnLabels;
    onDelete: (organization: UserOrganization) => void;
};

export function createTenantSettingsColumns({ labels, onDelete }: TenantSettingsColumnsProps): ColumnDef<UserOrganization>[] {
    return [
        {
            id: 'name',
            header: labels.name,
            accessorKey: 'name',
            cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        },
        {
            id: 'cnpj',
            header: labels.cnpj,
            accessorKey: 'cnpj',
            cell: ({ row }) => <span className="text-muted-foreground">{row.original.cnpj?.trim() || labels.cnpjNotInformed}</span>,
        },
        {
            id: 'permission',
            header: labels.permission,
            accessorKey: 'currentRole',
            cell: ({ row }) => (
                <Badge variant="outline">
                    {formatOrganizationRole(
                        row.original.currentRole,
                        labels.roleOwner,
                        labels.roleAdmin,
                        labels.roleMember,
                        labels.roleViewer,
                        labels.noPermission
                    )}
                </Badge>
            ),
        },
        {
            id: 'actions',
            header: labels.actions,
            enableHiding: false,
            cell: ({ row }) => {
                const isOwner = (row.original.currentRole ?? '').trim().toUpperCase() === 'OWNER';

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant={'ghost'} className="h-8 w-8 p-0">
                                <EllipsisVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {isOwner ? (
                                <DropdownMenuItem asChild className="cursor-pointer">
                                    <Link href={`/organizations/${row.original.id}/edit`}>{labels.editAction}</Link>
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem disabled title={labels.ownerRequiredAction}>
                                    {labels.editAction}
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                                onSelect={() => onDelete(row.original)}
                                disabled={!isOwner}
                                title={!isOwner ? labels.ownerRequiredAction : labels.deleteAction}
                            >
                                {labels.deleteAction}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
            meta: {
                className: 'text-right',
            },
        },
    ];
}
