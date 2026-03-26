import { Suspense } from 'react';
import { AssessmentPageClient } from '@/components/root/assessment/assessment-page-client';

export default function AssessmentPage() {
    return (
        <Suspense
            fallback={
                <div className="flex flex-col gap-4">
                    <div className="h-32 animate-pulse rounded-xl border bg-muted/30" />
                    <div className="h-[640px] animate-pulse rounded-xl border bg-muted/30" />
                </div>
            }
        >
            <AssessmentPageClient />
        </Suspense>
    );
}
