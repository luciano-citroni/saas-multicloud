import { Skeleton } from '@/components/ui/skeleton';

export function BillingLoadingSkeleton() {
    return (
        <div className="flex w-full flex-col gap-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        </div>
    );
}
