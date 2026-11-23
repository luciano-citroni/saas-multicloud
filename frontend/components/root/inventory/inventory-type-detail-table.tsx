'use client';

import { useMemo } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { InventoryResource } from '@/app/actions/cloud-inventory';
import { InventoryTagList } from '@/components/root/inventory/inventory-tag-list';
import { formatDateTime, useTranslations } from '@/lib/i18n';

type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

type InventoryTypeDetailTableProps = {
    resourceType: string | null;
    items: InventoryResource[];
    pagination: PaginationMeta | null;
    isLoading?: boolean;
    showTypeColumn?: boolean;
    onPageChange: (page: number) => void;
};

const ATTRIBUTE_LABELS: Record<string, string> = {
    instanceType: 'Instance type',
    awsInstanceId: 'Instance ID',
    privateIpAddress: 'Private IP',
    publicIpAddress: 'Public IP',
    availabilityZone: 'AZ',
    keyName: 'Key',
    machineType: 'Machine type',
    zone: 'Zone',
    networkIp: 'Network IP',
    externalIp: 'External IP',
    vmSize: 'VM size',
    osType: 'OS',
    resourceGroup: 'Resource group',
    provisioningState: 'Provisioning',
    runtime: 'Runtime',
    memorySize: 'Memory',
    engine: 'Engine',
    engineVersion: 'Engine version',
    dbInstanceClass: 'Class',
    bucketName: 'Bucket',
    skuName: 'SKU',
    diskSizeGb: 'Size (GB)',
    kubernetesVersion: 'Kubernetes',
    currentMasterVersion: 'Master version',
    email: 'Email',
    displayName: 'Display name',
    ipAddress: 'IP',
    cidrBlock: 'CIDR',
    ipCidrRange: 'CIDR',
};

function humanizeAttributeKey(key: string): string {
    return ATTRIBUTE_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export function InventoryTypeDetailTable({
    resourceType,
    items,
    pagination,
    isLoading = false,
    showTypeColumn = false,
    onPageChange,
}: InventoryTypeDetailTableProps) {
    const t = useTranslations('inventory');
    const tc = useTranslations('common');
    const page = pagination?.page ?? 1;
    const totalPages = Math.max(1, pagination?.totalPages ?? 1);

    const attributeKeys = useMemo(() => {
        if (showTypeColumn) return [] as string[];
        const keys = new Set<string>();
        for (const item of items) {
            for (const [key, value] of Object.entries(item.attributes ?? {})) {
                if (value != null && String(value).trim() !== '') keys.add(key);
            }
        }
        return Array.from(keys).slice(0, 3);
    }, [items, showTypeColumn]);

    const colSpan = 4 + (showTypeColumn ? 1 : 0) + attributeKeys.length;

    return (
        <div className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted/20 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                            {resourceType || t.browseResultsTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">{t.browseDetailDescription}</p>
                    </div>
                    {pagination ? (
                        <p className="shrink-0 text-xs text-muted-foreground">
                            {pagination.totalItems} {t.resourcesLabel}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-40">{t.colName}</TableHead>
                            {showTypeColumn ? (
                                <TableHead className="min-w-32">{t.colType}</TableHead>
                            ) : null}
                            <TableHead className="min-w-28">{t.colRegion}</TableHead>
                            <TableHead className="hidden min-w-28 lg:table-cell">{t.colStatus}</TableHead>
                            {attributeKeys.map((key) => (
                                <TableHead key={key} className="hidden min-w-28 xl:table-cell">
                                    {humanizeAttributeKey(key)}
                                </TableHead>
                            ))}
                            <TableHead className="hidden min-w-52 md:table-cell">{t.colTags}</TableHead>
                            <TableHead className="min-w-36">{t.colCreatedAt}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={colSpan} className="h-28 text-center text-muted-foreground">
                                    {t.loading}
                                </TableCell>
                            </TableRow>
                        ) : items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={colSpan} className="h-28 text-center text-muted-foreground">
                                    {t.browseDetailEmpty}
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="max-w-56 min-w-0">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">{item.name}</p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
                                                {showTypeColumn ? `${item.resourceType} · ` : ''}
                                                {item.region || '—'}
                                                {item.status ? ` · ${item.status}` : ''}
                                            </p>
                                        </div>
                                    </TableCell>
                                    {showTypeColumn ? (
                                        <TableCell className="text-muted-foreground">
                                            <span className="truncate">{item.resourceType}</span>
                                        </TableCell>
                                    ) : null}
                                    <TableCell className="text-muted-foreground">
                                        <span className="truncate">{item.region || '—'}</span>
                                    </TableCell>
                                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                                        {item.status ? (
                                            <Badge variant="outline" className="font-normal">
                                                {item.status}
                                            </Badge>
                                        ) : (
                                            '—'
                                        )}
                                    </TableCell>
                                    {attributeKeys.map((key) => (
                                        <TableCell
                                            key={key}
                                            className="hidden max-w-40 min-w-0 truncate xl:table-cell text-muted-foreground"
                                        >
                                            {item.attributes?.[key] || '—'}
                                        </TableCell>
                                    ))}
                                    <TableCell className="hidden align-top md:table-cell">
                                        <InventoryTagList tags={item.tags} max={3} />
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">
                                        {formatDateTime(item.createdAt)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Extra bottom padding keeps pagination clear of the AI assistant FAB */}
            <div className="flex flex-col gap-3 border-t bg-background px-4 py-3 pb-24 sm:flex-row sm:items-center sm:justify-between sm:pb-20">
                <p className="text-xs text-muted-foreground">
                    {tc.page} {page} {tc.of} {totalPages}
                    {pagination ? ` · ${pagination.totalItems} ${t.resourcesLabel}` : null}
                </p>
                <div className="flex items-center gap-1 self-end sm:self-auto">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={isLoading || !pagination?.hasPreviousPage}
                        onClick={() => onPageChange(1)}
                        aria-label={t.paginationFirst}
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
                        aria-label={t.paginationPrevious}
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
                        aria-label={t.paginationNext}
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
                        aria-label={t.paginationLast}
                    >
                        <ChevronsRight className="size-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
