'use client';

import { ColumnDef } from '@tanstack/react-table';
import { EllipsisVertical, LayoutList } from 'lucide-react';
import Link from 'next/link';
import type { AppLocale } from '@/lib/locale';
import { type OrganizationCloudAccount as CloudAccount } from '@/app/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CloudAccountSyncStatus } from '@/components/root/cloud-accounts/cloud-account-sync-status';

type ColumnTranslations = {
    notSynced: string;
    invalidDate: string;
    processing: string;
    columnAlias: string;
    columnOrganization: string;
    columnProvider: string;
    columnStatus: string;
    columnLastSync: string;
    syncFailedLabel: string;
    syncWarningLabel: string;
    lastSyncLabel: string;
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

function formatProvider(provider: string) {
    const normalized = provider.toLowerCase();
    if (normalized === 'aws') return 'AWS';
    if (normalized === 'azure') return 'Azure';
    if (normalized === 'gcp') return 'GCP';
    return provider;
}

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
    const syncStatusLabels = {
        notSynced: t.notSynced,
        invalidDate: t.invalidDate,
        processing: t.processing,
        syncFailedLabel: t.syncFailedLabel,
        syncWarningLabel: t.syncWarningLabel,
        lastSyncLabel: t.lastSyncLabel,
    };

    const columns: ColumnDef<CloudAccount>[] = [
        {
            id: 'alias',
            header: t.columnAlias,
            accessorKey: 'alias',
            cell: ({ getValue, row }) => {
                const alias = getValue() as string;
                const hasSyncError = Boolean(row.original.lastGeneralSyncError?.trim());
                const hasSyncWarning = Boolean(row.original.lastGeneralSyncWarning?.trim());

                return (
                    <div className="flex flex-col gap-1">
                        {!canManageAccounts ? (
                            <span className="font-medium">{alias}</span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => onEditAccount(row.original.id)}
                                className="cursor-pointer text-left font-medium text-foreground hover:underline"
                            >
                                {alias}
                            </button>
                        )}
                        {hasSyncError ? (
                            <Badge variant="destructive" className="w-fit text-[10px] font-normal">
                                {t.syncFailedLabel}
                            </Badge>
                        ) : hasSyncWarning ? (
                            <Badge variant="outline" className="w-fit border-amber-500/40 text-[10px] font-normal text-amber-700 dark:text-amber-300">
                                {t.syncWarningLabel}
                            </Badge>
                        ) : null}
                    </div>
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
            cell: ({ row }) => <CloudAccountSyncStatus account={row.original} locale={locale} labels={syncStatusLabels} />,
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
