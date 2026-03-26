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
    triggerVariant = 'outline',
    triggerDisabled = false,
    confirmVariant = 'default',
    isConfirming = false,
    onConfirm,
    icon,
    triggerClassName,
}: ConfirmCloudAccountActionDialogProps) {
    const [open, setOpen] = useState(false);

    const handleConfirm = async () => {
        const shouldClose = await onConfirm();

        if (shouldClose) {
            setOpen(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <Button type="button" variant={triggerVariant} disabled={triggerDisabled} onClick={() => setOpen(true)} className={triggerClassName}>
                {icon}
                {triggerLabel}
            </Button>

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
