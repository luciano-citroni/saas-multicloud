import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function HomeLoadingSkeleton() {
    return (
        <Card className="w-full max-w-3xl">
            <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-4 w-36" />
                </div>
                <Skeleton className="h-9 w-24" />
            </CardContent>
        </Card>
    );
}
