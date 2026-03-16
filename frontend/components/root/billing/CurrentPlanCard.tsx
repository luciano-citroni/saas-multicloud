import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { modulesLabel } from '../../../lib/modules';

type BillingSubscription = {
    id: string;
    organizationId: string;
    stripePriceId: string | null;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    plan: {
        name: string;
        metadata: { maxCloudAccounts: number; maxUsers: number; modules: string[] } | null;
    } | null;
};

export default function CurrentPlanCard({ loading, subscription }: { loading: boolean; subscription: BillingSubscription | null }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Plano Selecionado</CardTitle>
                <CardDescription>Visualize os planos disponíveis e as regras ativas para sua organização.</CardDescription>
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
                            <p className="mt-1 text-sm font-semibold">
                                {subscription ? (subscription.status ? (subscription.status === 'active' ? 'Ativo' : 'Inativa') : '') : 'Sem assinatura'}
                            </p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Plano atual</p>
                            <p className="mt-1 text-sm font-semibold">{subscription?.plan?.name ?? 'Não definido'}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Proxima renovacao</p>
                            <p className="mt-1 text-sm font-semibold">
                                {subscription?.currentPeriodEnd
                                    ? new Intl.DateTimeFormat('pt-BR').format(new Date(subscription.currentPeriodEnd))
                                    : 'Não disponível'}
                            </p>
                        </div>
                    </>
                )}
            </CardContent>

            <CardHeader>
                <CardTitle>Limites do Seu Plano Atual</CardTitle>
                <CardDescription>Limites e módulos liberados para a organização selecionada.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="grid gap-3 md:grid-cols-3">
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                ) : !subscription?.plan ? (
                    <p className="text-sm text-muted-foreground">Nenhuma regra disponível para a assinatura atual.</p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Cloud accounts</p>
                            <p className="mt-1 text-sm font-semibold">{subscription.plan.metadata?.maxCloudAccounts ?? '0'}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Usuários</p>
                            <p className="mt-1 text-sm font-semibold">{subscription.plan.metadata?.maxUsers ?? '0'}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Módulos</p>
                            <p className="mt-1 text-sm font-semibold">{modulesLabel(subscription.plan.metadata?.modules ?? [])}</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
