'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { modulesLabel } from '../../../lib/modules';
import { useTranslations } from '@/lib/i18n';
import { useLocale } from '@/components/providers/locale-provider';

type BillingSubscription = {
    id: string;
    userId: string;
    stripePriceId: string | null;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    plan: {
        name: string;
        metadata: { maxCloudAccounts: number; maxOrgAccounts: number; maxUsers: number; modules: string[] } | null;
    } | null;
};

export default function CurrentPlanCard({ loading, subscription }: { loading: boolean; subscription: BillingSubscription | null }) {
    const t = useTranslations('billing');
    const { locale } = useLocale();
    const dateLocale = locale === 'en' ? 'en-US' : 'pt-BR';

    const statusLabel = subscription
        ? subscription.status === 'active'
            ? t.statusActive
            : subscription.status === 'trialing'
              ? t.statusTrial
              : t.statusInactive
        : t.noSubscription;

    return (
        <Card>
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
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">{t.subscriptionStatus}</p>
                            <p className="mt-1 text-sm font-semibold">{statusLabel}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">{t.currentPlan}</p>
                            <p className="mt-1 text-sm font-semibold">{subscription?.plan?.name ?? t.notDefined}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">{t.nextRenewal}</p>
                            <p className="mt-1 text-sm font-semibold">
                                {subscription?.currentPeriodEnd
                                    ? new Intl.DateTimeFormat(dateLocale).format(new Date(subscription.currentPeriodEnd))
                                    : t.notAvailable}
                            </p>
                        </div>
                    </>
                )}
            </CardContent>

            <CardHeader>
                <CardTitle>{t.planLimitsTitle}</CardTitle>
                <CardDescription>{t.planLimitsDesc}</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="grid gap-3 md:grid-cols-4">
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                ) : !subscription?.plan ? (
                    <p className="text-sm text-muted-foreground">{t.noRules}</p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">{t.cloudAccounts}</p>
                            <p className="mt-1 text-sm font-semibold">{subscription.plan.metadata?.maxCloudAccounts ?? '0'}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">{t.organizations}</p>
                            <p className="mt-1 text-sm font-semibold">{subscription.plan.metadata?.maxOrgAccounts ?? '0'}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">{t.users}</p>
                            <p className="mt-1 text-sm font-semibold">{subscription.plan.metadata?.maxUsers ?? '0'}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">{t.modules}</p>
                            <p className="mt-1 text-sm font-semibold">{modulesLabel(subscription.plan.metadata?.modules ?? [])}</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
