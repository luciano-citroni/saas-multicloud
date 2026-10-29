import { Suspense } from 'react';
import { FinopsBudgetFormPage } from '@/components/root/finops/finops-budget-form-page';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsNewBudgetPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsBudgetFormPage mode="create" />
        </Suspense>
    );
}
