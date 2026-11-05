'use client';

import { FinopsCloudAccountDetailsCard } from './finops-cloud-account-details-card';
import type { OrganizationCloudAccount } from '@/app/actions/organization';
import type { FinopsDashboard } from './types';
import { useTranslations } from '@/lib/i18n';

type FinopsCloudAccountsManagementProps = {
    cloudAccounts: OrganizationCloudAccount[];
    dashboards: (FinopsDashboard | null)[];
    isLoading?: boolean;
};

export function FinopsCloudAccountsManagement({ cloudAccounts, dashboards, isLoading = false }: FinopsCloudAccountsManagementProps) {
    const t = useTranslations('finops');

    if (cloudAccounts.length === 0) {
        return (
            <div className="rounded-xl border p-8 text-center">
                <p className="text-muted-foreground">{t.noCloudAccounts}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-semibold">{t.dashboardPerAccount}</h3>
                <p className="text-sm text-muted-foreground">{t.dashboardPerAccountDesc}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cloudAccounts.map((account, index) => (
                    <FinopsCloudAccountDetailsCard key={account.id} account={account} dashboard={dashboards[index] ?? null} isLoading={isLoading} />
                ))}
            </div>
        </div>
    );
}
