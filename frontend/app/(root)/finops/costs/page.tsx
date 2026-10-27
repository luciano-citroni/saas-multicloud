import { redirect } from 'next/navigation';

export default function FinopsCostsRedirectPage() {
    redirect('/finops?tab=spend');
}
