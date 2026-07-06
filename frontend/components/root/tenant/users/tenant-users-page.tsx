'use client';

import { OrganizationMembersTab } from '@/components/root/organizations/members/organization-members-tab';
import { type OrganizationRole } from '@/lib/organization-rbac';
import { useTranslations } from '@/lib/i18n';

type Props = {
    organizationId: string;
    organizationName: string;
    currentRole: OrganizationRole;
    currentUserId?: string;
};

export function TenantUsersPage({ organizationId, organizationName, currentRole, currentUserId }: Props) {
    const tm = useTranslations('members');

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">{tm.title}</p>
                    {organizationName && (
                        <p className="text-xs text-muted-foreground">{organizationName}</p>
                    )}
                </div>
                <div className="min-w-0 px-4 py-4">
                    <OrganizationMembersTab
                        organizationId={organizationId}
                        currentRole={currentRole}
                        currentUserId={currentUserId}
                    />
                </div>
            </div>
        </div>
    );
}
