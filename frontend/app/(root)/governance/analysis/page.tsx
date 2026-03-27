import { Suspense } from 'react';
import { GovernanceAnalysis } from '../../../../components/root/governance/governance-analysis';
import { GovernanceAnalysisLoadingSkeleton } from '@/components/root/governance/analysis/governance-analysis-loading-skeleton';

export default function GovernanceAnalysisPage() {
    return (
        <Suspense fallback={<GovernanceAnalysisLoadingSkeleton />}>
            <GovernanceAnalysis />
        </Suspense>
    );
}
