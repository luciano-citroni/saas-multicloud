import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function SettingsLoadingSkeleton() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-80" />
            </div>

            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-4 w-44" />
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Skeleton className="h-9 w-20" />
                        <Skeleton className="h-9 w-20" />
                        <Skeleton className="h-9 w-20" />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-64" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <Skeleton className="h-9 w-24" />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-56" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-16 w-full rounded-md" />
                    <Skeleton className="h-16 w-full rounded-md" />
                    <Skeleton className="h-16 w-full rounded-md" />
                </CardContent>
            </Card>
        </div>
    );
}
