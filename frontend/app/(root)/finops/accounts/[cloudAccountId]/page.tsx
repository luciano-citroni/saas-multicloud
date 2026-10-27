import { Suspense } from 'react';
import { FinopsAccountDetail } from '@/components/root/finops/finops-account-detail';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

type PageProps = {
    params: Promise<{ cloudAccountId: string }>;
};

export default async function FinopsAccountPage({ params }: PageProps) {
    const { cloudAccountId } = await params;

    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsAccountDetail cloudAccountId={cloudAccountId} />
        </Suspense>
    );
}
