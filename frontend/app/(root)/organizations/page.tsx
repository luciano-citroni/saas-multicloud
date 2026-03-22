import { OrganizationCloudSync } from '@/components/root/organizations/overview/organization-cloud-sync';
import { Building2 } from 'lucide-react';

export default function OrganizationsPage() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    <Building2 className="size-5" />
                    Organizações
                </h1>
                <p className="text-sm text-muted-foreground">Gerencie contas cloud da organização e acompanhe o status das sincronizações.</p>
            </div>

            <OrganizationCloudSync />
        </div>
    );
}
