'use client';

import { Boxes, CalendarPlus, Layers3 } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { formatNumber } from '@/lib/i18n';

type InventoryKpiCardsProps = {
    totalResources: number;
    newThisMonth: number;
    typeCount: number;
    isLoading?: boolean;
};

export function InventoryKpiCards({
    totalResources,
    newThisMonth,
    typeCount,
    isLoading = false,
}: InventoryKpiCardsProps) {
    const t = useTranslations('inventory');

    const cards = [
        {
            key: 'total',
            label: t.kpiTotal,
            value: totalResources,
            hint: t.kpiTotalHint,
            icon: Boxes,
        },
        {
            key: 'new',
            label: t.kpiNewThisMonth,
            value: newThisMonth,
            hint: t.kpiNewThisMonthHint,
            icon: CalendarPlus,
        },
        {
            key: 'types',
            label: t.kpiTypes,
            value: typeCount,
            hint: t.kpiTypesHint,
            icon: Layers3,
        },
    ] as const;

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
                const Icon = card.icon;
                return (
                    <div key={card.key} className="rounded-lg border p-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Icon className="size-4" />
                            <p className="text-xs font-medium">{card.label}</p>
                        </div>
                        <p className="mt-2 text-3xl font-semibold tracking-tight">
                            {isLoading ? '—' : formatNumber(card.value)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                    </div>
                );
            })}
        </div>
    );
}
