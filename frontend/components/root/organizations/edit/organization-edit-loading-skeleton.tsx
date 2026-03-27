import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function OrganizationEditLoadingSkeleton() {
    return (
        <div className="mx-auto w-full max-w-2xl px-3 pb-6 pt-3 sm:px-6 sm:py-6 lg:px-8">
            <Card className="border-border/70 shadow-xs">
                <CardHeader className="gap-2 px-3 sm:px-4">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-80" />
                </CardHeader>
                <CardContent className="min-w-0 space-y-4 px-3 pb-3 sm:px-4 sm:pb-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                    <Skeleton className="h-9 w-28" />
                </CardContent>
            </Card>
        </div>
    );
}
