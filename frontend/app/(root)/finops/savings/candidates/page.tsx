import { Suspense } from 'react';
import { FinopsSpCandidatesPage } from '@/components/root/finops/savings/finops-sp-candidates-page';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsSpCandidatesRoutePage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsSpCandidatesPage />
        </Suspense>
    );
}
