'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PricingModel, CostEstimateResponse } from '@/app/actions/automation';

const MODELS = [
    {
        id: 'ON_DEMAND' as PricingModel,
        title: 'On-Demand',
        description: 'Pague apenas pelo que usar, sem compromisso.',
        badge: 'Flexível',
        badgeClass: 'bg-muted text-muted-foreground',
        costKey: 'onDemand' as const,
        discount: null,
    },
    {
        id: 'RESERVED' as PricingModel,
        title: 'Reserved (1 ano)',
        description: 'Comprometimento de 1 ano com desconto de 30%.',
        badge: '−30%',
        badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
        costKey: 'reserved' as const,
        discount: 30,
    },
    {
        id: 'SAVINGS' as PricingModel,
        title: 'Savings Plan',
        description: 'Flexibilidade com desconto de até 40% sobre On-Demand.',
        badge: '−40%',
        badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
        costKey: 'savings' as const,
        discount: 40,
    },
] as const;

function formatCost(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

type Props = {
    selected: PricingModel;
    onChange: (model: PricingModel) => void;
    totals: CostEstimateResponse['totals'];
};

export function PricingModelSelector({ selected, onChange, totals }: Props) {
    return (
        <div className="space-y-3">
            {MODELS.map((model) => {
                const isSelected = selected === model.id;
                const monthlyCost = totals[model.costKey];

                return (
                    <button
                        key={model.id}
                        type="button"
                        onClick={() => onChange(model.id)}
                        className={cn(
                            'group flex w-full items-start gap-4 rounded-xl border-2 p-4 text-left transition-all',
                            isSelected
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/40 hover:bg-muted/30',
                        )}
                    >
                        {/* Radio indicator */}
                        <div className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                            isSelected ? 'border-primary bg-primary' : 'border-muted-foreground',
                        )}>
                            {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">{model.title}</span>
                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', model.badgeClass)}>
                                    {model.badge}
                                </span>
                            </div>
                            <p className="mt-0.5 text-sm text-muted-foreground">{model.description}</p>
                        </div>

                        {/* Cost */}
                        <div className="shrink-0 text-right">
                            <p className={cn(
                                'text-lg font-bold',
                                model.id === 'SAVINGS' && 'text-green-600 dark:text-green-400',
                                model.id === 'RESERVED' && 'text-blue-600 dark:text-blue-400',
                            )}>
                                {formatCost(monthlyCost)}
                            </p>
                            <p className="text-xs text-muted-foreground">por mês</p>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
