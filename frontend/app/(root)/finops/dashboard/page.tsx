import { redirect } from 'next/navigation';

type PageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FinopsDashboardRedirectPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const accountRaw = params.account;
    const account = Array.isArray(accountRaw) ? accountRaw[0] : accountRaw;

    if (account) {
        redirect(`/finops/accounts/${encodeURIComponent(account)}`);
    }

    redirect('/finops');
}
