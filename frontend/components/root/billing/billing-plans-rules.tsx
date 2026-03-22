'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import PlanCard from './PlanCard';
import CurrentPlanCard from './CurrentPlanCard';
import { Skeleton } from '@/components/ui/skeleton';
import { normalizePlanModules } from '../../../lib/modules';
import { fetchPlans, fetchSubscription, createChangePlanSession } from '@/app/actions/billing';
import { canManageBilling, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';

const ACTIVE_ORG_STORAGE_KEY = 'smc_active_organization_id';

type PlanMetadata = {
    maxCloudAccounts: number;
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
    organizationId: string;
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

type SidebarContextPayload = {
    organizations?: Array<{
        id?: string;
        currentRole?: string | null;
    }>;
};

// using imported modulesLabel

export function BillingPlansRules() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const handledCheckoutRef = useRef(false);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [resolvingRole, setResolvingRole] = useState(true);
    const [organizationRole, setOrganizationRole] = useState<OrganizationRole | null>(null);
    const [changingPriceId, setChangingPriceId] = useState<string | null>(null);
    const [plans, setPlans] = useState<BillingPlan[]>([]);
    const [subscription, setSubscription] = useState<BillingSubscription | null>(null);

    const currentPriceId = subscription?.stripePriceId ?? null;
    const canChangePlan = canManageBilling(organizationRole);

    const loadBillingData = useCallback(
        async (orgId: string, checkoutSessionId?: string) => {
            setLoading(true);

            try {
                const subscriptionUrl = new URL('/api/billing/subscription', window.location.origin);
                subscriptionUrl.searchParams.set('organizationId', orgId);

                if (checkoutSessionId) {
                    subscriptionUrl.searchParams.set('checkoutSessionId', checkoutSessionId);
                }

                const [plansResponse, subscriptionResponse] = await Promise.all([fetchPlans(orgId), fetchSubscription(orgId, checkoutSessionId)]);

                if (plansResponse.status === 401 || subscriptionResponse.status === 401) {
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!plansResponse.ok) {
                    toast.error('Não foi possível carregar os planos.');
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
                    toast.error('Não foi possível carregar a assinatura da organização.');
                    setSubscription(null);
                    return;
                }

                const subscriptionPayload = (await subscriptionResponse.json()) as BillingSubscription;
                setSubscription(normalizeBillingSubscription(subscriptionPayload));
            } catch {
                toast.error('Não foi possível carregar os dados de billing.');
            } finally {
                setLoading(false);
            }
        },
        [router]
    );

    useEffect(() => {
        const loadRole = async (orgId: string) => {
            setResolvingRole(true);

            try {
                const response = await fetch('/api/sidebar/context', { cache: 'no-store' });
                if (!response.ok) {
                    setOrganizationRole(null);
                    return;
                }

                const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
                const activeOrganization = payload?.organizations?.find((organization) => organization?.id === orgId);
                setOrganizationRole(normalizeOrganizationRole(activeOrganization?.currentRole ?? null));
            } catch {
                setOrganizationRole(null);
            } finally {
                setResolvingRole(false);
            }
        };

        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);

        if (!orgId) {
            toast.error('Selecione uma organização para visualizar os planos.');
            router.replace('/');
            return;
        }

        setOrganizationId(orgId);
        void loadBillingData(orgId);
        void loadRole(orgId);
    }, [loadBillingData, router]);

    useEffect(() => {
        if (handledCheckoutRef.current || !organizationId) {
            return;
        }

        const checkoutStatus = searchParams.get('checkout');
        const checkoutSessionId = searchParams.get('session_id');

        if (checkoutStatus === 'success') {
            handledCheckoutRef.current = true;
            toast.success('Pagamento confirmado. Plano atualizado com sucesso.');
            void loadBillingData(organizationId, checkoutSessionId ?? undefined);
            router.replace('/billing');
            router.refresh();
            return;
        }

        if (checkoutStatus === 'cancel') {
            handledCheckoutRef.current = true;
            toast.error('Checkout cancelado. Nenhuma alteração foi aplicada.');
            router.replace('/billing');
        }
    }, [loadBillingData, organizationId, router, searchParams]);

    const handleChangePlan = useCallback(
        async (priceId: string) => {
            if (!organizationId) {
                return;
            }

            if (!canChangePlan) {
                toast.error('Apenas OWNER ou ADMIN pode alterar o plano da organização.');
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
                    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
                    toast.error(payload?.message ?? 'Não foi possível trocar o plano.');
                    return;
                }

                const payload = (await response.json().catch(() => null)) as ChangePlanCheckoutSession | null;

                if (!payload?.checkoutUrl) {
                    toast.error('Checkout não retornou URL de pagamento.');
                    return;
                }

                toast.success('Redirecionando para o checkout do Stripe...');
                window.location.assign(payload.checkoutUrl);
            } catch {
                toast.error('Não foi possível trocar o plano.');
            } finally {
                setChangingPriceId(null);
            }
        },
        [canChangePlan, organizationId, router]
    );

    if (!organizationId) {
        return null;
    }

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
                                isChanging={isChanging || resolvingRole}
                                canChoose={canChangePlan}
                                disabledReason={canChangePlan ? undefined : 'Apenas OWNER/ADMIN pode alterar o plano.'}
                                onChoose={(p) => void handleChangePlan(p)}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
}
