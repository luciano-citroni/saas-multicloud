import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function HomeLoadingSkeleton() {
    return (
        <Card className="w-full">
            <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-full max-w-72" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-full max-w-48" />
                    <Skeleton className="h-4 w-full max-w-56" />
                    <Skeleton className="h-4 w-full max-w-36" />
                </div>
                <Skeleton className="h-9 w-24" />
            </CardContent>
        </Card>
    );
}
