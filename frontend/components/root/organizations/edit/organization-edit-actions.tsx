'use client';

import { DoorOpen, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCloudAccountActionDialog } from '@/components/root/cloud-accounts/edit/confirm-cloud-account-action-dialog';

type OrganizationEditActionsProps = {
    canDelete: boolean;
    canLeave: boolean;
    isSaving: boolean;
    isDeleting: boolean;
    isLeaving: boolean;
    onConfirmDelete: () => Promise<boolean>;
    onConfirmLeave: () => Promise<boolean>;
};

export function OrganizationEditActions({
    canDelete,
    canLeave,
    isSaving,
    isDeleting,
    isLeaving,
    onConfirmDelete,
    onConfirmLeave,
}: OrganizationEditActionsProps) {
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
                    <ConfirmCloudAccountActionDialog
                        title="Excluir organização"
                        description="Esta ação remove a organização permanentemente. Após a confirmação, ela não poderá ser recuperada."
                        confirmLabel="Excluir organização"
                        triggerLabel="Excluir organização"
                        triggerVariant="destructive"
                        triggerDisabled={isSaving || isLeaving}
                        confirmVariant="destructive"
                        isConfirming={isDeleting}
                        onConfirm={onConfirmDelete}
                        icon={<Trash2 className="size-4" />}
                        triggerClassName="w-full sm:w-auto"
                    />
                ) : null}
            </div>

            <Button type="submit" isLoading={isSaving} className="w-full gap-1 sm:w-auto">
                <Save className="size-4" />
                Salvar alterações
            </Button>
        </div>
    );
}
