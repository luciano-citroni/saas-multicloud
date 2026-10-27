import { redirect } from 'next/navigation';

export default function FinopsInsightsRedirectPage() {
    redirect('/finops?tab=optimize');
}
