import { Suspense } from 'react';
import { FinopsBudgetFormPage } from '@/components/root/finops/finops-budget-form-page';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

type Params = { params: Promise<{ budgetId: string }> };

export default async function FinopsEditBudgetPage({ params }: Params) {
    const { budgetId } = await params;

    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsBudgetFormPage mode="edit" budgetId={budgetId} />
        </Suspense>
    );
}
