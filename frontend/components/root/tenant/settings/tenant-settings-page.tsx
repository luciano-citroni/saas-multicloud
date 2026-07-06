'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { deleteUserOrganization, fetchUserOrganizations, type UserOrganization } from '@/app/actions/organization';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY, notifySidebarContextUpdated } from '@/lib/sidebar-context';
import { useTranslations } from '@/lib/i18n';
import { TenantSettingsDeleteDialog } from './tenant-settings-delete-dialog';
import { TenantSettingsTable } from './tenant-settings-table';
import { normalizeOrganizations, type OrganizationsApiPayload } from './tenant-settings-utils';

export function TenantSettingsPage() {
    const t = useTranslations('organizations');
    const tc = useTranslations('common');
    const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [deletingTenant, setDeletingTenant] = useState<UserOrganization | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadOrganizations = useCallback(
        async (options?: { nextRefreshing?: boolean }) => {
            const nextRefreshing = options?.nextRefreshing ?? false;

            if (nextRefreshing) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            try {
                const response = await fetchUserOrganizations({ page: 1, limit: 100 });
                const payload = (await response.json().catch(() => null)) as OrganizationsApiPayload | null;

                if (!response.ok) {
                    toast.error(extractErrorMessage(payload));
                    setOrganizations([]);
                    return;
                }

                setOrganizations(normalizeOrganizations(payload));
            } catch {
                toast.error(t.loadError);
                setOrganizations([]);
            } finally {
                if (nextRefreshing) {
                    setRefreshing(false);
                } else {
                    setLoading(false);
                }
            }
        },
        [t]
    );

    useEffect(() => {
        void loadOrganizations();
    }, [loadOrganizations]);

    const onDelete = async (): Promise<void> => {
        if (!deletingTenant) {
            return;
        }

        setIsDeleting(true);

        try {
            const response = await deleteUserOrganization(deletingTenant.id);
            const payload = (await response.json().catch(() => null)) as unknown;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }

            if (window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) === deletingTenant.id) {
                window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
            }

            notifySidebarContextUpdated();
            toast.success(t.deleteSuccess);
            setDeletingTenant(null);
            await loadOrganizations();
        } catch {
            toast.error(t.deleteError);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">{t.tenantsTitle}</p>
                        <p className="text-xs text-muted-foreground">{t.tenantsDesc}</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button variant="outline" size="sm" onClick={() => void loadOrganizations({ nextRefreshing: true })} isLoading={refreshing}>
                            {tc.refresh}
                        </Button>
                    </div>
                </div>
                <div className="flex flex-col gap-4 px-4 py-4">
                    {loading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : (
                        <TenantSettingsTable data={organizations} onDelete={setDeletingTenant} />
                    )}
                </div>
            </div>

            <TenantSettingsDeleteDialog
                organization={deletingTenant}
                isDeleting={isDeleting}
                onOpenChange={(open) => !open && setDeletingTenant(null)}
                onConfirm={onDelete}
            />
        </div>
    );
}
