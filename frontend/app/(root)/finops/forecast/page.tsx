import { redirect } from 'next/navigation';

export default function FinopsForecastRedirectPage() {
    redirect('/finops?tab=spend');
}
