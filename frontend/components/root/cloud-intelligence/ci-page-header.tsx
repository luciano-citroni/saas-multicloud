'use client';

import { BrainCircuit } from 'lucide-react';
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
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
                <div className="text-muted-foreground flex items-center gap-2">
                    <BrainCircuit className="size-4" />
                    <span className="text-xs font-medium tracking-wide uppercase">{t.eyebrow}</span>
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
                {description ? (
                    <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
                        {description}
                    </p>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {actions}
                <CiSubnav />
            </div>
        </div>
    );
}
