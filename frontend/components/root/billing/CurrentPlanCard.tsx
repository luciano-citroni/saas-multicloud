'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/components/providers/locale-provider';
import { useTranslations } from '@/lib/i18n';
import { AiUsageSection } from './ai-usage-section';
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

type CurrentPlanSubscription = {
    status: string;
    currentPeriodEnd: string | null;
    plan: {
        name: string;
        metadata: PlanMetadata | null;
    } | null;
};

function formatAiLimit(value: number | null | undefined, unlimitedLabel: string): string {
    if (value == null) return unlimitedLabel;
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export default function CurrentPlanCard({
    loading,
    subscription,
}: {
    loading: boolean;
    subscription: CurrentPlanSubscription | null;
}) {
    const t = useTranslations('billing');
    const { locale } = useLocale();
    const dateLocale = locale === 'en' ? 'en-US' : 'pt-BR';
    const metadata = subscription?.plan?.metadata ?? null;
    const aiTier = metadata?.aiTier?.trim() || null;
    const modules = metadata?.modules ?? [];

    const statusLabel = subscription
        ? subscription.status === 'active'
            ? t.statusActive
            : subscription.status === 'trialing'
              ? t.statusTrial
              : t.statusInactive
        : t.noSubscription;

    return (
        <div className="flex flex-col gap-4">
            <Card size="sm" className="border-border/70 shadow-xs">
                <CardHeader>
                    <CardTitle>{t.selectedPlan}</CardTitle>
                    <CardDescription>{t.selectedPlanDesc}</CardDescription>
                </CardHeader>

                <CardContent className="grid gap-3 md:grid-cols-3">
                    {loading ? (
                        <>
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </>
                    ) : (
                        <>
                            <div className="rounded-lg border border-border/70 p-3">
                                <p className="text-muted-foreground text-xs">{t.subscriptionStatus}</p>
                                <p className="mt-1 text-sm font-semibold">{statusLabel}</p>
                            </div>
                            <div className="rounded-lg border border-border/70 p-3">
                                <p className="text-muted-foreground text-xs">{t.currentPlan}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold">
                                        {subscription?.plan?.name ?? t.notDefined}
                                    </p>
                                    {aiTier ? (
                                        <Badge variant="secondary" className="uppercase">
                                            {t.aiTier}: {aiTier}
                                        </Badge>
                                    ) : null}
                                </div>
                            </div>
                            <div className="rounded-lg border border-border/70 p-3">
                                <p className="text-muted-foreground text-xs">{t.nextRenewal}</p>
                                <p className="mt-1 text-sm font-semibold">
                                    {subscription?.currentPeriodEnd
                                        ? new Intl.DateTimeFormat(dateLocale).format(
                                              new Date(subscription.currentPeriodEnd),
                                          )
                                        : t.notAvailable}
                                </p>
                            </div>
                        </>
                    )}
                </CardContent>

                <CardHeader className="border-t pt-4">
                    <CardTitle>{t.planLimitsTitle}</CardTitle>
                    <CardDescription>{t.planLimitsDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="grid gap-3 md:grid-cols-3">
                            <Skeleton className="h-14 w-full" />
                            <Skeleton className="h-14 w-full" />
                            <Skeleton className="h-14 w-full" />
                        </div>
                    ) : !subscription?.plan ? (
                        <p className="text-muted-foreground text-sm">{t.noRules}</p>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-lg border border-border/70 p-3">
                                    <p className="text-muted-foreground text-xs">{t.cloudAccounts}</p>
                                    <p className="mt-1 text-sm font-semibold tabular-nums">
                                        {metadata?.maxCloudAccounts ?? '0'}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-border/70 p-3">
                                    <p className="text-muted-foreground text-xs">{t.organizations}</p>
                                    <p className="mt-1 text-sm font-semibold tabular-nums">
                                        {metadata?.maxOrgAccounts ?? '0'}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-border/70 p-3">
                                    <p className="text-muted-foreground text-xs">{t.users}</p>
                                    <p className="mt-1 text-sm font-semibold tabular-nums">
                                        {metadata?.maxUsers ?? '0'}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 rounded-lg border border-border/70 p-3">
                                <p className="text-muted-foreground text-xs font-medium">{t.modulesEnabled}</p>
                                <PlanModulesBadges modules={modules} emptyLabel={t.noModules} />
                            </div>

                            {aiTier ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-lg border border-border/70 p-3">
                                        <p className="text-muted-foreground text-xs">{t.aiDailyLimit}</p>
                                        <p className="mt-1 text-sm font-semibold tabular-nums">
                                            {formatAiLimit(metadata?.aiDailyLimit, t.aiUnlimited)}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-border/70 p-3">
                                        <p className="text-muted-foreground text-xs">{t.aiMonthlyLimit}</p>
                                        <p className="mt-1 text-sm font-semibold tabular-nums">
                                            {formatAiLimit(metadata?.aiMonthlyLimit, t.aiUnlimited)}
                                        </p>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    )}
                </CardContent>
            </Card>

            {!loading && subscription?.plan ? (
                <AiUsageSection planModules={modules} planAiTier={aiTier} />
            ) : null}
        </div>
    );
}
