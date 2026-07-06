import { Skeleton } from '@/components/ui/skeleton';

export function GovernanceAnalysisLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
            </div>
            <div className="rounded-xl border">
                <div className="border-b px-4 py-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-36" />
                                <Skeleton className="h-3 w-full max-w-xl" />
                            </div>
                            <Skeleton className="h-3 w-24" />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
                            <div className="space-y-2">
                                <Skeleton className="h-3 w-28" />
                                <Skeleton className="h-10 w-full rounded-lg" />
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <Skeleton className="h-7 w-20 rounded-full" />
                                    <Skeleton className="h-7 w-24 rounded-full" />
                                    <Skeleton className="h-7 w-28 rounded-full" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Skeleton className="h-3 w-24" />
                                <div className="flex flex-wrap gap-2">
                                    <Skeleton className="h-7 w-16 rounded-full" />
                                    <Skeleton className="h-7 w-20 rounded-full" />
                                    <Skeleton className="h-7 w-16 rounded-full" />
                                    <Skeleton className="h-7 w-16 rounded-full" />
                                </div>
                                <div className="flex justify-start pt-1 sm:justify-end">
                                    <Skeleton className="h-9 w-36 rounded-lg" />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                            <Skeleton className="h-5 w-24 rounded-full" />
                            <Skeleton className="h-7 w-32 rounded-full" />
                            <Skeleton className="h-7 w-36 rounded-full" />
                        </div>
                    </div>
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
