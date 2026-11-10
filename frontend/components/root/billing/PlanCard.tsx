'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/components/providers/locale-provider';
import { useTranslations } from '@/lib/i18n';
import { PlanModulesBadges } from './plan-modules';

type PlanMetadata = {
    maxCloudAccounts: number;
    maxOrgAccounts: number;
    maxUsers: number;
    modules: string[];
    aiTier?: string | null;
    aiDailyLimit?: number | null;
    aiMonthlyLimit?: number | null;
};

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

function formatAiLimit(value: number | null | undefined, unlimitedLabel: string): string {
    if (value == null) return unlimitedLabel;
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

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
    const aiTier = plan.metadata.aiTier?.trim() || null;

    return (
        <Card
            key={plan.priceId}
            size="sm"
            className={isCurrent ? 'border-primary shadow-xs' : 'border-border/70 shadow-xs'}
        >
            <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                        {aiTier ? (
                            <Badge variant="secondary" className="uppercase">
                                {t.aiTier}: {aiTier}
                            </Badge>
                        ) : null}
                        {isCurrent ? <Badge>{t.currentBadge}</Badge> : null}
                    </div>
                </div>
                <CardDescription>{plan.description ?? t.noDescription}</CardDescription>
                <p className="text-2xl font-semibold">
                    {(plan.unitAmount / 100).toLocaleString(currencyLocale, {
                        style: 'currency',
                        currency: plan.currency.toUpperCase(),
                    })}
                    <span className="text-muted-foreground text-sm font-normal">
                        {' '}
                        {plan.interval === 'year' ? t.perYear : t.perMonth}
                    </span>
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3 rounded-lg border border-border/70 p-3">
                    <p className="text-muted-foreground text-xs">{t.planRules}</p>
                    <div className="grid gap-1.5 text-sm">
                        <p>
                            <span className="font-medium">{t.cloudAccounts}:</span>{' '}
                            {plan.metadata.maxCloudAccounts}
                        </p>
                        <p>
                            <span className="font-medium">{t.organizations}:</span>{' '}
                            {plan.metadata.maxOrgAccounts}
                        </p>
                        <p>
                            <span className="font-medium">{t.users}:</span> {plan.metadata.maxUsers}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <p className="text-sm font-medium">{t.modules}</p>
                        <PlanModulesBadges modules={plan.metadata.modules} emptyLabel={t.noModules} />
                    </div>

                    {aiTier ? (
                        <div className="grid gap-1.5 border-t pt-3 text-sm">
                            <p>
                                <span className="font-medium">{t.aiDailyLimit}:</span>{' '}
                                {formatAiLimit(plan.metadata.aiDailyLimit, t.aiUnlimited)}
                            </p>
                            <p>
                                <span className="font-medium">{t.aiMonthlyLimit}:</span>{' '}
                                {formatAiLimit(plan.metadata.aiMonthlyLimit, t.aiUnlimited)}
                            </p>
                        </div>
                    ) : null}
                </div>

                <Button
                    className="w-full"
                    disabled={isCurrent || isChanging || !canChoose}
                    onClick={() => onChoose(plan.priceId)}
                    title={disabledReason}
                >
                    {isCurrent ? t.currentBadge : isChanging ? t.updating : t.choosePlan}
                </Button>
            </CardContent>
        </Card>
    );
}
