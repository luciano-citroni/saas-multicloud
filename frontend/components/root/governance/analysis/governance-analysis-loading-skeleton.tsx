import { Skeleton } from '@/components/ui/skeleton';

export function GovernanceAnalysisLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
            </div>
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <Skeleton className="h-9 w-64" />
                </div>
                <div className="space-y-3 p-4">
                    <Skeleton className="h-12 w-full rounded-md" />
                    <Skeleton className="h-12 w-full rounded-md" />
                    <Skeleton className="h-12 w-full rounded-md" />
                    <Skeleton className="h-12 w-full rounded-md" />
                    <Skeleton className="h-12 w-full rounded-md" />
                </div>
            </div>
        </div>
    );
}
