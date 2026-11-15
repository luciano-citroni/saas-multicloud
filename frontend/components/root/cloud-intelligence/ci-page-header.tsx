'use client';

import { BrainCircuit } from 'lucide-react';
import { PageHeader } from '@/components/root/layout';
import { useTranslations } from '@/lib/i18n';
import { CiSubnav } from './ci-subnav';

export function CiPageHeader({
    title,
    description,
    actions,
}: {
    title: string;
    description?: string;
    actions?: React.ReactNode;
}) {
    const t = useTranslations('cloudIntelligence');

    return (
        <PageHeader
            className="sm:items-end"
            eyebrow={
                <>
                    <BrainCircuit className="size-4" />
                    <span className="text-xs font-medium tracking-wide uppercase">{t.eyebrow}</span>
                </>
            }
            title={title}
            description={description}
            actions={
                <>
                    {actions}
                    <CiSubnav />
                </>
            }
        />
    );
}
