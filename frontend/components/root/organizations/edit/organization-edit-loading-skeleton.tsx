import { Skeleton } from '@/components/ui/skeleton';

export function OrganizationEditLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-6 pb-24">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                    <Skeleton className="h-3 w-36" />
                    <Skeleton className="h-7 w-52" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </div>
                <Skeleton className="h-8 w-full lg:w-24" />
            </div>

            <Skeleton className="h-9 w-56" />

            <div className="space-y-6">
                <div className="overflow-hidden rounded-xl border">
                    <div className="space-y-2 border-b px-4 py-3 sm:px-5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-64 max-w-full" />
                    </div>
                    <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-2">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Skeleton className="h-8 w-36" />
                </div>
                <div className="overflow-hidden rounded-lg border border-destructive/20">
                    <div className="space-y-2 border-b border-destructive/15 px-4 py-3">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-72 max-w-full" />
                    </div>
                    <div className="p-4">
                        <Skeleton className="h-8 w-40" />
                    </div>
                </div>
            </div>
        </div>
    );
}
