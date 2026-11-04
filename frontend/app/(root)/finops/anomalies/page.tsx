import { Suspense } from 'react';
import { FinopsAnomaliesPage } from '@/components/root/finops/anomalies/finops-anomalies-page';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsAnomaliesRoutePage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsAnomaliesPage />
        </Suspense>
    );
}
