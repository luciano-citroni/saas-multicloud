import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
    title: string;
    description?: string;
    eyebrow?: ReactNode;
    actions?: ReactNode;
    className?: string;
};

export function PageHeader({
    title,
    description,
    eyebrow,
    actions,
    className,
}: PageHeaderProps) {
    return (
        <div
            className={cn(
                'flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between',
                className,
            )}
        >
            <div className="min-w-0 space-y-1">
                {eyebrow ? (
                    <div className="text-muted-foreground flex items-center gap-2">{eyebrow}</div>
                ) : null}
                <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
                {description ? (
                    <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? (
                <div className="flex min-w-0 w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                    {actions}
                </div>
            ) : null}
        </div>
    );
}
