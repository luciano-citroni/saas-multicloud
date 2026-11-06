import { Suspense } from 'react';
import { FinopsCommitmentsPage } from '@/components/root/finops/commitments/finops-commitments-page';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsCommitmentsRoutePage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsCommitmentsPage />
        </Suspense>
    );
}
