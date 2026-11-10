import { Suspense } from 'react';
import { CloudIntelligenceRecommendationsPanel } from '@/components/root/cloud-intelligence/recommendations-page';

export default function CloudIntelligenceRecommendationsRoute() {
    return (
        <Suspense fallback={<div className="text-muted-foreground text-sm">Loading…</div>}>
            <CloudIntelligenceRecommendationsPanel />
        </Suspense>
    );
}
