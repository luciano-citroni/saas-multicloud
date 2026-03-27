import { Suspense } from 'react';
import { FinopsCostDetails } from '@/components/root/finops/costs/finops-cost-details';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsCostsPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsCostDetails />
        </Suspense>
    );
}
