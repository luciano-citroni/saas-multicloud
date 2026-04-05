import { Suspense } from 'react';
import { FinopsBilling } from '@/components/root/finops/billing/finops-billing';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsBillingPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsBilling />
        </Suspense>
    );
}
