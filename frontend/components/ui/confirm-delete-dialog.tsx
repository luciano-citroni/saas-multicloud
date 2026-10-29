'use client';

import { type ReactNode, useEffect, useId, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function resolveDeleteConfirmationText(resourceName: string, fallback: string): string {
    const trimmedName = resourceName.trim();
    return trimmedName.length > 0 ? trimmedName : fallback;
}

export function matchesDeleteConfirmation(value: string, expected: string): boolean {
    const trimmed = value.trim();
    if (!trimmed || !expected) {
        return false;
    }

    return trimmed === expected;
}

type ConfirmDeleteDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: ReactNode;
    resourceName: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isConfirming?: boolean;
    onConfirm: () => void | boolean | Promise<void | boolean>;
    contentProps?: React.ComponentProps<typeof DialogContent>;
};

export function ConfirmDeleteDialog({
    open,
    onOpenChange,
    title,
    description,
    resourceName,
    confirmLabel,
    cancelLabel,
    isConfirming = false,
    onConfirm,
    contentProps,
}: ConfirmDeleteDialogProps) {
    const tc = useTranslations('common');
    const inputId = useId();
    const [confirmationText, setConfirmationText] = useState('');

    useEffect(() => {
        if (!open) {
            setConfirmationText('');
        }
    }, [open]);

    const expectedConfirmation = resolveDeleteConfirmationText(resourceName, tc.deleteConfirmPlaceholder);
    const canConfirm = matchesDeleteConfirmation(confirmationText, expectedConfirmation);

    const handleOpenChange = (nextOpen: boolean) => {
        if (isConfirming) {
            return;
        }

        onOpenChange(nextOpen);
    };

    const handleConfirm = async () => {
        if (!canConfirm || isConfirming) {
            return;
        }

        const shouldClose = await onConfirm();

        if (shouldClose !== false) {
            onOpenChange(false);
        }
    };

    const { className: contentClassName, ...restContentProps } = contentProps ?? {};

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className={cn('sm:max-w-md', contentClassName)} {...restContentProps}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <Label htmlFor={inputId}>{tc.deleteConfirmHint.replace('{name}', expectedConfirmation)}</Label>
                    <Input
                        id={inputId}
                        value={confirmationText}
                        onChange={(event) => setConfirmationText(event.target.value)}
                        placeholder={expectedConfirmation}
                        disabled={isConfirming}
                        autoComplete="off"
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleConfirm();
                            }
                        }}
                    />
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" disabled={isConfirming} onClick={() => handleOpenChange(false)}>
                        {cancelLabel ?? tc.cancel}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        isLoading={isConfirming}
                        disabled={!canConfirm || isConfirming}
                        onClick={() => void handleConfirm()}
                    >
                        {confirmLabel ?? tc.delete}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
