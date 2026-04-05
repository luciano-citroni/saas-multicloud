import { Suspense } from 'react';
import { FinopsOverview } from '@/components/root/finops/finops-overview';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsDashboardPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsOverview mode="individual" />
        </Suspense>
    );
}
