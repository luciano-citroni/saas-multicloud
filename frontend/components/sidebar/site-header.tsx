'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useTranslations } from '@/lib/i18n';

function isId(segment: string) {
    return segment.length > 20 || /^[0-9]+$/.test(segment);
}

export function SiteHeader() {
    const pathname = usePathname();
    const nav = useTranslations('nav');
    const finops = useTranslations('finops');
    const automation = useTranslations('automation');

    const routeNames: Record<string, string> = {
        organizations: nav.organizations,
        new: nav.breadcrumbNew,
        billing: nav.plans,
        settings: nav.settings,
        notifications: nav.notifications,
        'cloud-accounts': nav.cloudAccounts,
        edit: nav.breadcrumbEdit,
        assessment: nav.assessment,
        governance: nav.governance,
        analysis: nav.breadcrumbAnalysis,
        finops: nav.finops,
        anomalies: finops.subnavAnomalies,
        savings: finops.subnavSavings,
        commitments: finops.subnavCommitments,
        multicloud: finops.subnavMulticloud,
        budgets: finops.subnavBudgets,
        reports: finops.subnavReports,
        accounts: finops.subnavAccountDetail,
        tenant: nav.tenants,
        users: nav.users,
        automation: nav.automation,
        automations: nav.automation,
        published: automation.published,
        executions: automation.executions,
        members: nav.members,
    };

    const rawSegments = pathname.split('/').filter(Boolean);

    const breadcrumbs: { title: string; url: string }[] = [];

    let i = 0;

    while (i < rawSegments.length) {
        const segment = rawSegments[i];

        if (isId(segment)) {
            i++;
            continue;
        }

        let endIndex = i;

        if (rawSegments[i + 1] && isId(rawSegments[i + 1])) {
            endIndex = i + 1;
        }

        const url = `/${rawSegments.slice(0, i + 1).join('/')}`;
        const parent = i > 0 ? rawSegments[i - 1] : undefined;
        const title = titleForSegment(segment, parent);

        breadcrumbs.push({ title, url });

        i = endIndex + 1;
    }

    if (pathname === '/finops') {
        breadcrumbs.push({ title: finops.subnavOverview, url: '/finops' });
    }

    function titleForSegment(segment: string, parent: string | undefined): string {
        if (segment === 'new') {
            if (parent === 'cloud-accounts') return nav.newCloudAccount;
            if (parent === 'tenant') return nav.newTenant;
            if (parent === 'automations') return automation.newAutomation;
        }

        return routeNames[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
    }

    return (
        <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
            <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
                <SidebarTrigger className="-ml-1" />

                <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />

                <nav aria-label="Breadcrumb" className="text-base font-medium flex items-center gap-2">
                    {breadcrumbs.length === 0 && <span>{nav.dashboard}</span>}

                    {breadcrumbs.map((crumb, index) => (
                        <span key={`${crumb.url}-${index}`} className="flex items-center gap-2">
                            {index > 0 && <span aria-hidden="true">/</span>}

                            {index === breadcrumbs.length - 1 ? (
                                <span aria-current="page">{crumb.title}</span>
                            ) : (
                                <Link href={crumb.url} className="hover:underline">
                                    {crumb.title}
                                </Link>
                            )}
                        </span>
                    ))}
                </nav>
            </div>
        </header>
    );
}
