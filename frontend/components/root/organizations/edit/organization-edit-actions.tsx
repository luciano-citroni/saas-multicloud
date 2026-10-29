'use client';

import { useState } from 'react';
import { DoorOpen, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCloudAccountActionDialog } from '@/components/root/cloud-accounts/edit/confirm-cloud-account-action-dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';

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
    const [deleteOpen, setDeleteOpen] = useState(false);

    return (
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-row">
                {canLeave ? (
                    <ConfirmCloudAccountActionDialog
                        title="Sair da organização"
                        description="Você deixará de ter acesso a esta organização. Depois disso, ela será removida da sua lista imediatamente."
                        confirmLabel="Sair da organização"
                        triggerLabel="Sair da organização"
                        triggerVariant="outline"
                        triggerDisabled={isSaving || isDeleting}
                        confirmVariant="default"
                        isConfirming={isLeaving}
                        onConfirm={onConfirmLeave}
                        icon={<DoorOpen className="size-4" />}
                        triggerClassName="w-full sm:w-auto"
                    />
                ) : null}

                {canDelete ? (
                    <>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={isSaving || isLeaving}
                            onClick={() => setDeleteOpen(true)}
                            className="w-full gap-1 sm:w-auto"
                        >
                            <Trash2 className="size-4" />
                            Excluir organização
                        </Button>
                        <ConfirmDeleteDialog
                            open={deleteOpen}
                            onOpenChange={setDeleteOpen}
                            title="Excluir organização"
                            description="Esta ação remove a organização permanentemente. Após a confirmação, ela não poderá ser recuperada."
                            resourceName={resourceName}
                            confirmLabel="Excluir organização"
                            isConfirming={isDeleting}
                            onConfirm={onConfirmDelete}
                        />
                    </>
                ) : null}
            </div>

            <Button type="submit" isLoading={isSaving} className="w-full gap-1 sm:w-auto">
                <Save className="size-4" />
                Salvar alterações
            </Button>
        </div>
    );
}
