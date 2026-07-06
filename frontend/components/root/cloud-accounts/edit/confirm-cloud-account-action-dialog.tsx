'use client';

import { type ReactNode, useState } from 'react';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type ConfirmCloudAccountActionDialogProps = {
    title: string;
    description: string;
    confirmLabel: string;
    triggerLabel: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    hideTrigger?: boolean;
    triggerVariant?: 'outline' | 'destructive' | 'default';
    triggerDisabled?: boolean;
    confirmVariant?: 'default' | 'destructive' | 'outline';
    isConfirming?: boolean;
    onConfirm: () => Promise<boolean>;
    icon?: ReactNode;
    triggerClassName?: string;
};

export function ConfirmCloudAccountActionDialog({
    title,
    description,
    confirmLabel,
    triggerLabel,
    open,
    onOpenChange,
    hideTrigger = false,
    triggerVariant = 'outline',
    triggerDisabled = false,
    confirmVariant = 'default',
    isConfirming = false,
    onConfirm,
    icon,
    triggerClassName,
}: ConfirmCloudAccountActionDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const dialogOpen = typeof open === 'boolean' ? open : internalOpen;

    const setDialogOpen = (nextOpen: boolean) => {
        if (typeof open !== 'boolean') {
            setInternalOpen(nextOpen);
        }

        onOpenChange?.(nextOpen);
    };

    const handleConfirm = async () => {
        const shouldClose = await onConfirm();

        if (shouldClose) {
            setDialogOpen(false);
        }
    };

    return (
        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            {!hideTrigger ? (
                <Button type="button" variant={triggerVariant} disabled={triggerDisabled} onClick={() => setDialogOpen(true)} className={triggerClassName}>
                    {icon}
                    {triggerLabel}
                </Button>
            ) : null}

            <AlertDialogContent size="sm">
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter className="grid-cols-1 sm:grid-cols-2">
                    <AlertDialogCancel disabled={isConfirming}>Cancelar</AlertDialogCancel>
                    <Button type="button" variant={confirmVariant} isLoading={isConfirming} onClick={handleConfirm} className="w-full">
                        {confirmLabel}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
