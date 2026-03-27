import { Skeleton } from '@/components/ui/skeleton';

export function AssessmentLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-28" />
                <div className="ml-auto flex gap-2">
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-9 w-9" />
                </div>
            </div>
            <Skeleton className="h-[640px] w-full rounded-xl" />
        </div>
    );
}
