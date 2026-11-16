'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@/components/ui/drawer';
import { notifyMobileFiltersDrawer } from '@/lib/sidebar-context';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const FILTER_SNAP_POINTS = [0.58, 1] as const;

type MobileFiltersDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    triggerLabel: string;
    applyLabel: string;
    activeCount?: number;
    children: ReactNode;
    triggerClassName?: string;
    contentClassName?: string;
};

function restoreBodyPointerEvents() {
    if (typeof document === 'undefined') {
        return;
    }
    document.body.style.pointerEvents = '';
}

/**
 * Bottom drawer for dense filters on viewports below `lg`.
 * Desktop fields stay inline; mobile opens this drawer via trigger.
 * Drag the handle up to fill the screen; close via X, Apply, overlay, or swipe down.
 */
export function MobileFiltersDrawer({
    open,
    onOpenChange,
    title,
    description,
    triggerLabel,
    applyLabel,
    activeCount = 0,
    children,
    triggerClassName,
    contentClassName,
}: MobileFiltersDrawerProps) {
    const tc = useTranslations('common');
    const [snapPoint, setSnapPoint] = useState<number | string | null>(FILTER_SNAP_POINTS[0]);
    const isFullHeight = snapPoint === 1 || snapPoint === '1';

    useEffect(() => {
        notifyMobileFiltersDrawer(open);
        return () => {
            if (open) {
                notifyMobileFiltersDrawer(false);
            }
        };
    }, [open]);

    useEffect(() => {
        if (open) {
            setSnapPoint(FILTER_SNAP_POINTS[0]);
            return;
        }
        const timer = window.setTimeout(restoreBodyPointerEvents, 0);
        return () => window.clearTimeout(timer);
    }, [open]);

    const handleOpenChange = (nextOpen: boolean) => {
        onOpenChange(nextOpen);
        notifyMobileFiltersDrawer(nextOpen);
        if (!nextOpen) {
            restoreBodyPointerEvents();
        }
    };

    return (
        <Drawer
            open={open}
            onOpenChange={handleOpenChange}
            shouldScaleBackground={false}
            snapPoints={[...FILTER_SNAP_POINTS]}
            activeSnapPoint={snapPoint}
            setActiveSnapPoint={setSnapPoint}
            fadeFromIndex={1}
        >
            <DrawerTrigger asChild>
                <Button type="button" size="sm" variant="outline" className={cn('lg:hidden', triggerClassName)}>
                    <Filter className="size-3.5" />
                    {triggerLabel}
                    {activeCount > 0 ? ` (${activeCount})` : ''}
                </Button>
            </DrawerTrigger>
            <DrawerContent
                className={cn(
                    'flex h-full flex-col bg-background',
                    isFullHeight ? 'rounded-none' : 'rounded-t-xl',
                    contentClassName,
                )}
            >
                <DrawerHeader className="relative shrink-0 border-b pr-12 text-left">
                    <DrawerTitle>{title}</DrawerTitle>
                    {description ? <DrawerDescription>{description}</DrawerDescription> : null}
                    <DrawerClose asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="absolute top-3 right-3"
                            aria-label={tc.close}
                        >
                            <X className="size-4" />
                        </Button>
                    </DrawerClose>
                </DrawerHeader>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                    <div className="mx-auto grid max-w-lg grid-cols-1 gap-4">{children}</div>
                </div>
                <DrawerFooter className="shrink-0 border-t">
                    <Button type="button" className="w-full" onClick={() => handleOpenChange(false)}>
                        {applyLabel}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
