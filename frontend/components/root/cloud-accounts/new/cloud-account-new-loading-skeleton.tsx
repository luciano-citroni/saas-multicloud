import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function CloudAccountNewLoadingSkeleton() {
    return (
        <div className="mx-auto w-full max-w-2xl">
            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-4 w-80" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <Skeleton className="h-9 w-36" />
                </CardContent>
            </Card>
        </div>
    );
}
