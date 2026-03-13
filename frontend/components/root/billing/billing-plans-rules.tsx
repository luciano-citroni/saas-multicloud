'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_ORG_STORAGE_KEY = 'smc_active_organization_id';

type PlanMetadata = {
    maxCloudAccounts: number;
    maxUsers: number;
    modules: string[];
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

function formatMoney(cents: number, currency: string) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency.toUpperCase(),
        maximumFractionDigits: 2,
    }).format(cents / 100);
}

function formatInterval(interval: string) {
    if (interval === 'year') {
        return '/ano';
    }

    return '/mes';
}

function formatDate(value: string | null) {
    if (!value) {
        return 'Nao disponivel';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'Nao disponivel';
    }

    return new Intl.DateTimeFormat('pt-BR').format(date);
}

function prettyStatus(status: string) {
    const map: Record<string, string> = {
        active: 'Ativo',
        trialing: 'Trial',
        past_due: 'Pagamento pendente',
        canceled: 'Cancelado',
        incomplete: 'Incompleto',
        incomplete_expired: 'Expirado',
        unpaid: 'Nao pago',
        paused: 'Pausado',
    };

    return map[status] ?? status;
}

function modulesLabel(modules: string[]) {
    if (modules.includes('*')) {
        return 'Todos os modulos';
    }

    if (!modules.length) {
        return 'Nenhum modulo habilitado';
    }

    return modules.join(', ');
}

export function BillingPlansRules() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const handledCheckoutRef = useRef(false);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [changingPriceId, setChangingPriceId] = useState<string | null>(null);
    const [plans, setPlans] = useState<BillingPlan[]>([]);
    const [subscription, setSubscription] = useState<BillingSubscription | null>(null);

    const currentPriceId = subscription?.stripePriceId ?? null;

    const currentPlanRules = useMemo(() => {
        if (!subscription?.plan) {
            return null;
        }

        return [
            { label: 'Cloud accounts', value: String(subscription.plan.metadata.maxCloudAccounts) },
            { label: 'Usuarios', value: String(subscription.plan.metadata.maxUsers) },
            { label: 'Modulos', value: modulesLabel(subscription.plan.metadata.modules) },
        ];
    }, [subscription]);

    const loadBillingData = useCallback(
        async (orgId: string) => {
            setLoading(true);

            try {
                const [plansResponse, subscriptionResponse] = await Promise.all([
                    fetch('/api/billing/plans', { cache: 'no-store' }),
                    fetch(`/api/billing/subscription?organizationId=${encodeURIComponent(orgId)}`, { cache: 'no-store' }),
                ]);

                if (plansResponse.status === 401 || subscriptionResponse.status === 401) {
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!plansResponse.ok) {
                    toast.error('Nao foi possivel carregar os planos.');
                    setPlans([]);
                } else {
                    const plansPayload = (await plansResponse.json()) as BillingPlan[];
                    setPlans(Array.isArray(plansPayload) ? plansPayload : []);
                }

                if (subscriptionResponse.status === 404) {
                    setSubscription(null);
                    return;
                }

                if (!subscriptionResponse.ok) {
                    toast.error('Nao foi possivel carregar a assinatura da organizacao.');
                    setSubscription(null);
                    return;
                }

                const subscriptionPayload = (await subscriptionResponse.json()) as BillingSubscription;
                setSubscription(subscriptionPayload);
            } catch {
                toast.error('Nao foi possivel carregar os dados de billing.');
            } finally {
                setLoading(false);
            }
        },
        [router]
    );

    useEffect(() => {
        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);

        if (!orgId) {
            toast.error('Selecione uma organizacao para visualizar os planos.');
            router.replace('/');
            return;
        }

        setOrganizationId(orgId);
        void loadBillingData(orgId);
    }, [loadBillingData, router]);

    useEffect(() => {
        if (handledCheckoutRef.current || !organizationId) {
            return;
        }

        const checkoutStatus = searchParams.get('checkout');

        if (checkoutStatus === 'success') {
            handledCheckoutRef.current = true;
            toast.success('Pagamento confirmado. Plano atualizado com sucesso.');
            void loadBillingData(organizationId);
            router.replace('/billing');
            router.refresh();
            return;
        }

        if (checkoutStatus === 'cancel') {
            handledCheckoutRef.current = true;
            toast.error('Checkout cancelado. Nenhuma alteracao foi aplicada.');
            router.replace('/billing');
        }
    }, [loadBillingData, organizationId, router, searchParams]);

    const handleChangePlan = useCallback(
        async (priceId: string) => {
            if (!organizationId) {
                return;
            }

            setChangingPriceId(priceId);

            try {
                const response = await fetch(`/api/billing/subscription?organizationId=${encodeURIComponent(organizationId)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ priceId }),
                });

                if (response.status === 401) {
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!response.ok) {
                    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
                    toast.error(payload?.message ?? 'Nao foi possivel trocar o plano.');
                    return;
                }

                const payload = (await response.json().catch(() => null)) as ChangePlanCheckoutSession | null;

                if (!payload?.checkoutUrl) {
                    toast.error('Checkout nao retornou URL de pagamento.');
                    return;
                }

                toast.success('Redirecionando para o checkout do Stripe...');
                window.location.assign(payload.checkoutUrl);
            } catch {
                toast.error('Nao foi possivel trocar o plano.');
            } finally {
                setChangingPriceId(null);
            }
        },
        [organizationId, router]
    );

    if (!organizationId) {
        return null;
    }

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Planos e regras</CardTitle>
                    <CardDescription>Visualize os planos disponiveis e as regras ativas para sua organizacao.</CardDescription>
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
                                <p className="text-xs text-muted-foreground">Status da assinatura</p>
                                <p className="mt-1 text-sm font-semibold">{subscription ? prettyStatus(subscription.status) : 'Sem assinatura'}</p>
                            </div>
                            <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Plano atual</p>
                                <p className="mt-1 text-sm font-semibold">{subscription?.plan?.name ?? 'Nao definido'}</p>
                            </div>
                            <div className="rounded-lg border p-3">
                                <p className="text-xs text-muted-foreground">Proxima renovacao</p>
                                <p className="mt-1 text-sm font-semibold">{formatDate(subscription?.currentPeriodEnd ?? null)}</p>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Regras do plano ativo</CardTitle>
                    <CardDescription>Limites e modulos liberados para a organizacao selecionada.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="grid gap-3 md:grid-cols-3">
                            <Skeleton className="h-14 w-full" />
                            <Skeleton className="h-14 w-full" />
                            <Skeleton className="h-14 w-full" />
                        </div>
                    ) : !currentPlanRules ? (
                        <p className="text-sm text-muted-foreground">Nenhuma regra disponivel para a assinatura atual.</p>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-3">
                            {currentPlanRules.map((rule) => (
                                <div className="rounded-lg border p-3" key={rule.label}>
                                    <p className="text-xs text-muted-foreground">{rule.label}</p>
                                    <p className="mt-1 text-sm font-semibold">{rule.value}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

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
                            <Card key={plan.priceId} className={isCurrent ? 'border-primary' : undefined}>
                                <CardHeader className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                                        {isCurrent ? <Badge>Atual</Badge> : null}
                                    </div>
                                    <CardDescription>{plan.description ?? 'Plano sem descricao'}</CardDescription>
                                    <p className="text-2xl font-semibold">
                                        {formatMoney(plan.unitAmount, plan.currency)}
                                        <span className="text-sm font-normal text-muted-foreground"> {formatInterval(plan.interval)}</span>
                                    </p>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2 rounded-lg border p-3">
                                        <p className="text-xs text-muted-foreground">Regras deste plano</p>
                                        <p className="text-sm">
                                            <span className="font-medium">Cloud accounts:</span> {plan.metadata.maxCloudAccounts}
                                        </p>
                                        <p className="text-sm">
                                            <span className="font-medium">Usuarios:</span> {plan.metadata.maxUsers}
                                        </p>
                                        <p className="text-sm">
                                            <span className="font-medium">Modulos:</span> {modulesLabel(plan.metadata.modules)}
                                        </p>
                                    </div>

                                    <Button
                                        className="w-full"
                                        disabled={isCurrent || isChanging}
                                        onClick={() => {
                                            void handleChangePlan(plan.priceId);
                                        }}
                                    >
                                        {isCurrent ? 'Plano atual' : isChanging ? 'Atualizando...' : 'Escolher este plano'}
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}
