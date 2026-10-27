'use client';

import { BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChartType } from '@/components/root/finops/overview/cost-trend-chart';
import { cn } from '@/lib/utils';

type ChartViewToggleProps = {
    value: ChartType;
    onChange: (value: ChartType) => void;
};

export function ChartViewToggle({ value, onChange }: ChartViewToggleProps) {
    return (
        <div
            className="inline-flex w-fit items-center rounded-lg border border-border p-0.5"
            role="group"
            aria-label="Tipo de gráfico"
        >
            <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                    'h-8 gap-1.5 border-0 px-2.5 shadow-none',
                    value === 'line'
                        ? 'bg-muted text-foreground hover:bg-muted'
                        : 'text-muted-foreground hover:bg-transparent hover:text-foreground'
                )}
                onClick={() => onChange('line')}
                aria-pressed={value === 'line'}
            >
                <LineChartIcon className="size-3.5" />
                Linha
            </Button>
            <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                    'h-8 gap-1.5 border-0 px-2.5 shadow-none',
                    value === 'bar'
                        ? 'bg-muted text-foreground hover:bg-muted'
                        : 'text-muted-foreground hover:bg-transparent hover:text-foreground'
                )}
                onClick={() => onChange('bar')}
                aria-pressed={value === 'bar'}
            >
                <BarChart3 className="size-3.5" />
                Barra
            </Button>
        </div>
    );
}
