import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
    return (
        <div className="mx-auto w-full max-w-2xl px-3 pb-6 pt-3 sm:px-6 sm:py-6 lg:px-8">
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-72 mt-1" />
                </div>
                <div className="flex flex-col gap-4 p-4">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-32 self-end" />
                </div>
            </div>
        </div>
    );
}
