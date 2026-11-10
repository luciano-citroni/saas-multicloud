'use client';

import { Check } from 'lucide-react';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import { cn } from '@/lib/utils';
import type { PricingModel, CostEstimateResponse } from '@/app/actions/automation';
import { useTranslations } from '@/lib/i18n';

const MODELS = [
    {
        id: 'ON_DEMAND' as PricingModel,
        title: 'On-Demand',
        badgeClass: 'bg-muted text-muted-foreground',
        costKey: 'onDemand' as const,
    },
    {
        id: 'RESERVED' as PricingModel,
        badge: '−30%',
        badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
        costKey: 'reserved' as const,
    },
    {
        id: 'SAVINGS' as PricingModel,
        title: 'Savings Plan',
        badge: '−40%',
        badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
        costKey: 'savings' as const,
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
    const t = useTranslations('automation');
    const copy = {
        ON_DEMAND: { title: 'On-Demand', description: t.pricingOnDemandDesc, badge: t.pricingFlexible },
        RESERVED: { title: t.pricingReservedTitle, description: t.pricingReservedDesc, badge: '−30%' },
        SAVINGS: { title: 'Savings Plan', description: t.pricingSavingsDesc, badge: '−40%' },
    } as const;

    return (
        <ItemGroup className="gap-3">
            {MODELS.map((model) => {
                const isSelected = selected === model.id;
                const monthlyCost = totals[model.costKey];
                const text = copy[model.id];

                return (
                    <Item
                        key={model.id}
                        role="listitem"
                        tabIndex={0}
                        size="sm"
                        variant={isSelected ? 'muted' : 'outline'}
                        aria-selected={isSelected}
                        className={cn(
                            'cursor-pointer items-start hover:bg-muted/30',
                            isSelected && 'border-primary/40 bg-primary/10 ring-primary/20 ring-1',
                        )}
                        onClick={() => onChange(model.id)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onChange(model.id);
                            }
                        }}
                    >
                        <ItemMedia variant="icon" className="mt-0.5">
                            <div
                                className={cn(
                                    'flex size-5 items-center justify-center rounded-full border-2 transition-colors',
                                    isSelected ? 'border-primary bg-primary' : 'border-muted-foreground',
                                )}
                            >
                                {isSelected ? <Check className="size-3 text-primary-foreground" /> : null}
                            </div>
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                            <div className="flex items-center gap-2">
                                <ItemTitle className="font-semibold">{text.title}</ItemTitle>
                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', model.badgeClass)}>
                                    {text.badge}
                                </span>
                            </div>
                            <ItemDescription>{text.description}</ItemDescription>
                        </ItemContent>
                        <ItemActions className="shrink-0 self-start text-right">
                            <div>
                                <p
                                    className={cn(
                                        'text-lg font-bold',
                                        model.id === 'SAVINGS' && 'text-green-600 dark:text-green-400',
                                        model.id === 'RESERVED' && 'text-blue-600 dark:text-blue-400',
                                    )}
                                >
                                    {formatCost(monthlyCost)}
                                </p>
                                <p className="text-muted-foreground text-xs">{t.perMonth}</p>
                            </div>
                        </ItemActions>
                    </Item>
                );
            })}
        </ItemGroup>
    );
}
