import { Skeleton } from '@/components/ui/skeleton';

export function CloudAccountLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <Skeleton className="h-4 w-52" />
                    <div className="flex gap-2">
                        <Skeleton className="h-8 w-28" />
                        <Skeleton className="h-8 w-20" />
                    </div>
                </div>
                <div className="space-y-3 p-4">
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                </div>
            </div>
        </div>
    );
}
