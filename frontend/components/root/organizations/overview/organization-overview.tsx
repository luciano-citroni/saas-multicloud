'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { type UserOrganization, fetchUserOrganizations } from '@/app/actions/organization';
import { Button } from '@/components/ui/button';
import { extractErrorMessage } from '@/lib/error-messages';
import { Skeleton } from '@/components/ui/skeleton';
import { OrganizationTable } from './organization-table';
import { useTranslations } from '@/lib/i18n';
import { ACTIVE_ORG_STORAGE_KEY, SIDEBAR_CONTEXT_UPDATED_EVENT } from '@/lib/sidebar-context';

type ApiErrorPayload = {
    message?: string | string[];
    statusCode?: number;
    error?: string;
    path?: string;
    timestamp?: string;
};

type OrganizationsApiPayload =
    | UserOrganization[]
    | {
          items?: UserOrganization[];
      };

function normalizeOrganizations(payload: OrganizationsApiPayload | null): UserOrganization[] {
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];

    return items.filter((organization): organization is UserOrganization => {
        return typeof organization?.id === 'string' && typeof organization?.name === 'string';
    });
}

export function OrganizationOverview() {
    const router = useRouter();
    const t = useTranslations('organizations');
    const tc = useTranslations('common');
    const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadOrganizations = useCallback(
        async (options?: { silent?: boolean; nextRefreshing?: boolean }) => {
            const silent = options?.silent ?? false;
            const nextRefreshing = options?.nextRefreshing ?? false;

            if (nextRefreshing) {
                setRefreshing(true);
            } else if (!silent) {
                setLoading(true);
            }

            try {
                const response = await fetchUserOrganizations();
                const payload = (await response.json().catch(() => null)) as OrganizationsApiPayload | ApiErrorPayload | null;

                if (response.status === 401) {
                    toast.error(t.sessionExpired);
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!response.ok) {
                    if (!silent) {
                        toast.error(extractErrorMessage(payload));
                    }
                    setOrganizations([]);
                    return;
                }

                setOrganizations(normalizeOrganizations(payload as OrganizationsApiPayload | null));
            } catch {
                if (!silent) {
                    toast.error(t.loadError);
                }
                setOrganizations([]);
            } finally {
                if (nextRefreshing) {
                    setRefreshing(false);
                } else if (!silent) {
                    setLoading(false);
                }
            }
        },
        [router]
    );

    useEffect(() => {
        void loadOrganizations();
    }, [loadOrganizations]);

    const handleEditOrganization = (organizationId: string) => {
        router.push(`/organizations/${organizationId}/edit`);
    };

    const handleViewCloudAccounts = (organizationId: string) => {
        window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, organizationId);
        window.dispatchEvent(new Event(SIDEBAR_CONTEXT_UPDATED_EVENT));
        router.push('/cloud-accounts');
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">{t.accessibleTitle}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Link href="/tenant/new">
                            <Button size="sm">
                                <Plus className="mr-1 h-4 w-4" />
                                {t.newOrg}
                            </Button>
                        </Link>
                        <Button variant="outline" size="sm" onClick={() => void loadOrganizations({ nextRefreshing: true })} isLoading={refreshing}>
                            {tc.refresh}
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="space-y-3 p-4">
                        <Skeleton className="h-10 w-full rounded-md" />
                        <Skeleton className="h-10 w-full rounded-md" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                ) : organizations.length === 0 ? (
                    <div className="px-4 py-6">
                        <p className="text-sm text-muted-foreground">{t.noOrgs}</p>
                    </div>
                ) : (
                    <div className="p-4">
                        <OrganizationTable data={organizations} onEditOrganization={handleEditOrganization} onViewCloudAccounts={handleViewCloudAccounts} />
                    </div>
                )}
            </div>
        </div>
    );
}
