import { Suspense } from 'react';
import { FinopsInsights } from '@/components/root/finops/insights/finops-insights';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsInsightsPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsInsights />
        </Suspense>
    );
}
