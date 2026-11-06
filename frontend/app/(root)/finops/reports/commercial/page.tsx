'use client';

import dynamic from 'next/dynamic';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

const CommercialReportPage = dynamic(
    () => import('@/components/root/finops/commercial/commercial-report-page').then((mod) => mod.CommercialReportPage),
    { ssr: false, loading: () => <FinopsLoadingSkeleton /> },
);

export default function Page() {
    return <CommercialReportPage />;
}
