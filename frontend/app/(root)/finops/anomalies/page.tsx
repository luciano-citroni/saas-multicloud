import { redirect } from 'next/navigation';

export default function FinopsAnomaliesRedirectPage() {
    redirect('/finops?tab=optimize');
}
