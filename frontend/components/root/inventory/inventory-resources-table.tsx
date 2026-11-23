'use client';

import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { InventoryResource } from '@/app/actions/cloud-inventory';
import { formatDateTime, useTranslations } from '@/lib/i18n';

type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

type InventoryResourcesTableProps = {
    items: InventoryResource[];
    pagination: PaginationMeta | null;
    isLoading?: boolean;
    onPageChange: (page: number) => void;
};

export function InventoryResourcesTable({
    items,
    pagination,
    isLoading = false,
    onPageChange,
}: InventoryResourcesTableProps) {
    const t = useTranslations('inventory');
    const tc = useTranslations('common');
    const page = pagination?.page ?? 1;
    const totalPages = Math.max(1, pagination?.totalPages ?? 1);

    return (
        <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">{t.tableTitle}</p>
                <p className="text-xs text-muted-foreground">{t.tableDescription}</p>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t.colName}</TableHead>
                        <TableHead>{t.colType}</TableHead>
                        <TableHead className="hidden md:table-cell">{t.colRegion}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t.colStatus}</TableHead>
                        <TableHead>{t.colCreatedAt}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                {t.loading}
                            </TableCell>
                        </TableRow>
                    ) : items.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                {t.tableEmpty}
                            </TableCell>
                        </TableRow>
                    ) : (
                        items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="max-w-56 min-w-0 truncate font-medium">
                                    {item.name}
                                </TableCell>
                                <TableCell className="min-w-0">{item.resourceType}</TableCell>
                                <TableCell className="hidden md:table-cell text-muted-foreground">
                                    {item.region || '—'}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-muted-foreground">
                                    {item.status || '—'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                    {formatDateTime(item.createdAt)}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <div className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                    {tc.page} {page} {tc.of} {totalPages}
                    {pagination ? ` · ${pagination.totalItems} ${t.resourcesLabel}` : null}
                </p>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={isLoading || !pagination?.hasPreviousPage}
                        onClick={() => onPageChange(1)}
                    >
                        <ChevronsLeft className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={isLoading || !pagination?.hasPreviousPage}
                        onClick={() => onPageChange(Math.max(1, page - 1))}
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={isLoading || !pagination?.hasNextPage}
                        onClick={() => onPageChange(page + 1)}
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={isLoading || !pagination?.hasNextPage}
                        onClick={() => onPageChange(totalPages)}
                    >
                        <ChevronsRight className="size-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
