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
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { canManageMembers, type OrganizationRole } from '@/lib/organization-rbac';
import { toIntlLocale } from '@/lib/i18n/format';
import { useTranslations } from '@/lib/i18n';

type MidLevelOrg = {
    id: string;
    name: string;
    createdAt?: string;
};

type MidLevelOrgsResponse = {
    items?: MidLevelOrg[];
};

function createOrgSchema(t: { nameMin: string; nameMax: string }) {
    return z.object({
        name: z.string().min(2, t.nameMin).max(100, t.nameMax),
    });
}

type OrgFormValues = z.infer<ReturnType<typeof createOrgSchema>>;

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
    const t = useTranslations('organizations');
    const tc = useTranslations('common');
    const orgSchema = useMemo(() => createOrgSchema(t), [t]);
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
            toast.error(t.groupsLoadError);
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
            toast.success(t.groupCreateSuccess);
            createForm.reset();
            setShowCreate(false);
            await loadOrgs();
        } catch {
            toast.error(t.groupCreateError);
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
            toast.success(t.groupUpdateSuccess);
            setEditOrg(null);
            await loadOrgs();
        } catch {
            toast.error(t.groupUpdateError);
        } finally {
            setIsSubmitting(false);
        }
    });

    const handleDelete = async (): Promise<boolean> => {
        if (!deleteOrg) return true;
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/orgs/${encodeURIComponent(deleteOrg.id)}?organizationId=${encodeURIComponent(tenantId)}`, {
                method: 'DELETE',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return false;
            }
            toast.success(t.groupDeleteSuccess);
            setDeleteOrg(null);
            await loadOrgs();
            return true;
        } catch {
            toast.error(t.groupDeleteError);
            return false;
        } finally {
            setIsDeleting(false);
        }
    };

    const openEdit = (org: MidLevelOrg) => {
        editForm.reset({ name: org.name });
        setEditOrg(org);
    };

    const [deleteDescBefore, deleteDescAfter = ''] = t.groupDeleteDesc.split('{name}');

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">{t.groupsTitle}</p>
                        <p className="text-xs text-muted-foreground">{t.groupsDesc}</p>
                    </div>
                    {canManage && (
                        <Button size="sm" onClick={() => { createForm.reset(); setShowCreate(true); }}>
                            <Plus className="h-4 w-4" />
                            {t.newGroup}
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
                            <p className="text-muted-foreground text-sm">{t.groupsEmpty}</p>
                            {canManage && (
                                <Button variant="outline" size="sm" onClick={() => { createForm.reset(); setShowCreate(true); }}>
                                    <Plus className="h-3 w-3" />
                                    {t.createFirstGroup}
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
                                    placeholder={t.groupsFilterPlaceholder}
                                    className="h-8 w-60"
                                />
                            </div>

                            {/* Tabela */}
                            <div className="rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                                            <TableHead className="px-4 font-medium">{t.groupsTableCreatedAt}</TableHead>
                                            {canManage && <TableHead className="w-25 px-4 font-medium">{tc.actions}</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedOrgs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={canManage ? 3 : 2} className="h-24 text-center text-muted-foreground">
                                                    {t.groupsFilterEmpty}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedOrgs.map((org) => (
                                                <TableRow key={org.id}>
                                                    <TableCell className="px-4 font-medium">{org.name}</TableCell>
                                                    <TableCell className="px-4 text-muted-foreground text-sm">
                                                        {org.createdAt ? new Date(org.createdAt).toLocaleDateString(toIntlLocale()) : '—'}
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
                                    <span className="shrink-0 whitespace-nowrap">{tc.rowsPerPage}</span>
                                    <Select value={`${pageSize}`} onValueChange={(v) => { setPageSize(Number(v)); setPageIndex(0); }}>
                                        <SelectTrigger className="h-8 min-w-22"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {[5, 10, 20, 30].map((s) => <SelectItem key={s} value={`${s}`}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                    <span className="text-sm font-medium">{tc.page} {pageIndex + 1} {tc.of} {totalPages}</span>
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
                        <DialogTitle>{t.newGroup}</DialogTitle>
                    </DialogHeader>
                    <Form {...createForm}>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <FormField control={createForm.control} name="name" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.groupNameLabel}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t.orgNameExample} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>{tc.cancel}</Button>
                                <Button type="submit" isLoading={isSubmitting}>{tc.create}</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editOrg} onOpenChange={(open) => { if (!open) setEditOrg(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t.editGroup}</DialogTitle>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={handleEdit} className="space-y-4">
                            <FormField control={editForm.control} name="name" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.groupNameLabel}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setEditOrg(null)}>{tc.cancel}</Button>
                                <Button type="submit" isLoading={isSubmitting}>{tc.save}</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <ConfirmDeleteDialog
                open={!!deleteOrg}
                onOpenChange={(open) => {
                    if (!open) setDeleteOrg(null);
                }}
                title={t.groupDeleteTitle}
                description={
                    <>
                        {deleteDescBefore}
                        <strong>{deleteOrg?.name}</strong>
                        {deleteDescAfter}
                    </>
                }
                resourceName={deleteOrg?.name ?? ''}
                confirmLabel={isDeleting ? t.tenantsDeleting : tc.delete}
                isConfirming={isDeleting}
                onConfirm={handleDelete}
            />
        </div>
    );
}
