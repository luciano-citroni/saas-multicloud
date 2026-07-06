'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import PlanCard from './PlanCard';
import CurrentPlanCard from './CurrentPlanCard';
import { Skeleton } from '@/components/ui/skeleton';
import { normalizePlanModules } from '../../../lib/modules';
import { fetchPlans, fetchSubscription, createChangePlanSession } from '@/app/actions/billing';
import { useTranslations } from '@/lib/i18n';
import { ACTIVE_ORG_STORAGE_KEY, notifySidebarContextUpdated } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';

type PlanMetadata = {
    maxCloudAccounts: number;
    maxOrgAccounts: number;
    maxUsers: number;
    modules: string[];
};

function normalizeBillingPlan(plan: BillingPlan): BillingPlan {
    return {
        ...plan,
        metadata: {
            ...plan.metadata,
            modules: normalizePlanModules(plan.metadata.modules),
        },
    };
}

function normalizeBillingSubscription(subscription: BillingSubscription): BillingSubscription {
    return {
        ...subscription,
        plan: subscription.plan ? normalizeBillingPlan(subscription.plan) : null,
    };
}

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

type BillingSubscription = {
    id: string;
    tenantId: string;
    stripePriceId: string | null;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    plan: BillingPlan | null;
};

type ChangePlanCheckoutSession = {
    checkoutSessionId: string;
    checkoutUrl: string;
};

async function extractResponseError(response: Response, fallbackMessage: string): Promise<string> {
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!payload) {
        return fallbackMessage;
    }

    const message = extractErrorMessage(payload, 'pt');
    return message || fallbackMessage;
}

export function BillingPlansRules() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const handledCheckoutRef = useRef(false);
    const t = useTranslations('billing');
    const [loading, setLoading] = useState(true);
    const [changingPriceId, setChangingPriceId] = useState<string | null>(null);
    const [plans, setPlans] = useState<BillingPlan[]>([]);
    const [subscription, setSubscription] = useState<BillingSubscription | null>(null);

    const currentPriceId = subscription?.stripePriceId ?? null;

    const loadBillingData = useCallback(
        async (checkoutSessionId?: string) => {
            const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);

            if (!organizationId) {
                setLoading(false);
                return;
            }

            setLoading(true);

            try {
                const [plansResponse, subscriptionResponse] = await Promise.all([
                    fetchPlans(),
                    fetchSubscription(organizationId, checkoutSessionId),
                ]);

                if (plansResponse.status === 401 || subscriptionResponse.status === 401) {
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!plansResponse.ok) {
                    toast.error(await extractResponseError(plansResponse, t.loadPlansError));
                    setPlans([]);
                } else {
                    const plansPayload = (await plansResponse.json()) as BillingPlan[];
                    setPlans(Array.isArray(plansPayload) ? plansPayload.map(normalizeBillingPlan) : []);
                }

                if (subscriptionResponse.status === 404) {
                    setSubscription(null);
                    return;
                }

                if (!subscriptionResponse.ok) {
                    toast.error(await extractResponseError(subscriptionResponse, t.loadSubscriptionError));
                    setSubscription(null);
                    return;
                }

                const subscriptionPayload = (await subscriptionResponse.json()) as BillingSubscription;
                setSubscription(normalizeBillingSubscription(subscriptionPayload));
            } catch {
                toast.error(t.loadBillingError);
            } finally {
                setLoading(false);
            }
        },
        [router]
    );

    useEffect(() => {
        void loadBillingData();
    }, [loadBillingData]);

    useEffect(() => {
        if (handledCheckoutRef.current) {
            return;
        }

        const checkoutStatus = searchParams.get('checkout');
        const checkoutSessionId = searchParams.get('session_id');

        if (checkoutStatus === 'success') {
            handledCheckoutRef.current = true;
            toast.success(t.paymentConfirmed);
            notifySidebarContextUpdated();
            void loadBillingData(checkoutSessionId ?? undefined);
            router.replace('/billing');
            router.refresh();
            return;
        }

        if (checkoutStatus === 'cancel') {
            handledCheckoutRef.current = true;
            toast.error(t.checkoutCanceled);
            router.replace('/billing');
        }
    }, [loadBillingData, router, searchParams]);

    const handleChangePlan = useCallback(
        async (priceId: string) => {
            const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);

            if (!organizationId) {
                toast.error(t.loadBillingError);
                return;
            }

            setChangingPriceId(priceId);

            try {
                const response = await createChangePlanSession(organizationId, priceId);

                if (response.status === 401) {
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!response.ok) {
                    toast.error(await extractResponseError(response, t.changePlanError));
                    return;
                }

                const payload = (await response.json().catch(() => null)) as ChangePlanCheckoutSession | null;

                if (!payload?.checkoutUrl) {
                    toast.error(t.noCheckoutUrl);
                    return;
                }

                toast.success(t.redirectingToCheckout);
                window.location.assign(payload.checkoutUrl);
            } catch {
                toast.error(t.changePlanError);
            } finally {
                setChangingPriceId(null);
            }
        },
        [router]
    );

    return (
        <div className="flex w-full flex-col gap-4">
            <CurrentPlanCard loading={loading} subscription={subscription} />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {loading ? (
                    <>
                        <Skeleton className="h-64 w-full" />
                        <Skeleton className="h-64 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </>
                ) : (
                    plans.map((plan) => {
                        const isCurrent = currentPriceId === plan.priceId;
                        const isChanging = changingPriceId === plan.priceId;

                        return (
                            <PlanCard
                                key={plan.priceId}
                                plan={plan}
                                isCurrent={isCurrent}
                                isChanging={isChanging}
                                canChoose={true}
                                onChoose={(p) => void handleChangePlan(p)}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
}
