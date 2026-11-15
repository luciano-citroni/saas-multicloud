import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageToolbarProps = {
    children: ReactNode;
    actions?: ReactNode;
    className?: string;
};

/**
 * Responsive filter/action row: stacks on mobile, row on sm+.
 * Prefer `w-full sm:w-*` on nested inputs/selects.
 */
export function PageToolbar({ children, actions, className }: PageToolbarProps) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
                className,
            )}
        >
            <div className="flex min-w-0 flex-col gap-2 sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center">
                {children}
            </div>
            {actions ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {actions}
                </div>
            ) : null}
        </div>
    );
}
