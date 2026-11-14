import { Suspense } from 'react';
import { AiConnectionLimitsPage } from '@/components/root/ai-governance/ai-connection-limits-page';

export default function Page() {
    return (
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
            <Suspense fallback={<div className="text-muted-foreground text-sm">Loading…</div>}>
                <AiConnectionLimitsPage />
            </Suspense>
        </div>
    );
}
