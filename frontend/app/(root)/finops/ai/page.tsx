'use client';

import dynamic from 'next/dynamic';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';

const AiCostsPage = dynamic(
    () => import('@/components/root/finops/ai/ai-costs-page').then((mod) => mod.AiCostsPage),
    { ssr: false, loading: () => <FinopsLoadingSkeleton /> },
);

export default function Page() {
    return <AiCostsPage />;
}
