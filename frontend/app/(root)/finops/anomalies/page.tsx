import { Suspense } from 'react';
import { FinopsAnomalies } from '@/components/root/finops/anomalies/finops-anomalies';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsAnomaliesPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsAnomalies />
        </Suspense>
    );
}
