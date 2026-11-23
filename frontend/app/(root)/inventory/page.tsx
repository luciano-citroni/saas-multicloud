import { Suspense } from 'react';
import { InventoryPageClient } from '@/components/root/inventory/inventory-page-client';

function InventoryLoading() {
    return (
        <div className="flex flex-col gap-6">
            <div className="h-16 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-28 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-72 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-96 animate-pulse rounded-lg bg-muted/60" />
        </div>
    );
}

export default function InventoryPage() {
    return (
        <Suspense fallback={<InventoryLoading />}>
            <InventoryPageClient />
        </Suspense>
    );
}
