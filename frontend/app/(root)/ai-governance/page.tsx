import { Suspense } from 'react';
import { AiGovernancePage } from '@/components/root/ai-governance/ai-governance-page';

export default function Page() {
    return (
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
            <Suspense fallback={<div className="text-muted-foreground text-sm">Loading…</div>}>
                <AiGovernancePage />
            </Suspense>
        </div>
    );
}
