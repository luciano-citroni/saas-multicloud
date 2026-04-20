'use client';

import { Server, HardDrive, Database, Zap, MapPin, CreditCard, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { FlowDefinition, PricingModel, CostEstimateResponse } from '@/app/actions/automation';
import { cn } from '@/lib/utils';

const RESOURCE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    ec2: { icon: Server, color: 'text-orange-500', label: 'EC2 Instance' },
    s3: { icon: HardDrive, color: 'text-green-500', label: 'S3 Bucket' },
    rds: { icon: Database, color: 'text-blue-500', label: 'RDS Instance' },
    lambda: { icon: Zap, color: 'text-purple-500', label: 'Lambda Function' },
};

const PRICING_LABELS: Record<PricingModel, { label: string; color: string }> = {
    ON_DEMAND: { label: 'On-Demand', color: 'text-foreground' },
    RESERVED: { label: 'Reserved (1 ano)', color: 'text-blue-600 dark:text-blue-400' },
    SAVINGS: { label: 'Savings Plan', color: 'text-green-600 dark:text-green-400' },
};

function formatCost(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

type Props = {
    flow: FlowDefinition;
    pricingModel: PricingModel;
    estimate: CostEstimateResponse;
    cloudAccountId: string;
};

export function ExecutionConfirmation({ flow, pricingModel, estimate, cloudAccountId }: Props) {
    const totalCost = estimate.totals[pricingModel === 'ON_DEMAND' ? 'onDemand' : pricingModel === 'RESERVED' ? 'reserved' : 'savings'];
    const pricing = PRICING_LABELS[pricingModel];

    return (
        <div className="space-y-5">
            {/* Summary header */}
            <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Resumo da execução</p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="text-xs">Recursos</span>
                        </div>
                        <p className="font-semibold">{flow.nodes.length} recurso{flow.nodes.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <CreditCard className="h-3.5 w-3.5" />
                            <span className="text-xs">Modelo de Preço</span>
                        </div>
                        <p className={cn('font-semibold', pricing.color)}>{pricing.label}</p>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <DollarSign className="h-3.5 w-3.5" />
                            <span className="text-xs">Custo Total</span>
                        </div>
                        <p className={cn('text-lg font-bold', pricing.color)}>{formatCost(totalCost)}/mês</p>
                    </div>
                </div>
            </div>

            {/* Resources list */}
            <div className="rounded-xl border">
                <div className="border-b bg-muted/30 px-4 py-2.5">
                    <p className="text-xs font-semibold text-muted-foreground">Recursos a provisionar</p>
                </div>
                <div className="divide-y">
                    {flow.nodes.map((node, idx) => {
                        const meta = RESOURCE_META[node.type] ?? { icon: Server, color: 'text-muted-foreground', label: node.type };
                        const Icon = meta.icon;
                        const config = node.config as Record<string, unknown>;
                        const region = String(config.region ?? 'us-east-1');
                        const resourceEstimate = estimate.resources.find((r) => r.nodeId === node.id);
                        const cost = resourceEstimate
                            ? pricingModel === 'ON_DEMAND' ? resourceEstimate.onDemand
                            : pricingModel === 'RESERVED' ? resourceEstimate.reserved
                            : resourceEstimate.savings
                            : 0;

                        return (
                            <div key={node.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                                    <Icon className={cn('h-4 w-4', meta.color)} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                        {node.label || meta.label}
                                        <span className="ml-2 text-xs text-muted-foreground">#{idx + 1}</span>
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <Badge variant="outline" className="text-[10px] py-0">{meta.label}</Badge>
                                        <span className="text-xs text-muted-foreground">{region}</span>
                                    </div>
                                </div>
                                <p className={cn('text-sm font-semibold shrink-0', pricing.color)}>{formatCost(cost)}/mês</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total estimado por mês</span>
                <span className={cn('text-xl font-bold', pricing.color)}>{formatCost(totalCost)}</span>
            </div>

            <p className="text-xs text-muted-foreground">
                Ao confirmar, os recursos serão provisionados na sua conta AWS vinculada. Isso pode incorrer em custos reais.
                Os valores exibidos são estimativas e podem variar com base no uso real.
            </p>
        </div>
    );
}
