'use client';
'use no memo';

import { type OrganizationCloudAccount as CloudAccount } from '@/app/actions/organization';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { flexRender, getCoreRowModel, getPaginationRowModel, useReactTable, type VisibilityState } from '@tanstack/react-table';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CloudAccountColumns } from './cloud-account-columns';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type StatusFilter = 'all' | 'active' | 'inactive';

type CloudAccountTableProps = {
    data: CloudAccount[];
    canManageAccounts: boolean;
    syncingAccountId: string | null;
    onSyncAccount: (id: string) => void;
    onEditAccount: (id: string) => void;
};

export function CloudAccountTable({ data, canManageAccounts, syncingAccountId, onSyncAccount, onEditAccount }: CloudAccountTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [nameFilter, setNameFilter] = useState(() => searchParams.get('name') ?? '');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>((searchParams.get('status') as StatusFilter) ?? 'all');
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    // Atualizar URL quando filtros mudarem
    useEffect(() => {
        const params = new URLSearchParams();
        if (nameFilter) params.set('name', nameFilter);
        if (statusFilter !== 'all') params.set('status', statusFilter);

        const queryString = params.toString();
        const newUrl = queryString ? `?${queryString}` : '';
        router.push(newUrl);
    }, [nameFilter, statusFilter, router]);

    const columns = useMemo(
        () => CloudAccountColumns({ canManageAccounts, syncingAccountId, onSyncAccount, onEditAccount }),
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

                    <Tabs
                        value={statusFilter}
                        onValueChange={(value) => {
                            setStatusFilter(value as StatusFilter);
                            setPageIndex(0);
                        }}
                    >
                        <TabsList>
                            <TabsTrigger value="all">Todos</TabsTrigger>
                            <TabsTrigger value="active">Ativos</TabsTrigger>
                            <TabsTrigger value="inactive">Inativos</TabsTrigger>
                        </TabsList>
                    </Tabs>
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
            <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                    <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                    <Select
                        value={`${pageSize}`}
                        onValueChange={(v) => {
                            setPageSize(Number(v));
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
                        Página {pageIndex + 1} de {table.getPageCount() || 1}
                    </span>

                    <div className="flex items-center gap-1 self-start sm:self-auto">
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
