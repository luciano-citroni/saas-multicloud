import { Suspense } from 'react';
import { FinopsReports } from '@/components/root/finops/finops-reports';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsReportsPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsReports />
        </Suspense>
    );
}
