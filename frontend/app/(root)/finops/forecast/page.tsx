import { Suspense } from 'react';
import { FinopsForecast } from '@/components/root/finops/forecast/finops-forecast';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

export default function FinopsForecastPage() {
    return (
        <Suspense fallback={<FinopsLoadingSkeleton />}>
            <FinopsForecast />
        </Suspense>
    );
}
