import { type UserOrganization } from '@/app/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ColumnDef } from '@tanstack/react-table';
import { EllipsisVertical } from 'lucide-react';

function formatRole(role?: string | null) {
    const normalized = (role ?? '').trim().toUpperCase();

    if (normalized === 'OWNER') return 'Owner';
    if (normalized === 'ADMIN') return 'Admin';
    if (normalized === 'MEMBER') return 'Member';
    if (normalized === 'VIEWER') return 'Viewer';

    return 'Sem papel';
}

function formatPlanLabel(plan: string) {
    if (plan === '*') {
        return 'Todos os módulos';
    }

    return plan
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function canEditByRole(role?: string | null) {
    const normalized = (role ?? '').trim().toUpperCase();
    return normalized === 'OWNER' || normalized === 'ADMIN';
}

type OrganizationColumnOptions = {
    onEditOrganization: (organizationId: string) => void;
};

export const OrganizationColumns = ({ onEditOrganization }: OrganizationColumnOptions): ColumnDef<UserOrganization>[] => {
    return [
        {
            id: 'name',
            header: 'Organização',
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
            cell: ({ row }) => <span className="text-muted-foreground">{row.original.cnpj?.trim() || 'Não informado'}</span>,
        },
        {
            id: 'currentRole',
            header: 'Seu papel',
            accessorKey: 'currentRole',
            cell: ({ row }) => <Badge variant="outline">{formatRole(row.original.currentRole)}</Badge>,
        },
        {
            id: 'maxCloudAccounts',
            header: 'Limite cloud',
            accessorKey: 'maxCloudAccounts',
            cell: ({ row }) => <span>{row.original.maxCloudAccounts ?? 0}</span>,
        },
        {
            id: 'maxUsers',
            header: 'Limite usuários',
            accessorKey: 'maxUsers',
            cell: ({ row }) => <span>{row.original.maxUsers ?? 0}</span>,
        },
        {
            id: 'plans',
            header: 'Módulos',
            accessorKey: 'plans',
            cell: ({ row }) => {
                const plans = Array.isArray(row.original.plans) ? row.original.plans.filter(Boolean) : [];

                if (plans.length === 0) {
                    return <span className="text-muted-foreground">Sem módulos</span>;
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
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() => onEditOrganization(row.original.id)}
                                disabled={!canEdit}
                                title={!canEdit ? 'Apenas admin ou owner podem editar a organização.' : 'Editar organização'}
                            >
                                Editar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ];
};
