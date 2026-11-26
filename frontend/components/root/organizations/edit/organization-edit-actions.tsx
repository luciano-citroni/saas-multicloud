'use client';

import { useState } from 'react';
import { DoorOpen, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCloudAccountActionDialog } from '@/components/root/cloud-accounts/edit/confirm-cloud-account-action-dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useTranslations } from '@/lib/i18n';

type OrganizationEditActionsProps = {
    resourceName: string;
    canDelete: boolean;
    canLeave: boolean;
    isSaving: boolean;
    isDeleting: boolean;
    isLeaving: boolean;
    onConfirmDelete: () => Promise<boolean>;
    onConfirmLeave: () => Promise<boolean>;
};

export function OrganizationEditActions({
    resourceName,
    canDelete,
    canLeave,
    isSaving,
    isDeleting,
    isLeaving,
    onConfirmDelete,
    onConfirmLeave,
}: OrganizationEditActionsProps) {
    const t = useTranslations('organizations');
    const [deleteOpen, setDeleteOpen] = useState(false);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex w-full flex-col gap-2 lg:flex-row lg:justify-end">
                <Button
                    type="submit"
                    size="sm"
                    isLoading={isSaving}
                    disabled={isDeleting || isLeaving}
                    className="w-full gap-1.5 lg:w-auto"
                >
                    <Save className="size-4" />
                    {t.saveChanges}
                </Button>
            </div>

            {(canLeave || canDelete) && (
                <div className="rounded-lg border border-destructive/25 bg-destructive/5">
                    <div className="border-b border-destructive/15 px-4 py-3">
                        <p className="text-sm font-medium text-destructive">{t.dangerZoneTitle}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.dangerZoneDesc}</p>
                    </div>
                    <div className="grid w-full gap-2 p-4 lg:flex lg:flex-wrap lg:items-center">
                        {canLeave ? (
                            <ConfirmCloudAccountActionDialog
                                title={t.leaveOrgTitle}
                                description={t.leaveOrgDesc}
                                confirmLabel={t.leaveOrgConfirm}
                                triggerLabel={t.leaveOrg}
                                triggerVariant="outline"
                                triggerDisabled={isSaving || isDeleting}
                                confirmVariant="default"
                                isConfirming={isLeaving}
                                onConfirm={onConfirmLeave}
                                icon={<DoorOpen className="size-4" />}
                                triggerClassName="w-full lg:w-auto"
                            />
                        ) : null}

                        {canDelete ? (
                            <>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={isSaving || isLeaving}
                                    onClick={() => setDeleteOpen(true)}
                                    className="w-full gap-1.5 lg:w-auto"
                                >
                                    <Trash2 className="size-4" />
                                    {t.deleteOrg}
                                </Button>
                                <ConfirmDeleteDialog
                                    open={deleteOpen}
                                    onOpenChange={setDeleteOpen}
                                    title={t.deleteOrgTitle}
                                    description={t.deleteOrgDesc}
                                    resourceName={resourceName}
                                    confirmLabel={t.deleteOrgConfirm}
                                    isConfirming={isDeleting}
                                    onConfirm={onConfirmDelete}
                                />
                            </>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
