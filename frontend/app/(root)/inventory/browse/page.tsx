import { Suspense } from 'react';
import { InventoryBrowsePageClient } from '@/components/root/inventory/inventory-browse-page-client';

function BrowseLoading() {
    return (
        <div className="flex flex-col gap-6">
            <div className="h-16 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-lg bg-muted/60" />
                ))}
            </div>
        </div>
    );
}

export default function InventoryBrowsePage() {
    return (
        <Suspense fallback={<BrowseLoading />}>
            <InventoryBrowsePageClient />
        </Suspense>
    );
}
