import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
    return (
        <div className="mx-auto w-full max-w-4xl px-3 pb-6 pt-3 sm:px-6 sm:py-6 lg:px-8">
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <Skeleton className="h-6 w-48" />
                </div>
                <div className="space-y-3 p-4">
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-md" />
                </div>
            </div>
        </div>
    );
}
