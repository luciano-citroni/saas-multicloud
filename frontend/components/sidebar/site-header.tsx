'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

const navMain = [{ title: 'Dashboard', url: '/' }];

const routeNames: Record<string, string> = {
    organizations: 'Organizações',
    new: 'Nova',
    billing: 'Planos e Regras',
    settings: 'Configurações',
    'cloud-accounts': 'Contas Cloud',
    edit: 'Editar',
};

function isId(segment: string) {
    return segment.length > 20 || /^[0-9]+$/.test(segment);
}

export function SiteHeader() {
    const pathname = usePathname();

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

        const found = navMain.find((item) => item.url === url);

        const title = found?.title ?? routeNames[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);

        breadcrumbs.push({ title, url });

        i = endIndex + 1;
    }

    return (
        <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
            <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
                <SidebarTrigger className="-ml-1" />

                <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />

                <h1 className="text-base font-medium flex items-center gap-2">
                    {breadcrumbs.length === 0 && 'Dashboard'}

                    {breadcrumbs.map((crumb, index) => (
                        <span key={crumb.url} className="flex items-center gap-2">
                            {index > 0 && <span>/</span>}

                            {index === breadcrumbs.length - 1 ? (
                                <span>{crumb.title}</span>
                            ) : (
                                <Link href={crumb.url} className="hover:underline">
                                    {crumb.title}
                                </Link>
                            )}
                        </span>
                    ))}
                </h1>
            </div>
        </header>
    );
}
