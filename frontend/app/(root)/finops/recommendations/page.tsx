import { Suspense } from 'react';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsRecommendationsPage } from '@/components/root/finops/overview/finops-recommendations-page';

export default function FinopsRecommendationsRoutePage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsRecommendationsPage />
        </Suspense>
    );
}
