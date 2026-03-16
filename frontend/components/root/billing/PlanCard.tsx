import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { modulesLabel } from '../../../lib/modules';

type PlanMetadata = { maxCloudAccounts: number; maxUsers: number; modules: string[] };

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
    return (
        <Card key={plan.priceId} className={isCurrent ? 'border-primary' : undefined}>
            <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {isCurrent ? <Badge>Atual</Badge> : null}
                </div>
                <CardDescription>{plan.description ?? 'Plano sem descricao'}</CardDescription>
                <p className="text-2xl font-semibold">
                    {(plan.unitAmount / 100).toLocaleString('pt-BR', { style: 'currency', currency: plan.currency.toUpperCase() })}
                    <span className="text-sm font-normal text-muted-foreground"> {plan.interval === 'year' ? '/ano' : '/mes'}</span>
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

                <Button className="w-full" disabled={isCurrent || isChanging || !canChoose} onClick={() => onChoose(plan.priceId)} title={disabledReason}>
                    {isCurrent ? 'Plano atual' : isChanging ? 'Atualizando...' : 'Escolher este plano'}
                </Button>
            </CardContent>
        </Card>
    );
}
