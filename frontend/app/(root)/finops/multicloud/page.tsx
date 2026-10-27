import { Suspense } from 'react';
import { FinopsMulticloud } from '@/components/root/finops/finops-multicloud';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsMulticloudPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsMulticloud />
        </Suspense>
    );
}
