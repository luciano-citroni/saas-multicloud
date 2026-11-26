'use client';

import { Suspense, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Building2, Settings2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/root/layout';
import { FormOrganizationEdit } from '@/components/root/organizations/edit/form-organization-edit';
import { OrganizationEditLoadingSkeleton } from '@/components/root/organizations/edit/organization-edit-loading-skeleton';
import { OrganizationMembersTab } from '@/components/root/organizations/members/organization-members-tab';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canEditOrganization, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useTranslations } from '@/lib/i18n';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';
import { cn } from '@/lib/utils';

type EditTab = 'settings' | 'users';

function parseTab(value: string | null): EditTab {
    return value === 'users' ? 'users' : 'settings';
}

function EditOrganizationPageContent() {
    const params = useParams<{ organizationId: string }>();
    const organizationId = params?.organizationId;
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const to = useTranslations('organizations');
    const sidebarQuery = useSidebarContext();

    const activeTab = useMemo(() => parseTab(searchParams.get('tab')), [searchParams]);

    useEffect(() => {
        if (!organizationId) {
            toast.error(to.invalidOrg);
            router.replace('/organizations');
            return;
        }

        if (!sidebarQuery.isFetched || sidebarQuery.isLoading) {
            return;
        }

        if (sidebarQuery.isError || !sidebarQuery.data) {
            toast.error(to.validatePermissionsError);
            router.replace('/organizations');
            return;
        }

        const targetOrganization = sidebarQuery.data.organizations.find(
            (organization) => organization.id === organizationId,
        );
        const role = normalizeOrganizationRole(targetOrganization?.currentRole ?? null);

        if (!canEditOrganization(role)) {
            toast.error(to.noEditPermission);
            router.replace('/organizations');
        }
    }, [organizationId, router, sidebarQuery.data, sidebarQuery.isError, sidebarQuery.isFetched, sidebarQuery.isLoading, to]);

    const setTab = (tab: string) => {
        const next = parseTab(tab);
        const paramsNext = new URLSearchParams(searchParams.toString());
        if (next === 'settings') paramsNext.delete('tab');
        else paramsNext.set('tab', next);
        const query = paramsNext.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    if (!organizationId || !sidebarQuery.isFetched || sidebarQuery.isLoading || !sidebarQuery.data) {
        return <OrganizationEditLoadingSkeleton />;
    }

    const targetOrganization = sidebarQuery.data.organizations.find(
        (organization) => organization.id === organizationId,
    );
    const currentRole = normalizeOrganizationRole(targetOrganization?.currentRole ?? null);

    if (!currentRole || !canEditOrganization(currentRole)) {
        return null;
    }

    return (
        <div className="flex flex-col gap-6 pb-24">
            <PageHeader
                title={to.editTitle}
                description={to.editDesc}
                eyebrow={
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs">
                        <Building2 className="size-3.5 shrink-0" />
                        <span className="truncate">{targetOrganization?.name ?? organizationId}</span>
                    </span>
                }
                actions={
                    <Button asChild variant="outline" size="sm" className="w-full lg:w-auto">
                        <Link href="/organizations" prefetch={false}>
                            <ArrowLeft className="size-4" />
                            {to.backToOrganizations}
                        </Link>
                    </Button>
                }
            />

            <Tabs value={activeTab} onValueChange={setTab} className="flex min-w-0 flex-col gap-4">
                <div className="overflow-x-auto">
                    <TabsList className="inline-flex h-auto w-max min-w-full justify-start gap-1 bg-muted/40 p-1 lg:min-w-0">
                        <TabsTrigger
                            value="settings"
                            className={cn(
                                'gap-1.5 px-3 py-1.5 text-xs sm:text-sm',
                                'data-[state=active]:shadow-xs',
                            )}
                        >
                            <Settings2 className="size-3.5" />
                            {to.tabSettings}
                        </TabsTrigger>
                        <TabsTrigger
                            value="users"
                            className={cn(
                                'gap-1.5 px-3 py-1.5 text-xs sm:text-sm',
                                'data-[state=active]:shadow-xs',
                            )}
                        >
                            <Users className="size-3.5" />
                            {to.tabUsers}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="settings" className="mt-0 min-w-0 focus-visible:outline-none">
                    <FormOrganizationEdit organizationId={organizationId} currentRole={currentRole} />
                </TabsContent>

                <TabsContent value="users" className="mt-0 min-w-0 focus-visible:outline-none">
                    <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
                        <OrganizationMembersTab
                            organizationId={organizationId}
                            currentRole={currentRole}
                            currentUserId={sidebarQuery.data.user.id}
                        />
                    </section>
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function EditOrganizationPage() {
    return (
        <Suspense fallback={<OrganizationEditLoadingSkeleton />}>
            <EditOrganizationPageContent />
        </Suspense>
    );
}
