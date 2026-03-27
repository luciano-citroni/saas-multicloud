import { Skeleton } from '@/components/ui/skeleton';
import { BillingLoadingSkeleton } from '@/components/root/billing/billing-loading-skeleton';

export default function BillingLoading() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-96" />
            </div>
            <BillingLoadingSkeleton />
        </div>
    );
}
