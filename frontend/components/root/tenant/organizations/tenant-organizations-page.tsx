'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { extractErrorMessage } from '@/lib/error-messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { canManageMembers, type OrganizationRole } from '@/lib/organization-rbac';

type MidLevelOrg = {
    id: string;
    name: string;
    createdAt?: string;
};

type MidLevelOrgsResponse = {
    items?: MidLevelOrg[];
};

const orgSchema = z.object({
    name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(100, 'Nome deve ter no máximo 100 caracteres'),
});

type OrgFormValues = z.infer<typeof orgSchema>;

type Props = {
    tenantId: string;
    currentRole: OrganizationRole;
};

function normalizeOrgs(payload: unknown): MidLevelOrg[] {
    if (Array.isArray(payload)) return payload.filter((o): o is MidLevelOrg => typeof o?.id === 'string' && typeof o?.name === 'string');
    const p = payload as MidLevelOrgsResponse;
    if (Array.isArray(p?.items)) return p.items.filter((o): o is MidLevelOrg => typeof o?.id === 'string' && typeof o?.name === 'string');
    return [];
}

export function TenantOrganizationsPage({ tenantId, currentRole }: Props) {
    const canManage = canManageMembers(currentRole);
    const [orgs, setOrgs] = useState<MidLevelOrg[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editOrg, setEditOrg] = useState<MidLevelOrg | null>(null);
    const [deleteOrg, setDeleteOrg] = useState<MidLevelOrg | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [nameFilter, setNameFilter] = useState('');
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    const filteredOrgs = useMemo(() => {
        const q = nameFilter.trim().toLowerCase();
        return q ? orgs.filter((o) => o.name.toLowerCase().includes(q)) : orgs;
    }, [orgs, nameFilter]);

    const totalPages = Math.ceil(filteredOrgs.length / pageSize) || 1;
    const paginatedOrgs = filteredOrgs.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

    const createForm = useForm<OrgFormValues>({
        resolver: zodResolver(orgSchema),
        defaultValues: { name: '' },
    });

    const editForm = useForm<OrgFormValues>({
        resolver: zodResolver(orgSchema),
        defaultValues: { name: '' },
    });

    const loadOrgs = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/orgs?organizationId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }
            setOrgs(normalizeOrgs(payload));
        } catch {
            toast.error('Não foi possível carregar os grupos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadOrgs();
    }, [tenantId]);

    const handleCreate = createForm.handleSubmit(async (data) => {
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/orgs?organizationId=${encodeURIComponent(tenantId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: data.name.trim() }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }
            toast.success('Grupo criado com sucesso!');
            createForm.reset();
            setShowCreate(false);
            await loadOrgs();
        } catch {
            toast.error('Erro ao criar grupo.');
        } finally {
            setIsSubmitting(false);
        }
    });

    const handleEdit = editForm.handleSubmit(async (data) => {
        if (!editOrg) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/orgs/${encodeURIComponent(editOrg.id)}?organizationId=${encodeURIComponent(tenantId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: data.name.trim() }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }
            toast.success('Grupo atualizado com sucesso!');
            setEditOrg(null);
            await loadOrgs();
        } catch {
            toast.error('Erro ao atualizar grupo.');
        } finally {
            setIsSubmitting(false);
        }
    });

    const handleDelete = async () => {
        if (!deleteOrg) return;
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/orgs/${encodeURIComponent(deleteOrg.id)}?organizationId=${encodeURIComponent(tenantId)}`, {
                method: 'DELETE',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }
            toast.success('Grupo excluído com sucesso!');
            setDeleteOrg(null);
            await loadOrgs();
        } catch {
            toast.error('Erro ao excluir grupo.');
        } finally {
            setIsDeleting(false);
        }
    };

    const openEdit = (org: MidLevelOrg) => {
        editForm.reset({ name: org.name });
        setEditOrg(org);
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">Grupos de Contas</p>
                        <p className="text-xs text-muted-foreground">Organize suas contas cloud em grupos dentro do tenant.</p>
                    </div>
                    {canManage && (
                        <Button size="sm" onClick={() => { createForm.reset(); setShowCreate(true); }}>
                            <Plus className="h-4 w-4" />
                            Novo Grupo
                        </Button>
                    )}
                </div>
                <div className="flex flex-col gap-4 px-4 py-4">
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                        </div>
                    ) : orgs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                            <Layers className="h-10 w-10 text-muted-foreground/50" />
                            <p className="text-muted-foreground text-sm">Nenhum grupo criado ainda.</p>
                            {canManage && (
                                <Button variant="outline" size="sm" onClick={() => { createForm.reset(); setShowCreate(true); }}>
                                    <Plus className="h-3 w-3" />
                                    Criar primeiro grupo
                                </Button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Barra de filtros */}
                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    value={nameFilter}
                                    onChange={(e) => { setNameFilter(e.target.value); setPageIndex(0); }}
                                    placeholder="Filtrar por nome..."
                                    className="h-8 w-60"
                                />
                            </div>

                            {/* Tabela */}
                            <div className="rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="px-4 font-medium">Nome</TableHead>
                                            <TableHead className="px-4 font-medium">Criado em</TableHead>
                                            {canManage && <TableHead className="w-25 px-4 font-medium">Ações</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedOrgs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={canManage ? 3 : 2} className="h-24 text-center text-muted-foreground">
                                                    Nenhum grupo encontrado para o filtro aplicado.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedOrgs.map((org) => (
                                                <TableRow key={org.id}>
                                                    <TableCell className="px-4 font-medium">{org.name}</TableCell>
                                                    <TableCell className="px-4 text-muted-foreground text-sm">
                                                        {org.createdAt ? new Date(org.createdAt).toLocaleDateString('pt-BR') : '—'}
                                                    </TableCell>
                                                    {canManage && (
                                                        <TableCell className="px-4">
                                                            <div className="flex gap-2">
                                                                <Button variant="ghost" size="icon" onClick={() => openEdit(org)}>
                                                                    <Pencil className="h-4 w-4" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteOrg(org)}>
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Paginação */}
                            <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                                <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                                    <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                                    <Select value={`${pageSize}`} onValueChange={(v) => { setPageSize(Number(v)); setPageIndex(0); }}>
                                        <SelectTrigger className="h-8 min-w-22"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {[5, 10, 20, 30].map((s) => <SelectItem key={s} value={`${s}`}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                    <span className="text-sm font-medium">Página {pageIndex + 1} de {totalPages}</span>
                                    <div className="flex items-center gap-1 self-start sm:self-auto">
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(0)} disabled={pageIndex === 0}>
                                            <ChevronsLeft className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex((p) => Math.max(p - 1, 0))} disabled={pageIndex === 0}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex((p) => Math.min(p + 1, totalPages - 1))} disabled={pageIndex >= totalPages - 1}>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(totalPages - 1)} disabled={pageIndex >= totalPages - 1}>
                                            <ChevronsRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Create Dialog */}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Novo Grupo</DialogTitle>
                    </DialogHeader>
                    <Form {...createForm}>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <FormField control={createForm.control} name="name" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nome do grupo</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Produção, Homologação, Dev..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={isSubmitting}>Criar</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editOrg} onOpenChange={(open) => { if (!open) setEditOrg(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Editar Grupo</DialogTitle>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={handleEdit} className="space-y-4">
                            <FormField control={editForm.control} name="name" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nome do grupo</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setEditOrg(null)}>Cancelar</Button>
                                <Button type="submit" isLoading={isSubmitting}>Salvar</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm */}
            <AlertDialog open={!!deleteOrg} onOpenChange={(open) => { if (!open) setDeleteOrg(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir grupo?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O grupo <strong>{deleteOrg?.name}</strong> será removido permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {isDeleting ? 'Excluindo...' : 'Excluir'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
