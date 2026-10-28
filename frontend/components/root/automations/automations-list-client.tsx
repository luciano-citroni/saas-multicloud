'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus, Play, Copy, Trash2, Power, PowerOff, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { hasRequiredOrganizationRole, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import {
    fetchAutomations,
    deleteAutomation,
    duplicateAutomation,
    activateAutomation,
    deactivateAutomation,
    type AutomationWorkflow,
} from '@/app/actions/automations';
import { cn } from '@/lib/utils';
import { workflowStatusClass } from './status-styles';

function getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

export function AutomationsListClient() {
    const router = useRouter();
    const [automations, setAutomations] = useState<AutomationWorkflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<OrganizationRole | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AutomationWorkflow | null>(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        const orgId = getOrgId();
        if (!orgId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const response = await fetchAutomations(orgId);
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            const items = (body as { items?: AutomationWorkflow[] }).items ?? (body as AutomationWorkflow[]);
            setAutomations(Array.isArray(items) ? items : []);
        } catch {
            toast.error('Falha ao carregar automações');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const orgId = getOrgId();
        if (orgId) {
            fetch(`/api/sidebar/context`, { cache: 'no-store' })
                .then((r) => r.json())
                .then((payload) => {
                    const org = (payload?.organizations ?? []).find((o: { id: string; currentRole?: string | null }) => o.id === orgId);
                    setRole(normalizeOrganizationRole(org?.currentRole));
                })
                .catch(() => undefined);
        }
    }, [load]);

    const canAdmin = hasRequiredOrganizationRole(role, 'ADMIN');

    async function handleAction(action: string, id: string) {
        const orgId = getOrgId();
        if (!orgId) return;

        const handlers: Record<string, () => Promise<Response>> = {
            execute: async () => {
                router.push(`/automations/${id}?execute=1`);
                return new Response(null, { status: 499 });
            },
            duplicate: () => duplicateAutomation(id, orgId),
            activate: () => activateAutomation(id, orgId),
            deactivate: () => deactivateAutomation(id, orgId),
        };

        const response = await handlers[action]();
        const body = await response.json().catch(() => ({}));
        if (response.status === 499) return;
        if (!response.ok && response.status !== 204) {
            toast.error(extractErrorMessage(body as never, 'pt'));
            return;
        }

        if (action === 'execute') {
            toast.success('Execução enfileirada');
            router.push(`/automations/${id}`);
        } else {
            toast.success('Automação atualizada');
        }
        await load();
    }

    async function confirmDelete() {
        if (!deleteTarget) return;
        const orgId = getOrgId();
        if (!orgId) return;

        setDeleting(true);
        try {
            const response = await deleteAutomation(deleteTarget.id, orgId);
            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => ({}));
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            toast.success('Automação excluída');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('Falha ao excluir automação');
        } finally {
            setDeleting(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Automações</h1>
                    <p className="text-sm text-muted-foreground">Fluxos de provisionamento cloud</p>
                </div>
                <Button asChild>
                    <Link href="/automations/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Nova automação
                    </Link>
                </Button>
            </div>

            <div className="rounded-xl border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Versão</TableHead>
                            <TableHead>Atualizado</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {automations.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground">
                                    Nenhuma automação criada
                                </TableCell>
                            </TableRow>
                        ) : (
                            automations.map((automation) => (
                                <TableRow key={automation.id}>
                                    <TableCell>
                                        <Link href={`/automations/${automation.id}`} className="font-medium hover:underline">
                                            {automation.name}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{automation.cloudProvider}</TableCell>
                                    <TableCell>
                                        <Badge className={cn('text-[10px]', workflowStatusClass(automation.status))}>
                                            {automation.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>v{automation.version}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {new Date(automation.updatedAt).toLocaleString('pt-BR')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="icon" asChild>
                                                <Link href={`/automations/${automation.id}`}>
                                                    <History className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                            {canAdmin && automation.status === 'ACTIVE' && (
                                                <Button variant="ghost" size="icon" onClick={() => handleAction('execute', automation.id)}>
                                                    <Play className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canAdmin && (
                                                <Button variant="ghost" size="icon" onClick={() => handleAction('duplicate', automation.id)}>
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canAdmin && automation.status === 'INACTIVE' && (
                                                <Button variant="ghost" size="icon" onClick={() => handleAction('activate', automation.id)}>
                                                    <Power className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canAdmin && automation.status === 'ACTIVE' && (
                                                <Button variant="ghost" size="icon" onClick={() => handleAction('deactivate', automation.id)}>
                                                    <PowerOff className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canAdmin && (
                                                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(automation)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir automação?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A automação <span className="font-medium text-foreground">{deleteTarget?.name}</span> será
                            removida permanentemente. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(event) => {
                                event.preventDefault();
                                void confirmDelete();
                            }}
                        >
                            {deleting ? 'Excluindo...' : 'Excluir'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
