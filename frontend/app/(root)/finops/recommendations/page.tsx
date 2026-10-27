import { redirect } from 'next/navigation';

export default function FinopsRecommendationsRedirectPage() {
    redirect('/finops?tab=optimize');
}
