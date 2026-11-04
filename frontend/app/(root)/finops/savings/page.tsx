import { Suspense } from 'react';
import { FinopsSavingsPage } from '@/components/root/finops/savings/finops-savings-page';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsSavingsRoutePage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsSavingsPage />
        </Suspense>
    );
}
