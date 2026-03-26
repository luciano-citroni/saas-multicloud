'use client';

import { Power, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCloudAccountActionDialog } from '@/components/root/cloud-accounts/edit/confirm-cloud-account-action-dialog';

type CloudAccountEditActionsProps = {
    isActive: boolean;
    isSaving: boolean;
    isStatusLoading: boolean;
    isDeleting: boolean;
    onConfirmToggleStatus: () => Promise<boolean>;
    onConfirmDelete: () => Promise<boolean>;
};

export function CloudAccountEditActions({
    isActive,
    isSaving,
    isStatusLoading,
    isDeleting,
    onConfirmToggleStatus,
    onConfirmDelete,
}: CloudAccountEditActionsProps) {
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

                <ConfirmCloudAccountActionDialog
                    title="Excluir conta cloud"
                    description="Esta ação remove a Conta Cloud permanentemente. Após a confirmação não pode ser desfeita."
                    confirmLabel="Excluir conta"
                    triggerLabel="Excluir conta"
                    triggerVariant="destructive"
                    triggerDisabled={isSaving || isStatusLoading}
                    confirmVariant="destructive"
                    isConfirming={isDeleting}
                    onConfirm={onConfirmDelete}
                    icon={<Trash2 className="size-4" />}
                    triggerClassName="w-full sm:w-auto"
                />
            </div>

            <Button type="submit" isLoading={isSaving} className="w-full gap-1 sm:w-auto">
                <Save className="size-4" />
                Salvar alterações
            </Button>
        </div>
    );
}
