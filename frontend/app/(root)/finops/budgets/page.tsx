import { Suspense } from 'react';
import { FinopsBudgets } from '@/components/root/finops/finops-budgets';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsBudgetsPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsBudgets />
        </Suspense>
    );
}
