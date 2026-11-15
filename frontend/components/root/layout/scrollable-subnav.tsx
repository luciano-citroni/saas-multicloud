import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ScrollableSubnavProps = {
    children: ReactNode;
    'aria-label': string;
    className?: string;
};

export function ScrollableSubnav({
    children,
    'aria-label': ariaLabel,
    className,
}: ScrollableSubnavProps) {
    return (
        <div className={cn('min-w-0 max-w-full', className)}>
            <nav
                aria-label={ariaLabel}
                className={cn(
                    'inline-flex w-max max-w-full items-center overflow-x-auto rounded-lg border border-border p-0.5',
                    '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
                )}
            >
                {children}
            </nav>
        </div>
    );
}

type ScrollableSubnavItemProps = {
    children: ReactNode;
    className?: string;
    active?: boolean;
};

export function ScrollableSubnavItem({
    children,
    className,
    active,
}: ScrollableSubnavItemProps) {
    return (
        <span
            className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                active
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                className,
            )}
        >
            {children}
        </span>
    );
}
