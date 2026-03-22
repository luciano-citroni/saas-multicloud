'use client';
'use no memo';

import { OrganizationCloudAccount } from '@/app/actions/organization';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, type VisibilityState } from '@tanstack/react-table';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { organizationCloudColumns } from './organiztion-cloud-columns';

type StatusFilter = 'all' | 'active' | 'inactive';

const STATUS_LABELS: Record<StatusFilter, string> = {
    all: 'Todos',
    active: 'Ativos',
    inactive: 'Inativos',
};

type OrganizationCloudTableProps = {
    data: OrganizationCloudAccount[];
    canManageAccounts: boolean;
    syncingAccountId: string | null;
    onSyncAccount: (id: string) => void;
    onEditAccount: () => void;
};

export function OrganizationCloudTable({ data, canManageAccounts, syncingAccountId, onSyncAccount, onEditAccount }: OrganizationCloudTableProps) {
    const [nameFilter, setNameFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    const columns = useMemo(
        () => organizationCloudColumns({ canManageAccounts, syncingAccountId, onSyncAccount, onEditAccount }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [canManageAccounts, syncingAccountId]
    );

    const filteredData = useMemo(() => {
        const normalizedName = nameFilter.trim().toLowerCase();

        return data.filter((account) => {
            const matchesName = normalizedName.length === 0 || account.alias.toLowerCase().includes(normalizedName);
            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'active' && account.isActive !== false) ||
                (statusFilter === 'inactive' && account.isActive === false);

            return matchesName && matchesStatus;
        });
    }, [data, nameFilter, statusFilter]);

    const table = useReactTable({
        data: filteredData,
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
            {/* Barra de filtros */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        value={nameFilter}
                        onChange={(e) => {
                            setNameFilter(e.target.value);
                            setPageIndex(0);
                        }}
                        placeholder="Filtrar por nome..."
                        className="h-8 w-50"
                    />

                    <div className="flex overflow-hidden rounded-md border">
                        {(['all', 'active', 'inactive'] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => {
                                    setStatusFilter(value);
                                    setPageIndex(0);
                                }}
                                className={cn(
                                    'px-3 py-1 text-sm transition-colors',
                                    'not-last:border-r',
                                    statusFilter === value
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                {STATUS_LABELS[value]}
                            </button>
                        ))}
                    </div>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                            <SlidersHorizontal className="h-4 w-4" />
                            <span className="hidden sm:inline">Colunas</span>
                            <ChevronDown className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        {table
                            .getAllColumns()
                            .filter((col) => col.getCanHide() && col.id !== 'actions')
                            .map((col) => (
                                <DropdownMenuCheckboxItem
                                    key={col.id}
                                    checked={col.getIsVisible()}
                                    onCheckedChange={(value) => col.toggleVisibility(!!value)}
                                >
                                    {String(col.columnDef.header)}
                                </DropdownMenuCheckboxItem>
                            ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Tabela */}
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
                                    Nenhuma conta encontrada para os filtros aplicados.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Paginação */}
            <div className="flex items-center justify-end gap-8 px-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <span>Linhas por página</span>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setPageIndex(0);
                        }}
                        className="h-8 w-17.5 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none"
                    >
                        {[5, 10, 20, 30].map((size) => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-6">
                    <span className="text-sm font-medium">
                        Página {pageIndex + 1} de {table.getPageCount() || 1}
                    </span>

                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPageIndex((p) => Math.max(p - 1, 0))}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPageIndex((p) => Math.min(p + 1, table.getPageCount() - 1))}
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
