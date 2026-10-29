import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
    return (
        <div className="mx-auto w-full max-w-2xl">
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-4 w-64" />
                    <div className="flex justify-between pt-2">
                        <Skeleton className="h-9 w-20" />
                        <Skeleton className="h-9 w-40" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
