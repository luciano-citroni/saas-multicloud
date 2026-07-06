'use client';

import { type UserOrganization } from '@/app/actions/organization';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslations } from '@/lib/i18n';

type TenantSettingsDeleteDialogProps = {
    organization: UserOrganization | null;
    isDeleting: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
};

export function TenantSettingsDeleteDialog({ organization, isDeleting, onOpenChange, onConfirm }: TenantSettingsDeleteDialogProps) {
    const t = useTranslations('organizations');

    return (
        <AlertDialog open={!!organization} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t.tenantsDeleteTitle}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t.tenantsDeleteDescription}
                        <strong className="ml-1">{organization?.name}</strong>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t.tenantsCancel}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isDeleting ? t.tenantsDeleting : t.tenantsConfirmDelete}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
