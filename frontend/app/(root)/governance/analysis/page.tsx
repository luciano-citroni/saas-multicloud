import { Suspense } from 'react';
import { GovernanceAnalysis } from '../../../../components/root/governance/governance-analysis';

export default function GovernanceAnalysisPage() {
    return (
        <Suspense
            fallback={
                <div className="flex flex-col gap-4">
                    <div className="h-24 animate-pulse rounded-xl border bg-muted/30" />
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="h-20 animate-pulse rounded-xl border bg-muted/30" />
                        <div className="h-20 animate-pulse rounded-xl border bg-muted/30" />
                        <div className="h-20 animate-pulse rounded-xl border bg-muted/30" />
                    </div>
                    <div className="h-64 animate-pulse rounded-xl border bg-muted/30" />
                </div>
            }
        >
            <GovernanceAnalysis />
        </Suspense>
    );
}
