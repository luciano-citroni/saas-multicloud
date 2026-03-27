import { Skeleton } from '@/components/ui/skeleton';
import { HomeLoadingSkeleton } from '@/components/root/home/home-loading-skeleton';

export default function HomeLoading() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-80" />
            </div>
            <HomeLoadingSkeleton />
        </div>
    );
}
