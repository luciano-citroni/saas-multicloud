'use client';

import { useState } from 'react';
import { Power, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCloudAccountActionDialog } from '@/components/root/cloud-accounts/edit/confirm-cloud-account-action-dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';

type CloudAccountEditActionsProps = {
    resourceName: string;
    isActive: boolean;
    isSaving: boolean;
    isStatusLoading: boolean;
    isDeleting: boolean;
    onConfirmToggleStatus: () => Promise<boolean>;
    onConfirmDelete: () => Promise<boolean>;
};

export function CloudAccountEditActions({
    resourceName,
    isActive,
    isSaving,
    isStatusLoading,
    isDeleting,
    onConfirmToggleStatus,
    onConfirmDelete,
}: CloudAccountEditActionsProps) {
    const [deleteOpen, setDeleteOpen] = useState(false);
    const statusActionLabel = isActive ? 'Desativar conta' : 'Ativar conta';
    const statusDialogTitle = isActive ? 'Desativar conta cloud' : 'Ativar conta cloud';
    const statusDialogDescription = isActive
        ? 'A conta ficará inativa e deixará de aparecer como ativa nos filtros e fluxos da plataforma.'
        : 'A conta voltará a ficar disponível como ativa para uso e sincronização na plataforma.';

    return (
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-row">
                <ConfirmCloudAccountActionDialog
                    title={statusDialogTitle}
                    description={statusDialogDescription}
                    confirmLabel={statusActionLabel}
                    triggerLabel={statusActionLabel}
                    triggerVariant="outline"
                    triggerDisabled={isSaving || isDeleting}
                    confirmVariant="default"
                    isConfirming={isStatusLoading}
                    onConfirm={onConfirmToggleStatus}
                    icon={<Power className="size-4" />}
                    triggerClassName="w-full sm:w-auto"
                />

                <Button
                    type="button"
                    variant="destructive"
                    disabled={isSaving || isStatusLoading}
                    onClick={() => setDeleteOpen(true)}
                    className="w-full gap-1 sm:w-auto"
                >
                    <Trash2 className="size-4" />
                    Excluir conta
                </Button>
                <ConfirmDeleteDialog
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                    title="Excluir conta cloud"
                    description="Esta ação remove a Conta Cloud permanentemente. Após a confirmação não pode ser desfeita."
                    resourceName={resourceName}
                    confirmLabel="Excluir conta"
                    isConfirming={isDeleting}
                    onConfirm={onConfirmDelete}
                />
            </div>

            <Button type="submit" isLoading={isSaving} className="w-full gap-1 sm:w-auto">
                <Save className="size-4" />
                Salvar alterações
            </Button>
        </div>
    );
}
