'use client';
'use no memo';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, type VisibilityState } from '@tanstack/react-table';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal } from 'lucide-react';
import { type UserOrganization } from '@/app/actions/organization';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from '@/lib/i18n';
import { createTenantSettingsColumns } from './tenant-settings-columns';
import { type RoleFilter } from './tenant-settings-utils';

type TenantSettingsTableProps = {
    data: UserOrganization[];
    onDelete: (organization: UserOrganization) => void;
};

export function TenantSettingsTable({ data, onDelete }: TenantSettingsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('organizations');
    const tm = useTranslations('members');
    const tc = useTranslations('common');

    const [nameFilter, setNameFilter] = useState(() => searchParams.get('name') ?? '');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>((searchParams.get('role') as RoleFilter) ?? 'all');
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        const params = new URLSearchParams();

        if (nameFilter) {
            params.set('name', nameFilter);
        }

        if (roleFilter !== 'all') {
            params.set('role', roleFilter);
        }

        const queryString = params.toString();
        const newUrl = queryString ? `?${queryString}` : '';
        router.push(newUrl);
    }, [nameFilter, roleFilter, router]);

    const filteredOrganizations = useMemo(() => {
        const normalizedName = nameFilter.trim().toLowerCase();

        return data.filter((organization) => {
            const matchesName = normalizedName.length === 0 || organization.name.toLowerCase().includes(normalizedName);
            const normalizedRole = (organization.currentRole ?? '').trim().toLowerCase();
            const matchesRole = roleFilter === 'all' || normalizedRole === roleFilter;

            return matchesName && matchesRole;
        });
    }, [data, nameFilter, roleFilter]);

    const columns = useMemo(
        () =>
            createTenantSettingsColumns({
                labels: {
                    name: t.tenantsTableName,
                    cnpj: t.cnpjLabel,
                    cnpjNotInformed: t.cnpjNotInformed,
                    permission: t.tenantsTablePermission,
                    noPermission: t.tenantsNoPermission,
                    actions: t.tenantsTableActions,
                    editAction: t.tenantsEditAction,
                    deleteAction: t.tenantsDeleteAction,
                    ownerRequiredAction: t.ownerRequiredAction,
                    roleOwner: tm.roleOwner,
                    roleAdmin: tm.roleAdmin,
                    roleMember: tm.roleMember,
                    roleViewer: tm.roleViewer,
                },
                onDelete,
            }),
        [onDelete, t, tm]
    );

    const table = useReactTable({
        data: filteredOrganizations,
        columns,
        state: {
            columnVisibility,
            pagination: { pageIndex, pageSize },
        },
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: (updater) => {
            const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
            setPageIndex(next.pageIndex);
            setPageSize(next.pageSize);
        },
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        value={nameFilter}
                        onChange={(event) => {
                            setNameFilter(event.target.value);
                            setPageIndex(0);
                        }}
                        placeholder={t.tenantsFilterPlaceholder}
                        className="h-8 w-50"
                    />

                    <Tabs
                        value={roleFilter}
                        onValueChange={(value) => {
                            setRoleFilter(value as RoleFilter);
                            setPageIndex(0);
                        }}
                    >
                        <TabsList>
                            <TabsTrigger value="all">{t.tenantsTabAll}</TabsTrigger>
                            <TabsTrigger value="owner">{tm.roleOwner}</TabsTrigger>
                            <TabsTrigger value="admin">{tm.roleAdmin}</TabsTrigger>
                            <TabsTrigger value="member">{tm.roleMember}</TabsTrigger>
                            <TabsTrigger value="viewer">{tm.roleViewer}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                            <SlidersHorizontal className="h-4 w-4" />
                            <span className="hidden sm:inline">{tc.columns}</span>
                            <ChevronDown className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        {table
                            .getAllColumns()
                            .filter((column) => column.getCanHide() && column.id !== 'actions')
                            .map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.id}
                                    checked={column.getIsVisible()}
                                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                >
                                    {String(column.columnDef.header)}
                                </DropdownMenuCheckboxItem>
                            ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="rounded-lg border">
                <Table>
                    <TableHeader className="bg-muted/50">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} className="px-4 font-medium">
                                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.length > 0 ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="px-4">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                    {t.tenantsEmpty}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                    <span className="shrink-0 whitespace-nowrap">{tc.rowsPerPage}</span>
                    <Select
                        value={`${pageSize}`}
                        onValueChange={(value) => {
                            setPageSize(Number(value));
                            setPageIndex(0);
                        }}
                    >
                        <SelectTrigger className="h-8 min-w-22">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[5, 10, 20, 30].map((size) => (
                                <SelectItem key={size} value={`${size}`}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                    <span className="text-sm font-medium">
                        {tc.page} {pageIndex + 1} {tc.of} {table.getPageCount() || 1}
                    </span>

                    <div className="flex items-center gap-1 self-start sm:self-auto">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPageIndex((previous) => Math.max(previous - 1, 0))}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPageIndex((previous) => Math.min(previous + 1, table.getPageCount() - 1))}
                            disabled={!table.getCanNextPage()}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPageIndex(table.getPageCount() - 1)}
                            disabled={!table.getCanNextPage()}
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
