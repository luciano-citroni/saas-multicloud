import { Suspense } from 'react';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSyncHistory } from '@/components/root/finops/overview/finops-sync-history';

export default function FinopsHistoryPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsSyncHistory />
        </Suspense>
    );
}
