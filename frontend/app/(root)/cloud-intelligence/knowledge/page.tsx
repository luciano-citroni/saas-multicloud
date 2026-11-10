import { Suspense } from 'react';
import { CiKnowledgePage } from '@/components/root/cloud-intelligence/ci-knowledge-page';

export default function CloudIntelligenceKnowledgeRoute() {
    return (
        <Suspense fallback={<div className="text-muted-foreground text-sm">Loading…</div>}>
            <CiKnowledgePage />
        </Suspense>
    );
}
