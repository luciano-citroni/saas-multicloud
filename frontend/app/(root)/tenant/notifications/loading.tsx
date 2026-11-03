import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="mt-2 h-3 w-72" />
                </div>
                <div className="space-y-3 px-4 py-4">
                    <Skeleton className="h-9 w-48 rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                </div>
            </div>
        </div>
    );
}
