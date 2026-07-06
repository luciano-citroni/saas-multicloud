'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { modulesLabel } from '../../../lib/modules';
import { useTranslations } from '@/lib/i18n';
import { useLocale } from '@/components/providers/locale-provider';

type PlanMetadata = { maxCloudAccounts: number; maxOrgAccounts: number; maxUsers: number; modules: string[] };

type BillingPlan = {
    productId: string;
    priceId: string;
    name: string;
    description: string | null;
    unitAmount: number;
    currency: string;
    interval: string;
    metadata: PlanMetadata;
    active: boolean;
};

export default function PlanCard({
    plan,
    isCurrent,
    isChanging,
    canChoose,
    disabledReason,
    onChoose,
}: {
    plan: BillingPlan;
    isCurrent: boolean;
    isChanging: boolean;
    canChoose: boolean;
    disabledReason?: string;
    onChoose: (priceId: string) => void;
}) {
    const t = useTranslations('billing');
    const { locale } = useLocale();
    const currencyLocale = locale === 'en' ? 'en-US' : 'pt-BR';

    return (
        <Card key={plan.priceId} className={isCurrent ? 'border-primary' : undefined}>
            <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {isCurrent ? <Badge>{t.currentBadge}</Badge> : null}
                </div>
                <CardDescription>{plan.description ?? t.noDescription}</CardDescription>
                <p className="text-2xl font-semibold">
                    {(plan.unitAmount / 100).toLocaleString(currencyLocale, { style: 'currency', currency: plan.currency.toUpperCase() })}
                    <span className="text-sm font-normal text-muted-foreground"> {plan.interval === 'year' ? t.perYear : t.perMonth}</span>
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2 rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{t.planRules}</p>
                    <p className="text-sm">
                        <span className="font-medium">{t.cloudAccounts}:</span> {plan.metadata.maxCloudAccounts}
                    </p>
                    <p className="text-sm">
                        <span className="font-medium">{t.organizations}:</span> {plan.metadata.maxOrgAccounts}
                    </p>
                    <p className="text-sm">
                        <span className="font-medium">{t.users}:</span> {plan.metadata.maxUsers}
                    </p>
                    <p className="text-sm">
                        <span className="font-medium">{t.modules}:</span> {modulesLabel(plan.metadata.modules)}
                    </p>
                </div>

                <Button className="w-full" disabled={isCurrent || isChanging || !canChoose} onClick={() => onChoose(plan.priceId)} title={disabledReason}>
                    {isCurrent ? t.currentBadge : isChanging ? t.updating : t.choosePlan}
                </Button>
            </CardContent>
        </Card>
    );
}
