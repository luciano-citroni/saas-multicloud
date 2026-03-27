import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function OrganizationNewLoadingSkeleton() {
    return (
        <div className="mx-auto w-full max-w-2xl">
            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-80" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <Skeleton className="h-9 w-40" />
                </CardContent>
            </Card>
        </div>
    );
}
