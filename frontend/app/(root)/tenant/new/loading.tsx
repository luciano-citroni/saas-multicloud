import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
    return (
        <div className="flex flex-1 items-start justify-center p-6">
            <div className="w-full max-w-lg">
                <Card className="shadow-sm">
                    <CardHeader className="pb-4">
                        <div className="flex items-center gap-3 mb-1">
                            <Skeleton className="h-10 w-10 rounded-lg" />
                            <div className="space-y-1.5">
                                <Skeleton className="h-5 w-40" />
                                <Skeleton className="h-4 w-64" />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-24 w-full rounded-lg" />
                        <div className="flex justify-between pt-2">
                            <Skeleton className="h-9 w-20" />
                            <Skeleton className="h-9 w-28" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
