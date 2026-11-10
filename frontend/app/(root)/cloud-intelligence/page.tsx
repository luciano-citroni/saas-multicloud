import { Suspense } from 'react';
import { CiOverviewPage } from '@/components/root/cloud-intelligence/ci-overview-page';

export default function CloudIntelligenceRoutePage() {
    return (
        <Suspense fallback={<div className="text-muted-foreground text-sm">Loading…</div>}>
            <CiOverviewPage />
        </Suspense>
    );
}
