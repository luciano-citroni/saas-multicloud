'use client';

import * as React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

function Trace({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="trace"
            className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}
            {...props}
        />
    );
}

function TraceLine({
    className,
    status,
    ...props
}: React.ComponentProps<'span'> & {
    status?: 'running' | 'error' | 'pending';
}) {
    return (
        <span
            data-slot="trace-line"
            data-status={status}
            className={cn(
                'text-muted-foreground flex w-fit max-w-full min-w-0 items-center gap-2 text-sm transition-colors',
                status === 'error' && 'text-destructive',
                status === 'pending' && 'opacity-60',
                status === 'running' && '*:data-[slot=trace-title]:shimmer',
                className,
            )}
            {...props}
        />
    );
}

function TraceIcon({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            data-slot="trace-icon"
            aria-hidden="true"
            className={cn(
                'flex size-4 shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg:not([class*=\'size-\'])]:size-3.5',
                className,
            )}
            {...props}
        />
    );
}

function TraceTitle({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            data-slot="trace-title"
            className={cn('min-w-0 truncate motion-reduce:animate-none', className)}
            {...props}
        />
    );
}

function TraceDescription({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            data-slot="trace-description"
            className={cn('text-muted-foreground/70 shrink-0 tabular-nums', className)}
            {...props}
        />
    );
}

function TraceCollapsible({
    className,
    value,
    children,
    ...props
}: Omit<React.ComponentProps<'div'>, 'defaultValue'> & { value: string }) {
    return (
        <Accordion type="multiple" defaultValue={[value]} className={cn('w-full', className)} {...props}>
            <AccordionItem value={value} className="border-none">
                {children}
            </AccordionItem>
        </Accordion>
    );
}

function TraceCollapsibleTrigger({
    className,
    children,
    ...props
}: React.ComponentProps<typeof AccordionTrigger>) {
    return (
        <AccordionTrigger
            data-slot="trace-collapsible-trigger"
            className={cn(
                'text-muted-foreground hover:text-foreground py-1 text-left text-sm font-normal hover:no-underline [&>svg]:hidden',
                className,
            )}
            {...props}
        >
            <span className="flex min-w-0 flex-1 items-center gap-1">
                {children}
                <ChevronRightIcon className="text-muted-foreground size-3.5 shrink-0 transition-transform duration-200 in-data-[state=open]:rotate-90" />
            </span>
        </AccordionTrigger>
    );
}

function TraceCollapsibleContent({
    className,
    children,
    ...props
}: React.ComponentProps<typeof AccordionContent>) {
    return (
        <AccordionContent
            data-slot="trace-collapsible-content"
            className={cn(
                'text-muted-foreground ml-[calc(--spacing(2)-1px)] border-l pr-1 pl-4 text-xs leading-relaxed',
                className,
            )}
            {...props}
        >
            {children}
        </AccordionContent>
    );
}

export {
    Trace,
    TraceLine,
    TraceIcon,
    TraceTitle,
    TraceDescription,
    TraceCollapsible,
    TraceCollapsibleTrigger,
    TraceCollapsibleContent,
};
