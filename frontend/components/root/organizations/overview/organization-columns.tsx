'use client';

import { useMemo } from 'react';
import { type UserOrganization } from '@/app/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTranslations } from '@/lib/i18n';
import type { ColumnDef } from '@tanstack/react-table';
import { EllipsisVertical } from 'lucide-react';

function canEditByRole(role?: string | null) {
    const normalized = (role ?? '').trim().toUpperCase();
    return normalized === 'OWNER' || normalized === 'ADMIN';
}

type OrganizationColumnOptions = {
    onEditOrganization: (organizationId: string) => void;
    onViewCloudAccounts: (organizationId: string) => void;
};

export function useOrganizationColumns({ onEditOrganization, onViewCloudAccounts }: OrganizationColumnOptions): ColumnDef<UserOrganization>[] {
    const t = useTranslations('organizations');
    const tc = useTranslations('common');

    return useMemo(() => {
        const formatRole = (role?: string | null) => {
            const normalized = (role ?? '').trim().toUpperCase();

            if (normalized === 'OWNER') return 'Owner';
            if (normalized === 'ADMIN') return 'Admin';
            if (normalized === 'MEMBER') return 'Member';
            if (normalized === 'VIEWER') return 'Viewer';

            return t.tenantsNoPermission;
        };

        const formatPlanLabel = (plan: string) => {
            if (plan === '*') {
                return t.allModules;
            }

            return plan
                .split(/[-_\s]+/)
                .filter(Boolean)
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ');
        };

        return [
            {
                id: 'name',
                header: t.columnOrganization,
                accessorKey: 'name',
                cell: ({ row }) => {
                    const canEdit = canEditByRole(row.original.currentRole);

                    if (!canEdit) {
                        return <span className="font-medium">{row.original.name}</span>;
                    }

                    return (
                        <button
                            type="button"
                            onClick={() => onEditOrganization(row.original.id)}
                            className="cursor-pointer text-left font-medium text-foreground hover:underline"
                        >
                            {row.original.name}
                        </button>
                    );
                },
            },
            {
                id: 'cnpj',
                header: 'CNPJ',
                accessorKey: 'cnpj',
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.cnpj?.trim() || t.cnpjNotInformed}</span>,
            },
            {
                id: 'currentRole',
                header: t.columnRole,
                accessorKey: 'currentRole',
                cell: ({ row }) => <Badge variant="outline">{formatRole(row.original.currentRole)}</Badge>,
            },
            {
                id: 'maxCloudAccounts',
                header: t.columnCloudLimit,
                accessorKey: 'maxCloudAccounts',
                cell: ({ row }) => <span>{row.original.maxCloudAccounts ?? 0}</span>,
            },
            {
                id: 'maxUsers',
                header: t.columnUserLimit,
                accessorKey: 'maxUsers',
                cell: ({ row }) => <span>{row.original.maxUsers ?? 0}</span>,
            },
            {
                id: 'plans',
                header: t.columnModules,
                accessorKey: 'plans',
                cell: ({ row }) => {
                    const plans = Array.isArray(row.original.plans) ? row.original.plans.filter(Boolean) : [];

                    if (plans.length === 0) {
                        return <span className="text-muted-foreground">{t.noModules}</span>;
                    }

                    return (
                        <div className="flex flex-wrap gap-1">
                            {plans.slice(0, 2).map((plan) => (
                                <Badge key={plan} variant="secondary">
                                    {formatPlanLabel(plan)}
                                </Badge>
                            ))}
                            {plans.length > 2 ? <Badge variant="outline">+{plans.length - 2}</Badge> : null}
                        </div>
                    );
                },
            },
            {
                id: 'actions',
                enableHiding: false,
                cell: ({ row }) => {
                    const canEdit = canEditByRole(row.original.currentRole);

                    return (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <EllipsisVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem className="cursor-pointer" onSelect={() => onViewCloudAccounts(row.original.id)}>
                                    {t.cloudAccountsAction}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="cursor-pointer"
                                    onSelect={() => onEditOrganization(row.original.id)}
                                    disabled={!canEdit}
                                    title={!canEdit ? t.editOrgNoPermission : t.editOrgTooltip}
                                >
                                    {tc.edit}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    );
                },
            },
        ];
    }, [onEditOrganization, onViewCloudAccounts, t, tc.edit]);
}
