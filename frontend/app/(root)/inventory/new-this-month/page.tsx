import { Suspense } from 'react';
import { InventoryNewThisMonthPageClient } from '@/components/root/inventory/inventory-new-this-month-page-client';

function NewThisMonthLoading() {
    return (
        <div className="flex flex-col gap-6">
            <div className="h-16 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-96 animate-pulse rounded-lg bg-muted/60" />
        </div>
    );
}

export default function InventoryNewThisMonthPage() {
    return (
        <Suspense fallback={<NewThisMonthLoading />}>
            <InventoryNewThisMonthPageClient />
        </Suspense>
    );
}
