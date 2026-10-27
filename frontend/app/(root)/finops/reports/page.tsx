'use client';

import dynamic from 'next/dynamic';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

const FinopsReports = dynamic(
    () => import('@/components/root/finops/finops-reports').then((mod) => mod.FinopsReports),
    {
        ssr: false,
        loading: () => <FinopsLoadingSkeleton />,
    }
);

export default function FinopsReportsPage() {
    return <FinopsReports />;
}
