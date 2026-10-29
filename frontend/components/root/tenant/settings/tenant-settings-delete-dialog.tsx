'use client';

import { type UserOrganization } from '@/app/actions/organization';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useTranslations } from '@/lib/i18n';

type TenantSettingsDeleteDialogProps = {
    organization: UserOrganization | null;
    isDeleting: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void | boolean | Promise<void | boolean>;
};

export function TenantSettingsDeleteDialog({ organization, isDeleting, onOpenChange, onConfirm }: TenantSettingsDeleteDialogProps) {
    const t = useTranslations('organizations');
    const resourceName = organization?.name ?? '';

    return (
        <ConfirmDeleteDialog
            open={!!organization}
            onOpenChange={onOpenChange}
            title={t.tenantsDeleteTitle}
            description={
                <>
                    {t.tenantsDeleteDescription}
                    <strong className="ml-1">{resourceName}</strong>
                </>
            }
            resourceName={resourceName}
            confirmLabel={t.tenantsConfirmDelete}
            cancelLabel={t.tenantsCancel}
            isConfirming={isDeleting}
            onConfirm={onConfirm}
        />
    );
}
