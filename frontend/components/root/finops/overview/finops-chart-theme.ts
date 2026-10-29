import type { CSSProperties, SVGProps } from 'react';

/** Paleta do design system — muda automaticamente com tema claro/escuro. */
export const FINOPS_CHART_COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
    'var(--chart-6)',
    'var(--chart-7)',
    'var(--chart-8)',
] as const;

export const FINOPS_CHART_PRIMARY = 'var(--chart-1)';
export const FINOPS_CHART_MUTED = 'var(--muted-foreground)';
export const FINOPS_CHART_GRID = 'var(--border)';

export const finopsChartTickProps = {
    fill: 'var(--muted-foreground)',
    fontSize: 12,
} as const;

export const finopsChartTooltipStyles: {
    contentStyle: CSSProperties;
    labelStyle: CSSProperties;
    itemStyle: CSSProperties;
    cursor: SVGProps<SVGElement>;
} = {
    contentStyle: {
        backgroundColor: 'var(--popover)',
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
        color: 'var(--popover-foreground)',
        boxShadow: '0 4px 16px color-mix(in oklab, var(--foreground) 12%, transparent)',
    },
    labelStyle: {
        color: 'var(--muted-foreground)',
        marginBottom: 4,
    },
    itemStyle: {
        color: 'var(--popover-foreground)',
    },
    cursor: {
        fill: 'color-mix(in oklab, var(--muted) 55%, transparent)',
    },
};

/**
 * Dimensão do primeiro frame do ResponsiveContainer.
 * O default do Recharts 3 é -1×-1 e dispara o aviso de width/height no console
 * antes do ResizeObserver medir o container.
 */
export const finopsChartInitialDimension = { width: 640, height: 288 };

/** Classes para eixos/grid/tooltip do Recharts seguirem o tema (padrão shadcn ChartContainer). */
export const finopsChartSurfaceClassName =
    '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground ' +
    "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 " +
    '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border ' +
    '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/40 ' +
    '[&_.recharts-legend-item-text]:fill-muted-foreground! ' +
    '[&_.recharts-default-legend]:text-muted-foreground';
