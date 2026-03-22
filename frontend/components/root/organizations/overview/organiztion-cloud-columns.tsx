import { OrganizationCloudAccount } from '@/app/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnDef } from '@tanstack/react-table';
import { Clock3, Edit, RefreshCw } from 'lucide-react';

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
    onEditAccount: () => void;
};

export const organizationCloudColumns = ({ canManageAccounts, syncingAccountId, onSyncAccount, onEditAccount }: CloudColumnOptions) => {
    const columns: ColumnDef<OrganizationCloudAccount>[] = [
        {
            id: 'alias',
            header: 'Alias',
            accessorKey: 'alias',
            cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span>,
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
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onEditAccount}
                            disabled={!canManageAccounts}
                            title={!canManageAccounts ? 'Apenas OWNER/ADMIN pode editar a conta.' : 'Editar conta'}
                        >
                            <Edit className="size-3.5" />
                            Editar
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => onSyncAccount(row.original.id)}
                            isLoading={syncingAccountId === row.original.id}
                            disabled={syncDisabled}
                            title={syncTitle}
                        >
                            <RefreshCw className="size-3.5" />
                            {isSyncInProgress ? 'Processando...' : 'Sync conta'}
                        </Button>
                    </div>
                );
            },
        },
    ];
    return columns;
};
