import { Suspense } from 'react';
import { GovernanceOverview } from '@/components/root/governance/governance-overview';
import { GovernanceLoadingSkeleton } from '@/components/root/governance/overview/governance-loading-skeleton';

export default function GovernancePage() {
    return (
        <Suspense fallback={<GovernanceLoadingSkeleton />}>
            <GovernanceOverview />
        </Suspense>
    );
}
