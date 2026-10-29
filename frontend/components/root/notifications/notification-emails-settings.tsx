'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Mail,
    MessageCircle,
    Pencil,
    Plus,
    Send,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVE_ORG_CHANGED_EVENT, ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import {
    createNotificationEmail,
    createNotificationGroup,
    deleteNotificationEmail,
    deleteNotificationGroup,
    fetchNotificationGroups,
    sendNotificationGroupTestEmail,
    sendNotificationTestEmail,
    updateNotificationEmail,
    updateNotificationGroup,
} from '@/app/actions/notifications';
import { NotificationWhatsappSettings } from '@/components/root/notifications/notification-whatsapp-settings';

export type NotificationEmailItem = {
    id: string;
    organizationId: string;
    groupId: string;
    email: string;
    label: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

export type NotificationGroupItem = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    channel: 'email' | 'whatsapp';
    isActive: boolean;
    emails: NotificationEmailItem[];
    createdAt: string;
    updatedAt: string;
};

const groupSchema = z.object({
    name: z.string().min(1, 'Nome é obrigatório').max(120),
    description: z.string().max(255).optional(),
    isActive: z.boolean(),
});

const emailSchema = z.object({
    email: z.string().email('E-mail inválido').max(320),
    label: z.string().max(120).optional(),
    isActive: z.boolean(),
});

type GroupFormData = z.infer<typeof groupSchema>;
type EmailFormData = z.infer<typeof emailSchema>;

type DeleteTarget =
    | { kind: 'group'; item: NotificationGroupItem }
    | { kind: 'email'; item: NotificationEmailItem };

type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

function normalizeGroupsPayload(payload: unknown): {
    items: NotificationGroupItem[];
    pagination: PaginationMeta | null;
} {
    if (Array.isArray(payload)) {
        return { items: payload as NotificationGroupItem[], pagination: null };
    }

    if (payload && typeof payload === 'object') {
        const body = payload as { items?: unknown; pagination?: Partial<PaginationMeta> | null };
        const items = Array.isArray(body.items) ? (body.items as NotificationGroupItem[]) : [];
        const pagination = body.pagination;
        if (
            pagination &&
            typeof pagination.page === 'number' &&
            typeof pagination.limit === 'number' &&
            typeof pagination.totalItems === 'number' &&
            typeof pagination.totalPages === 'number'
        ) {
            return {
                items,
                pagination: {
                    page: pagination.page,
                    limit: pagination.limit,
                    totalItems: pagination.totalItems,
                    totalPages: pagination.totalPages,
                    hasNextPage: pagination.hasNextPage === true,
                    hasPreviousPage: pagination.hasPreviousPage === true,
                },
            };
        }
        return { items, pagination: null };
    }

    return { items: [], pagination: null };
}

export function NotificationEmailsSettings() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const { currentRole: rawRole } = useOrganizationFromSidebar(organizationId);
    const currentRole = normalizeOrganizationRole(rawRole);
    const canManage = hasRequiredOrganizationRole(currentRole, 'ADMIN');

    const [groups, setGroups] = useState<NotificationGroupItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);

    const [groupDialogOpen, setGroupDialogOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<NotificationGroupItem | null>(null);

    const [emailDialogOpen, setEmailDialogOpen] = useState(false);
    const [emailGroupId, setEmailGroupId] = useState<string | null>(null);
    const [editingEmail, setEditingEmail] = useState<NotificationEmailItem | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testingGroupId, setTestingGroupId] = useState<string | null>(null);

    const groupForm = useForm<GroupFormData>({
        resolver: zodResolver(groupSchema),
        defaultValues: { name: '', description: '', isActive: true },
    });

    const emailForm = useForm<EmailFormData>({
        resolver: zodResolver(emailSchema),
        defaultValues: { email: '', label: '', isActive: true },
    });

    useEffect(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
    }, []);

    useEffect(() => {
        const handle = () => setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
        window.addEventListener('storage', handle);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
            window.removeEventListener('storage', handle);
        };
    }, []);

    const load = useCallback(
        async (orgId: string, nextPage = page, nextLimit = pageSize) => {
            setLoading(true);
            try {
                const response = await fetchNotificationGroups(orgId, 'email', {
                    page: nextPage,
                    limit: nextLimit,
                });
                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    toast.error(extractErrorMessage(body, 'pt'));
                    setGroups([]);
                    setPagination(null);
                    return;
                }
                const payload = await response.json().catch(() => null);
                const { items, pagination: meta } = normalizeGroupsPayload(payload);
                setGroups(items);
                setPagination(meta);
                if (meta && meta.page !== nextPage) {
                    setPage(meta.page);
                }
                setExpanded((prev) => {
                    const merged = { ...prev };
                    for (const group of items) {
                        if (merged[group.id] === undefined) merged[group.id] = true;
                    }
                    return merged;
                });
            } catch {
                toast.error('Não foi possível carregar os grupos de notificação.');
                setGroups([]);
                setPagination(null);
            } finally {
                setLoading(false);
            }
        },
        [page, pageSize]
    );

    useEffect(() => {
        if (!organizationId) {
            setGroups([]);
            setPagination(null);
            setLoading(false);
            return;
        }
        void load(organizationId, page, pageSize);
    }, [organizationId, page, pageSize, load]);

    const openCreateGroup = () => {
        setEditingGroup(null);
        groupForm.reset({ name: '', description: '', isActive: true });
        setGroupDialogOpen(true);
    };

    const openEditGroup = (group: NotificationGroupItem) => {
        setEditingGroup(group);
        groupForm.reset({
            name: group.name,
            description: group.description ?? '',
            isActive: group.isActive,
        });
        setGroupDialogOpen(true);
    };

    const openCreateEmail = (groupId: string) => {
        setEmailGroupId(groupId);
        setEditingEmail(null);
        emailForm.reset({ email: '', label: '', isActive: true });
        setEmailDialogOpen(true);
    };

    const openEditEmail = (email: NotificationEmailItem) => {
        setEmailGroupId(email.groupId);
        setEditingEmail(email);
        emailForm.reset({
            email: email.email,
            label: email.label ?? '',
            isActive: email.isActive,
        });
        setEmailDialogOpen(true);
    };

    const onSubmitGroup = async (data: GroupFormData) => {
        if (!organizationId) return;
        const payload = {
            name: data.name.trim(),
            description: data.description?.trim() ? data.description.trim() : null,
            channel: 'email' as const,
            isActive: data.isActive,
        };

        try {
            const response = editingGroup
                ? await updateNotificationGroup(organizationId, editingGroup.id, payload)
                : await createNotificationGroup(organizationId, payload);
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }
            toast.success(editingGroup ? 'Grupo atualizado.' : 'Grupo criado.');
            setGroupDialogOpen(false);
            if (!editingGroup) setPage(1);
            void load(organizationId, editingGroup ? page : 1, pageSize);
        } catch {
            toast.error('Não foi possível salvar o grupo.');
        }
    };

    const onSubmitEmail = async (data: EmailFormData) => {
        if (!organizationId || !emailGroupId) return;
        const payload = {
            email: data.email.trim().toLowerCase(),
            label: data.label?.trim() ? data.label.trim() : null,
            isActive: data.isActive,
        };

        try {
            const response = editingEmail
                ? await updateNotificationEmail(organizationId, editingEmail.id, payload)
                : await createNotificationEmail(organizationId, emailGroupId, payload);
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }
            toast.success(editingEmail ? 'E-mail atualizado.' : 'E-mail adicionado.');
            setEmailDialogOpen(false);
            void load(organizationId, page, pageSize);
        } catch {
            toast.error('Não foi possível salvar o e-mail.');
        }
    };

    const onDelete = async (): Promise<boolean> => {
        if (!organizationId || !deleteTarget) return true;
        setDeleting(true);
        try {
            const response =
                deleteTarget.kind === 'group'
                    ? await deleteNotificationGroup(organizationId, deleteTarget.item.id)
                    : await deleteNotificationEmail(organizationId, deleteTarget.item.id);

            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body, 'pt'));
                return false;
            }

            toast.success(deleteTarget.kind === 'group' ? 'Grupo removido.' : 'E-mail removido.');
            setDeleteTarget(null);
            const shouldGoPrev =
                deleteTarget.kind === 'group' &&
                groups.length <= 1 &&
                page > 1;
            const nextPage = shouldGoPrev ? page - 1 : page;
            if (shouldGoPrev) setPage(nextPage);
            void load(organizationId, nextPage, pageSize);
            return true;
        } catch {
            toast.error('Não foi possível remover.');
            return false;
        } finally {
            setDeleting(false);
        }
    };

    const onSendTest = async (email: NotificationEmailItem) => {
        if (!organizationId) return;
        setTestingId(email.id);
        try {
            const response = await sendNotificationTestEmail(organizationId, email.id);
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }
            toast.success(`E-mail de teste enviado para ${email.email}.`);
        } catch {
            toast.error('Não foi possível enviar o e-mail de teste.');
        } finally {
            setTestingId(null);
        }
    };

    const onSendGroupTest = async (group: NotificationGroupItem) => {
        if (!organizationId) return;
        setTestingGroupId(group.id);
        try {
            const response = await sendNotificationGroupTestEmail(organizationId, group.id);
            const body = (await response.json().catch(() => null)) as {
                sent?: number;
                failed?: number;
                message?: string;
            } | null;
            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }
            const sent = body?.sent ?? 0;
            const failed = body?.failed ?? 0;
            if (failed > 0) {
                toast.success(`Teste do grupo: ${sent} enviado(s), ${failed} falha(s).`);
            } else {
                toast.success(`E-mail de teste enviado para ${sent} destinatário(s) do grupo.`);
            }
        } catch {
            toast.error('Não foi possível enviar o teste do grupo.');
        } finally {
            setTestingGroupId(null);
        }
    };

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Notificações</CardTitle>
                    <CardDescription>Selecione um tenant na sidebar.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
                <p className="text-sm text-muted-foreground">
                    Configuração do tenant inteiro. Organize destinatários em grupos e envie testes.
                </p>
            </div>

            <Tabs defaultValue="email">
                <TabsList>
                    <TabsTrigger value="email" className="gap-1.5">
                        <Mail className="size-3.5" />
                        E-mail
                    </TabsTrigger>
                    <TabsTrigger value="whatsapp" className="gap-1.5">
                        <MessageCircle className="size-3.5" />
                        WhatsApp
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="email" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                            Crie grupos e adicione vários e-mails em cada um.
                        </p>
                        {canManage && (
                            <Button size="sm" onClick={openCreateGroup}>
                                <Plus className="size-3.5" />
                                Novo grupo
                            </Button>
                        )}
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Grupos de e-mail</CardTitle>
                            <CardDescription>
                                Expanda um grupo para gerenciar os e-mails. Você pode editar ou excluir grupos e
                                destinatários.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <p className="text-sm text-muted-foreground">Carregando…</p>
                            ) : groups.length === 0 ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground">Nenhum grupo cadastrado.</p>
                                    {canManage && (
                                        <Button variant="outline" size="sm" onClick={openCreateGroup}>
                                            <Plus className="size-3.5" />
                                            Criar grupo
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                <div className="overflow-hidden rounded-lg border">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="w-10" />
                                                <TableHead>Grupo</TableHead>
                                                <TableHead>E-mails</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {groups.map((group) => {
                                                const isOpen = Boolean(expanded[group.id]);
                                                return (
                                                    <Fragment key={group.id}>
                                                        <TableRow>
                                                            <TableCell>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon-sm"
                                                                    onClick={() =>
                                                                        setExpanded((prev) => ({
                                                                            ...prev,
                                                                            [group.id]: !prev[group.id],
                                                                        }))
                                                                    }
                                                                >
                                                                    {isOpen ? (
                                                                        <ChevronDown className="size-3.5" />
                                                                    ) : (
                                                                        <ChevronRight className="size-3.5" />
                                                                    )}
                                                                </Button>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="space-y-0.5">
                                                                    <p className="font-medium">{group.name}</p>
                                                                    {group.description ? (
                                                                        <p className="text-muted-foreground text-xs">
                                                                            {group.description}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>{group.emails?.length ?? 0}</TableCell>
                                                            <TableCell>
                                                                {group.isActive ? (
                                                                    <Badge variant="secondary">Ativo</Badge>
                                                                ) : (
                                                                    <Badge variant="outline">Inativo</Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {canManage && (
                                                                    <div className="flex justify-end gap-1">
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            isLoading={testingGroupId === group.id}
                                                                            disabled={
                                                                                testingGroupId !== null ||
                                                                                testingId !== null ||
                                                                                (group.emails?.filter((e) => e.isActive)
                                                                                    .length ?? 0) === 0
                                                                            }
                                                                            onClick={() => void onSendGroupTest(group)}
                                                                        >
                                                                            <Send className="size-3.5" />
                                                                            Testar grupo
                                                                        </Button>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            onClick={() => openCreateEmail(group.id)}
                                                                        >
                                                                            <Plus className="size-3.5" />
                                                                            E-mail
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            onClick={() => openEditGroup(group)}
                                                                        >
                                                                            <Pencil className="size-3.5" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            onClick={() =>
                                                                                setDeleteTarget({
                                                                                    kind: 'group',
                                                                                    item: group,
                                                                                })
                                                                            }
                                                                        >
                                                                            <Trash2 className="size-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>

                                                        {isOpen && (
                                                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                                                                <TableCell colSpan={5} className="p-0">
                                                                    <div className="border-t px-4 py-3">
                                                                        {(group.emails?.length ?? 0) === 0 ? (
                                                                            <p className="text-muted-foreground text-sm">
                                                                                Nenhum e-mail neste grupo.
                                                                            </p>
                                                                        ) : (
                                                                            <Table>
                                                                                <TableHeader>
                                                                                    <TableRow>
                                                                                        <TableHead>E-mail</TableHead>
                                                                                        <TableHead>Rótulo</TableHead>
                                                                                        <TableHead>Status</TableHead>
                                                                                        <TableHead className="text-right">
                                                                                            Ações
                                                                                        </TableHead>
                                                                                    </TableRow>
                                                                                </TableHeader>
                                                                                <TableBody>
                                                                                    {group.emails.map((email) => (
                                                                                        <TableRow key={email.id}>
                                                                                            <TableCell className="font-medium">
                                                                                                {email.email}
                                                                                            </TableCell>
                                                                                            <TableCell>
                                                                                                {email.label || '—'}
                                                                                            </TableCell>
                                                                                            <TableCell>
                                                                                                {email.isActive ? (
                                                                                                    <Badge variant="secondary">
                                                                                                        Ativo
                                                                                                    </Badge>
                                                                                                ) : (
                                                                                                    <Badge variant="outline">
                                                                                                        Inativo
                                                                                                    </Badge>
                                                                                                )}
                                                                                            </TableCell>
                                                                                            <TableCell className="text-right">
                                                                                                {canManage && (
                                                                                                    <div className="flex justify-end gap-1">
                                                                                                        <Button
                                                                                                            variant="outline"
                                                                                                            size="sm"
                                                                                                            isLoading={
                                                                                                                testingId ===
                                                                                                                email.id
                                                                                                            }
                                                                                                            disabled={
                                                                                                                testingId !==
                                                                                                                    null ||
                                                                                                                testingGroupId !==
                                                                                                                    null
                                                                                                            }
                                                                                                            onClick={() =>
                                                                                                                void onSendTest(
                                                                                                                    email
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            <Send className="size-3.5" />
                                                                                                            Testar
                                                                                                        </Button>
                                                                                                        <Button
                                                                                                            variant="ghost"
                                                                                                            size="icon-sm"
                                                                                                            onClick={() =>
                                                                                                                openEditEmail(
                                                                                                                    email
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            <Pencil className="size-3.5" />
                                                                                                        </Button>
                                                                                                        <Button
                                                                                                            variant="ghost"
                                                                                                            size="icon-sm"
                                                                                                            onClick={() =>
                                                                                                                setDeleteTarget(
                                                                                                                    {
                                                                                                                        kind: 'email',
                                                                                                                        item: email,
                                                                                                                    }
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            <Trash2 className="size-3.5" />
                                                                                                        </Button>
                                                                                                    </div>
                                                                                                )}
                                                                                            </TableCell>
                                                                                        </TableRow>
                                                                                    ))}
                                                                                </TableBody>
                                                                            </Table>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="flex flex-col gap-4 px-1 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                                        <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                                        <Select
                                            value={`${pageSize}`}
                                            onValueChange={(value) => {
                                                setPageSize(Number(value));
                                                setPage(1);
                                            }}
                                        >
                                            <SelectTrigger className="h-8 min-w-22">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[5, 10, 20, 30].map((size) => (
                                                    <SelectItem key={size} value={`${size}`}>
                                                        {size}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                        <span className="text-sm font-medium">
                                            Página {pagination?.page ?? page} de{' '}
                                            {Math.max(1, pagination?.totalPages ?? 1)}
                                            {typeof pagination?.totalItems === 'number'
                                                ? ` · ${pagination.totalItems} grupo(s)`
                                                : ''}
                                        </span>
                                        <div className="flex items-center gap-1 self-start sm:self-auto">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => setPage(1)}
                                                disabled={!pagination?.hasPreviousPage}
                                            >
                                                <ChevronsLeft className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                                                disabled={!pagination?.hasPreviousPage}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => setPage((current) => current + 1)}
                                                disabled={!pagination?.hasNextPage}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() =>
                                                    setPage(Math.max(1, pagination?.totalPages ?? 1))
                                                }
                                                disabled={!pagination?.hasNextPage}
                                            >
                                                <ChevronsRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="whatsapp" className="mt-4">
                    <NotificationWhatsappSettings organizationId={organizationId} canManage={canManage} />
                </TabsContent>
            </Tabs>

            <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingGroup ? 'Editar grupo' : 'Novo grupo'}</DialogTitle>
                        <DialogDescription>
                            Grupos organizam os e-mails de notificação do tenant.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...groupForm}>
                        <form onSubmit={groupForm.handleSubmit(onSubmitGroup)} className="space-y-4">
                            <FormField
                                control={groupForm.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome</FormLabel>
                                        <FormControl>
                                            <Input placeholder="FinOps" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={groupForm.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descrição (opcional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Alertas de orçamento" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={groupForm.control}
                                name="isActive"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start gap-2 space-y-0 rounded-lg border px-3 py-2">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={(checked) => field.onChange(checked === true)}
                                            />
                                        </FormControl>
                                        <div className="space-y-0.5">
                                            <FormLabel className="font-normal">Ativo</FormLabel>
                                            <p className="text-muted-foreground text-xs">
                                                Grupos inativos não recebem alertas.
                                            </p>
                                        </div>
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setGroupDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" isLoading={groupForm.formState.isSubmitting}>
                                    {editingGroup ? 'Salvar' : 'Criar'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingEmail ? 'Editar e-mail' : 'Novo e-mail'}</DialogTitle>
                        <DialogDescription>Adicione um destinatário ao grupo selecionado.</DialogDescription>
                    </DialogHeader>
                    <Form {...emailForm}>
                        <form onSubmit={emailForm.handleSubmit(onSubmitEmail)} className="space-y-4">
                            <FormField
                                control={emailForm.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>E-mail</FormLabel>
                                        <FormControl>
                                            <Input type="email" placeholder="finops@empresa.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={emailForm.control}
                                name="label"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Rótulo (opcional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="On-call" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={emailForm.control}
                                name="isActive"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start gap-2 space-y-0 rounded-lg border px-3 py-2">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={(checked) => field.onChange(checked === true)}
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal">Ativo</FormLabel>
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setEmailDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" isLoading={emailForm.formState.isSubmitting}>
                                    {editingEmail ? 'Salvar' : 'Adicionar'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <ConfirmDeleteDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
                title={deleteTarget?.kind === 'group' ? 'Remover grupo?' : 'Remover e-mail?'}
                description={
                    deleteTarget?.kind === 'group'
                        ? `O grupo “${deleteTarget.item.name}” e todos os e-mails dele serão removidos.`
                        : `O e-mail “${deleteTarget?.kind === 'email' ? deleteTarget.item.email : ''}” será removido.`
                }
                resourceName={
                    deleteTarget?.kind === 'group'
                        ? deleteTarget.item.name
                        : deleteTarget?.kind === 'email'
                          ? deleteTarget.item.email
                          : ''
                }
                confirmLabel="Remover"
                isConfirming={deleting}
                onConfirm={onDelete}
            />
        </div>
    );
}
