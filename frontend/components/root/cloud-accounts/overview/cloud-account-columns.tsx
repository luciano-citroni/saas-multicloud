import { type OrganizationCloudAccount as CloudAccount } from '@/app/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ColumnDef } from '@tanstack/react-table';
import { Clock3, EllipsisVertical, RefreshCw } from 'lucide-react';

function formatProvider(provider: string) {
    const normalized = provider.toLowerCase();
    if (normalized === 'aws') return 'AWS';
    if (normalized === 'azure') return 'Azure';
    if (normalized === 'gcp') return 'GCP';
    return provider;
}

function formatDateTime(dateString?: string | null) {
    if (!dateString) return 'Ainda não sincronizado';

    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return 'Data inválida';

    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(parsed);
}

type CloudColumnOptions = {
    canManageAccounts: boolean;
    syncingAccountId: string | null;
    onSyncAccount: (id: string) => void;
    onEditAccount: (id: string) => void;
};

export const CloudAccountColumns = ({ canManageAccounts, syncingAccountId, onSyncAccount, onEditAccount }: CloudColumnOptions) => {
    const columns: ColumnDef<CloudAccount>[] = [
        {
            id: 'alias',
            header: 'Alias',
            accessorKey: 'alias',
            cell: ({ getValue, row }) => {
                const alias = getValue() as string;

                if (!canManageAccounts) {
                    return <span className="font-medium">{alias}</span>;
                }

                return (
                    <button
                        type="button"
                        onClick={() => onEditAccount(row.original.id)}
                        className="cursor-pointer text-left font-medium text-foreground  hover:underline"
                    >
                        {alias}
                    </button>
                );
            },
        },
        {
            id: 'provider',
            header: 'Provedor',
            accessorKey: 'provider',
            cell: ({ getValue }) => <span className="text-muted-foreground">{formatProvider(getValue() as string)}</span>,
        },
        {
            id: 'isActive',
            header: 'Status',
            accessorKey: 'isActive',
            cell: ({ getValue }) => {
                const value = getValue() as boolean | undefined;
                return <Badge variant={value === false ? 'outline' : 'secondary'}>{value === false ? 'Inativa' : 'Ativa'}</Badge>;
            },
        },
        {
            id: 'lastGeneralSyncAt',
            header: 'Último sync',
            accessorKey: 'lastGeneralSyncAt',
            cell: ({ row }) => {
                const isSyncInProgress = row.original.isSyncInProgress === true;

                if (isSyncInProgress) {
                    return (
                        <Badge variant="default" className="inline-flex items-center gap-1">
                            <RefreshCw className="size-3 animate-spin" />
                            Processando
                        </Badge>
                    );
                }

                return (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock3 className="size-3.5" />
                        {formatDateTime(row.original.lastGeneralSyncAt)}
                    </span>
                );
            },
        },
        {
            id: 'actions',
            enableHiding: false,
            cell: ({ row }) => {
                const isSyncInProgress = row.original.isSyncInProgress === true;
                const syncDisabled = !canManageAccounts || Boolean(syncingAccountId) || isSyncInProgress;
                const syncTitle = !canManageAccounts
                    ? 'Apenas OWNER/ADMIN pode sincronizar a conta.'
                    : isSyncInProgress
                      ? 'Esta conta já está processando um sync.'
                      : 'Sincronizar conta';

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant={'ghost'} className="h-8 w-8 p-0">
                                <EllipsisVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() => onEditAccount(row.original.id)}
                                disabled={!canManageAccounts}
                                title={!canManageAccounts ? 'Apenas OWNER/ADMIN pode editar a conta.' : 'Editar conta'}
                            >
                                Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() => onSyncAccount(row.original.id)}
                                disabled={syncDisabled}
                                title={syncTitle}
                            >
                                Sincronizar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive">
                                Excluir
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ];
    return columns;
};
