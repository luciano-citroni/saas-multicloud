import { Skeleton } from '@/components/ui/skeleton';

export function FinopsLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
                <Skeleton className="h-40 rounded-xl" />
                <Skeleton className="h-40 rounded-xl" />
                <Skeleton className="h-40 rounded-xl" />
            </div>

            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <Skeleton className="h-6 w-48" />
                </div>
                <div className="space-y-3 p-4">
                    <Skeleton className="h-12 rounded-md" />
                    <Skeleton className="h-12 rounded-md" />
                    <Skeleton className="h-12 rounded-md" />
                    <Skeleton className="h-12 rounded-md" />
                </div>
            </div>

            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <Skeleton className="h-6 w-64" />
                </div>
                <div className="space-y-3 p-4">
                    <Skeleton className="h-16 rounded-md" />
                    <Skeleton className="h-16 rounded-md" />
                    <Skeleton className="h-16 rounded-md" />
                </div>
            </div>
        </div>
    );
}
