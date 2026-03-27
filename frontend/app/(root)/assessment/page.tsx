import { Suspense } from 'react';
import { AssessmentPageClient } from '@/components/root/assessment/assessment-page-client';
import { AssessmentLoadingSkeleton } from '@/components/root/assessment/assessment-loading-skeleton';

export default function AssessmentPage() {
    return (
        <Suspense fallback={<AssessmentLoadingSkeleton />}>
            <AssessmentPageClient />
        </Suspense>
    );
}
