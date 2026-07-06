import { type OrganizationCloudAccount as CloudAccount } from '@/app/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ColumnDef } from '@tanstack/react-table';
import { Clock3, EllipsisVertical, LayoutList, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { AppLocale } from '@/lib/locale';

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function formatProvider(provider: string) {
    const normalized = provider.toLowerCase();
    if (normalized === 'aws') return 'AWS';
    if (normalized === 'azure') return 'Azure';
    if (normalized === 'gcp') return 'GCP';
    return provider;
}

function formatDateTime(dateString: string | undefined | null, locale: AppLocale, notSynced: string, invalidDate: string) {
    if (!dateString) return notSynced;

    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return invalidDate;

    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: SAO_PAULO_TIME_ZONE,
    }).format(parsed);
}

type ColumnTranslations = {
    notSynced: string;
    invalidDate: string;
    processing: string;
    columnAlias: string;
    columnOrganization: string;
    columnProvider: string;
    columnStatus: string;
    columnLastSync: string;
    active: string;
    inactive: string;
    syncPermission: string;
    alreadySyncing: string;
    syncTooltip: string;
    editPermission: string;
    editTooltip: string;
    viewInventory: string;
    edit: string;
    syncAction: string;
    delete: string;
};

type CloudColumnOptions = {
    canManageAccounts: boolean;
    canSyncAccounts: boolean;
    syncingAccountId: string | null;
    locale: AppLocale;
    organizationNamesById: Record<string, string>;
    t: ColumnTranslations;
    onSyncAccount: (id: string) => void;
    onEditAccount: (id: string) => void;
    onDeleteAccount: (id: string) => void;
};

export const CloudAccountColumns = ({
    canManageAccounts,
    canSyncAccounts,
    syncingAccountId,
    locale,
    organizationNamesById,
    t,
    onSyncAccount,
    onEditAccount,
    onDeleteAccount,
}: CloudColumnOptions) => {
    const columns: ColumnDef<CloudAccount>[] = [
        {
            id: 'alias',
            header: t.columnAlias,
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
                        className="cursor-pointer text-left font-medium text-foreground hover:underline"
                    >
                        {alias}
                    </button>
                );
            },
        },
        {
            id: 'organizationId',
            header: t.columnOrganization,
            accessorKey: 'organizationId',
            cell: ({ row }) => {
                const organizationId = row.original.organizationId ?? null;

                if (!organizationId) {
                    return <span className="text-muted-foreground">-</span>;
                }

                return <span className="text-muted-foreground">{organizationNamesById[organizationId] ?? '-'}</span>;
            },
        },
        {
            id: 'provider',
            header: t.columnProvider,
            accessorKey: 'provider',
            cell: ({ getValue }) => <span className="text-muted-foreground">{formatProvider(getValue() as string)}</span>,
        },
        {
            id: 'isActive',
            header: t.columnStatus,
            accessorKey: 'isActive',
            cell: ({ getValue }) => {
                const value = getValue() as boolean | undefined;
                return <Badge variant={value === false ? 'outline' : 'secondary'}>{value === false ? t.inactive : t.active}</Badge>;
            },
        },
        {
            id: 'lastGeneralSyncAt',
            header: t.columnLastSync,
            accessorKey: 'lastGeneralSyncAt',
            cell: ({ row }) => {
                const isSyncInProgress = row.original.isSyncInProgress === true;

                if (isSyncInProgress) {
                    return (
                        <Badge variant="default" className="inline-flex items-center gap-1">
                            <RefreshCw className="size-3 animate-spin" />
                            {t.processing}
                        </Badge>
                    );
                }

                return (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock3 className="size-3.5" />
                        {formatDateTime(row.original.lastGeneralSyncAt, locale, t.notSynced, t.invalidDate)}
                    </span>
                );
            },
        },
        {
            id: 'actions',
            enableHiding: false,
            cell: ({ row }) => {
                const isSyncInProgress = row.original.isSyncInProgress === true;
                const syncDisabled = !canSyncAccounts || Boolean(syncingAccountId) || isSyncInProgress;
                const syncTitle = !canSyncAccounts ? t.syncPermission : isSyncInProgress ? t.alreadySyncing : t.syncTooltip;

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant={'ghost'} className="h-8 w-8 p-0">
                                <EllipsisVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {row.original.provider?.toLowerCase() === 'gcp' && (
                                <DropdownMenuItem asChild className="cursor-pointer">
                                    <Link href={`/cloud-accounts/${row.original.id}`} className="flex items-center gap-2">
                                        <LayoutList className="size-4" />
                                        {t.viewInventory}
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() => onEditAccount(row.original.id)}
                                disabled={!canManageAccounts}
                                title={!canManageAccounts ? t.editPermission : t.editTooltip}
                            >
                                {t.edit}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() => onSyncAccount(row.original.id)}
                                disabled={syncDisabled}
                                title={syncTitle}
                            >
                                {t.syncAction}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                                onSelect={() => onDeleteAccount(row.original.id)}
                                disabled={!canManageAccounts}
                                title={!canManageAccounts ? t.editPermission : t.delete}
                            >
                                {t.delete}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ];
    return columns;
};
