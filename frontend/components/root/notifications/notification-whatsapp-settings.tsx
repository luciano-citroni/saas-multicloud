'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
    BookOpen,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    MessageCircle,
    Pencil,
    Plus,
    Send,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useTranslations } from '@/lib/i18n';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { extractErrorMessage } from '@/lib/error-messages';
import {
    createNotificationGroup,
    createNotificationWhatsappTarget,
    deleteNotificationGroup,
    deleteNotificationWhatsappTarget,
    fetchNotificationGroups,
    joinWhatsappGroupByInvite,
    sendNotificationGroupTestEmail,
    sendNotificationWhatsappTargetTest,
    updateNotificationGroup,
    updateNotificationWhatsappTarget,
} from '@/app/actions/notifications';

export type WhatsappTargetItem = {
    id: string;
    organizationId: string;
    groupId: string;
    targetType: 'phone' | 'group';
    target: string;
    label: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

export type WhatsappGroupItem = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    channel: 'whatsapp';
    isActive: boolean;
    whatsappTargets?: WhatsappTargetItem[];
    emails?: unknown[];
    createdAt: string;
    updatedAt: string;
};

const createGroupSchema = (t: { nameRequired: string }) =>
    z.object({
        name: z.string().min(1, t.nameRequired).max(120),
        description: z.string().max(255).optional(),
        isActive: z.boolean(),
    });

const createTargetSchema = (t: {
    targetRequired: string;
    phoneInvalid: string;
    groupIdInvalid: string;
}) =>
    z
        .object({
            targetType: z.enum(['phone', 'group']),
            target: z.string().min(1, t.targetRequired).max(120),
            label: z.string().max(120).optional(),
            isActive: z.boolean(),
        })
        .superRefine((data, ctx) => {
            if (data.targetType === 'phone') {
                const digits = data.target.replace(/[^\d]/g, '');
                if (!/^\d{10,15}$/.test(digits)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['target'],
                        message: t.phoneInvalid,
                    });
                }
                return;
            }

            if (!data.target.includes('@g.us')) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['target'],
                    message: t.groupIdInvalid,
                });
            }
        });

const createInviteSchema = (t: { inviteRequired: string; inviteInvalid: string }) =>
    z.object({
        inviteLink: z
            .string()
            .min(8, t.inviteRequired)
            .max(500)
            .refine(
                (value) =>
                    value.includes('chat.whatsapp.com') ||
                    value.includes('whatsapp.com/invite') ||
                    /^[a-zA-Z0-9_-]{10,64}$/.test(value.trim()),
                t.inviteInvalid,
            ),
        label: z.string().max(120).optional(),
        isActive: z.boolean(),
    });

type GroupFormData = z.infer<ReturnType<typeof createGroupSchema>>;
type TargetFormData = z.infer<ReturnType<typeof createTargetSchema>>;
type InviteFormData = z.infer<ReturnType<typeof createInviteSchema>>;

/** Renders a translated string containing simple <b>…</b> and <code>…</code> markup. */
function renderRichText(text: string): ReactNode[] {
    return text.split(/(<b>.*?<\/b>|<code>.*?<\/code>)/g).map((part, index) => {
        if (part.startsWith('<b>')) {
            return (
                <strong key={index} className="text-foreground">
                    {part.slice(3, -4)}
                </strong>
            );
        }
        if (part.startsWith('<code>')) {
            return (
                <code key={index} className="text-xs">
                    {part.slice(6, -7)}
                </code>
            );
        }
        return part;
    });
}

type DeleteTarget =
    | { kind: 'group'; item: WhatsappGroupItem }
    | { kind: 'target'; item: WhatsappTargetItem };

type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

function normalizeGroupsPayload(payload: unknown): {
    items: WhatsappGroupItem[];
    pagination: PaginationMeta | null;
} {
    if (Array.isArray(payload)) {
        return { items: payload as WhatsappGroupItem[], pagination: null };
    }

    if (payload && typeof payload === 'object') {
        const body = payload as { items?: unknown; pagination?: Partial<PaginationMeta> | null };
        const items = Array.isArray(body.items) ? (body.items as WhatsappGroupItem[]) : [];
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

type NotificationWhatsappSettingsProps = {
    organizationId: string;
    canManage: boolean;
};

export function NotificationWhatsappSettings({
    organizationId,
    canManage,
}: NotificationWhatsappSettingsProps) {
    const t = useTranslations('notifications');
    const tc = useTranslations('common');
    const [groups, setGroups] = useState<WhatsappGroupItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);

    const [groupDialogOpen, setGroupDialogOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<WhatsappGroupItem | null>(null);

    const [targetDialogOpen, setTargetDialogOpen] = useState(false);
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
    const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
    const [editingTarget, setEditingTarget] = useState<WhatsappTargetItem | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testingGroupId, setTestingGroupId] = useState<string | null>(null);

    const groupSchema = useMemo(() => createGroupSchema(t), [t]);
    const targetSchema = useMemo(() => createTargetSchema(t), [t]);
    const inviteSchema = useMemo(() => createInviteSchema(t), [t]);

    const groupForm = useForm<GroupFormData>({
        resolver: zodResolver(groupSchema),
        defaultValues: { name: '', description: '', isActive: true },
    });

    const targetForm = useForm<TargetFormData>({
        resolver: zodResolver(targetSchema),
        defaultValues: { targetType: 'phone', target: '', label: '', isActive: true },
    });

    const inviteForm = useForm<InviteFormData>({
        resolver: zodResolver(inviteSchema),
        defaultValues: { inviteLink: '', label: '', isActive: true },
    });

    const watchedTargetType = targetForm.watch('targetType');

    const load = useCallback(
        async (orgId: string, nextPage = page, nextLimit = pageSize) => {
            setLoading(true);
            try {
                const response = await fetchNotificationGroups(orgId, 'whatsapp', {
                    page: nextPage,
                    limit: nextLimit,
                });
                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    toast.error(extractErrorMessage(body));
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
                toast.error(t.loadWaGroupsError);
                setGroups([]);
                setPagination(null);
            } finally {
                setLoading(false);
            }
        },
        [page, pageSize, t],
    );

    useEffect(() => {
        void load(organizationId, page, pageSize);
    }, [organizationId, page, pageSize, load]);

    const openCreateGroup = () => {
        setEditingGroup(null);
        groupForm.reset({ name: '', description: '', isActive: true });
        setGroupDialogOpen(true);
    };

    const openEditGroup = (group: WhatsappGroupItem) => {
        setEditingGroup(group);
        groupForm.reset({
            name: group.name,
            description: group.description ?? '',
            isActive: group.isActive,
        });
        setGroupDialogOpen(true);
    };

    const openCreateTarget = (groupId: string) => {
        setTargetGroupId(groupId);
        setEditingTarget(null);
        targetForm.reset({ targetType: 'phone', target: '', label: '', isActive: true });
        setTargetDialogOpen(true);
    };

    const openJoinInvite = (groupId: string) => {
        setTargetGroupId(groupId);
        inviteForm.reset({ inviteLink: '', label: '', isActive: true });
        setInviteDialogOpen(true);
    };

    const openEditTarget = (target: WhatsappTargetItem) => {
        setTargetGroupId(target.groupId);
        setEditingTarget(target);
        targetForm.reset({
            targetType: target.targetType,
            target: target.target,
            label: target.label ?? '',
            isActive: target.isActive,
        });
        setTargetDialogOpen(true);
    };

    const onSubmitGroup = async (data: GroupFormData) => {
        const payload = {
            name: data.name.trim(),
            description: data.description?.trim() ? data.description.trim() : null,
            channel: 'whatsapp' as const,
            isActive: data.isActive,
        };

        try {
            const response = editingGroup
                ? await updateNotificationGroup(organizationId, editingGroup.id, payload)
                : await createNotificationGroup(organizationId, payload);
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(editingGroup ? t.groupUpdated : t.groupCreated);
            setGroupDialogOpen(false);
            if (!editingGroup) setPage(1);
            void load(organizationId, editingGroup ? page : 1, pageSize);
        } catch {
            toast.error(t.saveGroupError);
        }
    };

    const onSubmitTarget = async (data: TargetFormData) => {
        if (!targetGroupId) return;
        const payload = {
            targetType: data.targetType,
            target:
                data.targetType === 'phone'
                    ? data.target.replace(/[^\d]/g, '')
                    : data.target.replace(/\s+/g, ''),
            label: data.label?.trim() ? data.label.trim() : null,
            isActive: data.isActive,
        };

        try {
            const response = editingTarget
                ? await updateNotificationWhatsappTarget(organizationId, editingTarget.id, payload)
                : await createNotificationWhatsappTarget(organizationId, targetGroupId, payload);
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(editingTarget ? t.targetUpdated : t.targetAdded);
            setTargetDialogOpen(false);
            void load(organizationId, page, pageSize);
        } catch {
            toast.error(t.saveTargetError);
        }
    };

    const onSubmitInvite = async (data: InviteFormData) => {
        if (!targetGroupId) return;

        try {
            const response = await joinWhatsappGroupByInvite(organizationId, targetGroupId, {
                inviteLink: data.inviteLink.trim(),
                label: data.label?.trim() ? data.label.trim() : null,
                isActive: data.isActive,
            });
            const body = (await response.json().catch(() => null)) as {
                target?: string;
                message?: string;
            } | null;
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(
                body?.target
                    ? t.joinedGroupWithId.replace('{target}', body.target)
                    : t.joinedGroup,
            );
            setInviteDialogOpen(false);
            void load(organizationId, page, pageSize);
        } catch {
            toast.error(t.joinGroupError);
        }
    };

    const onDelete = async (): Promise<boolean> => {
        if (!deleteTarget) return true;
        setDeleting(true);
        try {
            const response =
                deleteTarget.kind === 'group'
                    ? await deleteNotificationGroup(organizationId, deleteTarget.item.id)
                    : await deleteNotificationWhatsappTarget(organizationId, deleteTarget.item.id);

            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => null);
                toast.error(extractErrorMessage(body));
                return false;
            }

            toast.success(deleteTarget.kind === 'group' ? t.groupRemoved : t.targetRemoved);
            setDeleteTarget(null);
            const shouldGoPrev = deleteTarget.kind === 'group' && groups.length <= 1 && page > 1;
            const nextPage = shouldGoPrev ? page - 1 : page;
            if (shouldGoPrev) setPage(nextPage);
            void load(organizationId, nextPage, pageSize);
            return true;
        } catch {
            toast.error(t.removeError);
            return false;
        } finally {
            setDeleting(false);
        }
    };

    const onSendTest = async (target: WhatsappTargetItem) => {
        setTestingId(target.id);
        try {
            const response = await sendNotificationWhatsappTargetTest(organizationId, target.id);
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.waTestMessageSent.replace('{target}', target.target));
        } catch {
            toast.error(t.sendWaTestError);
        } finally {
            setTestingId(null);
        }
    };

    const onSendGroupTest = async (group: WhatsappGroupItem) => {
        setTestingGroupId(group.id);
        try {
            const response = await sendNotificationGroupTestEmail(organizationId, group.id);
            const body = (await response.json().catch(() => null)) as {
                sent?: number;
                failed?: number;
            } | null;
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            const sent = body?.sent ?? 0;
            const failed = body?.failed ?? 0;
            if (failed > 0) {
                toast.success(
                    t.groupTestResult.replace('{sent}', String(sent)).replace('{failed}', String(failed)),
                );
            } else {
                toast.success(t.waGroupTestMessageSent.replace('{count}', String(sent)));
            }
        } catch {
            toast.error(t.sendGroupTestError);
        } finally {
            setTestingGroupId(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2 rounded-lg border px-4 py-3">
                <div className="space-y-0.5">
                    <p className="flex items-center gap-2 text-sm font-medium">
                        <BookOpen className="size-4" />
                        {t.waHowToTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.waHowToDesc}</p>
                </div>
                <Accordion type="single" collapsible defaultValue="howto">
                    <AccordionItem value="howto" className="border-none">
                        <AccordionTrigger className="py-2 text-sm">{t.waViewSteps}</AccordionTrigger>
                        <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                            <ol className="list-decimal space-y-2 pl-4">
                                <li>{renderRichText(t.waStep1)}</li>
                                <li>{renderRichText(t.waStep2)}</li>
                                <li>{renderRichText(t.waStep3)}</li>
                                <li>{renderRichText(t.waStep4)}</li>
                                <li>{renderRichText(t.waStep5)}</li>
                                <li>{renderRichText(t.waStep6)}</li>
                            </ol>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                    <p className="flex items-center gap-2 text-sm font-medium">
                        <MessageCircle className="size-4" />
                        {t.waGroupsTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.waGroupsDesc}</p>
                </div>
                {canManage && (
                    <Button size="sm" onClick={openCreateGroup}>
                        <Plus className="h-4 w-4" />
                        {t.newGroup}
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                    ))}
                </div>
            ) : groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                    <MessageCircle className="h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">{t.waEmptyGroups}</p>
                    {canManage && (
                        <Button variant="outline" size="sm" onClick={openCreateGroup}>
                            <Plus className="h-3 w-3" />
                            {t.createGroup}
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
                                    <TableHead>{t.group}</TableHead>
                                    <TableHead>{t.targets}</TableHead>
                                    <TableHead>{tc.status}</TableHead>
                                    <TableHead className="text-right">{tc.actions}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groups.map((group) => {
                                    const isOpen = Boolean(expanded[group.id]);
                                    const targets = group.whatsappTargets ?? [];
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
                                                <TableCell>{targets.length}</TableCell>
                                                <TableCell>
                                                    <Badge variant={group.isActive ? 'default' : 'outline'}>
                                                        {group.isActive ? t.active : t.inactive}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        {canManage && (
                                                            <>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon-sm"
                                                                    isLoading={testingGroupId === group.id}
                                                                    onClick={() => void onSendGroupTest(group)}
                                                                    title={t.testGroup}
                                                                >
                                                                    <Send className="size-3.5" />
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
                                                            </>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                            {isOpen ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="bg-muted/20 p-0">
                                                        <div className="space-y-3 p-4">
                                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                                <p className="text-sm font-medium">{t.targets}</p>
                                                                {canManage && (
                                                                    <div className="flex flex-wrap gap-2">
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={() =>
                                                                                openJoinInvite(group.id)
                                                                            }
                                                                        >
                                                                            <MessageCircle className="size-3.5" />
                                                                            {t.joinWithLink}
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() =>
                                                                                openCreateTarget(group.id)
                                                                            }
                                                                        >
                                                                            <Plus className="size-3.5" />
                                                                            {t.addTarget}
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {targets.length === 0 ? (
                                                                <p className="text-sm text-muted-foreground">
                                                                    {t.emptyTargets}
                                                                </p>
                                                            ) : (
                                                                <div className="overflow-hidden rounded-md border">
                                                                    <Table>
                                                                        <TableHeader>
                                                                            <TableRow>
                                                                                <TableHead>{t.targetType}</TableHead>
                                                                                <TableHead>{t.target}</TableHead>
                                                                                <TableHead>{t.label}</TableHead>
                                                                                <TableHead>{tc.status}</TableHead>
                                                                                <TableHead className="text-right">
                                                                                    {tc.actions}
                                                                                </TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {targets.map((target) => (
                                                                                <TableRow key={target.id}>
                                                                                    <TableCell>
                                                                                        <Badge variant="outline">
                                                                                            {target.targetType ===
                                                                                            'phone'
                                                                                                ? t.phone
                                                                                                : t.waGroupType}
                                                                                        </Badge>
                                                                                    </TableCell>
                                                                                    <TableCell className="font-mono text-xs">
                                                                                        {target.target}
                                                                                    </TableCell>
                                                                                    <TableCell>
                                                                                        {target.label ?? '—'}
                                                                                    </TableCell>
                                                                                    <TableCell>
                                                                                        <Badge
                                                                                            variant={
                                                                                                target.isActive
                                                                                                    ? 'default'
                                                                                                    : 'outline'
                                                                                            }
                                                                                        >
                                                                                            {target.isActive
                                                                                                ? t.active
                                                                                                : t.inactive}
                                                                                        </Badge>
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right">
                                                                                        {canManage ? (
                                                                                            <div className="flex justify-end gap-1">
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon-sm"
                                                                                                    isLoading={
                                                                                                        testingId ===
                                                                                                        target.id
                                                                                                    }
                                                                                                    onClick={() =>
                                                                                                        void onSendTest(
                                                                                                            target,
                                                                                                        )
                                                                                                    }
                                                                                                    title={t.test}
                                                                                                >
                                                                                                    <Send className="size-3.5" />
                                                                                                </Button>
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon-sm"
                                                                                                    onClick={() =>
                                                                                                        openEditTarget(
                                                                                                            target,
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
                                                                                                                kind: 'target',
                                                                                                                item: target,
                                                                                                            },
                                                                                                        )
                                                                                                    }
                                                                                                >
                                                                                                    <Trash2 className="size-3.5" />
                                                                                                </Button>
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            ))}
                                                                        </TableBody>
                                                                    </Table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : null}
                                        </Fragment>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {pagination ? (
                        <div className="flex flex-col gap-4 px-1 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                                <span className="shrink-0 whitespace-nowrap">{tc.rowsPerPage}</span>
                                <Select
                                    value={String(pageSize)}
                                    onValueChange={(value) => {
                                        setPageSize(Number(value));
                                        setPage(1);
                                    }}
                                >
                                    <SelectTrigger className="h-8 min-w-22">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[10, 25, 50].map((size) => (
                                            <SelectItem key={size} value={String(size)}>
                                                {size}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                <span className="text-sm font-medium">
                                    {tc.page} {pagination.page} {tc.of} {Math.max(1, pagination.totalPages)}
                                </span>
                                <div className="flex items-center gap-1 self-start sm:self-auto">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPage(1)}
                                        disabled={!pagination.hasPreviousPage}
                                    >
                                        <ChevronsLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                                        disabled={!pagination.hasPreviousPage}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPage((current) => current + 1)}
                                        disabled={!pagination.hasNextPage}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setPage(Math.max(1, pagination.totalPages ?? 1))}
                                        disabled={!pagination.hasNextPage}
                                    >
                                        <ChevronsRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingGroup ? t.editGroup : t.waNewGroupTitle}</DialogTitle>
                        <DialogDescription>{t.waGroupDialogDesc}</DialogDescription>
                    </DialogHeader>
                    <Form {...groupForm}>
                        <form onSubmit={groupForm.handleSubmit(onSubmitGroup)} className="space-y-4">
                            <FormField
                                control={groupForm.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{tc.name}</FormLabel>
                                        <FormControl>
                                            <Input placeholder="FinOps WhatsApp" {...field} />
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
                                        <FormLabel>{t.descriptionOptional}</FormLabel>
                                        <FormControl>
                                            <Input placeholder={t.waGroupDescPlaceholder} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={groupForm.control}
                                name="isActive"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={(checked) =>
                                                    field.onChange(checked === true)
                                                }
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal">{t.groupActive}</FormLabel>
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setGroupDialogOpen(false)}
                                >
                                    {tc.cancel}
                                </Button>
                                <Button type="submit" isLoading={groupForm.formState.isSubmitting}>
                                    {t.save}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.inviteTitle}</DialogTitle>
                        <DialogDescription>{t.inviteDesc}</DialogDescription>
                    </DialogHeader>
                    <Form {...inviteForm}>
                        <form onSubmit={inviteForm.handleSubmit(onSubmitInvite)} className="space-y-4">
                            <FormField
                                control={inviteForm.control}
                                name="inviteLink"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t.inviteLink}</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="https://chat.whatsapp.com/L3aExanF53C2zIpFzU6B73"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={inviteForm.control}
                                name="label"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t.labelOptional}</FormLabel>
                                        <FormControl>
                                            <Input placeholder={t.inviteLabelPlaceholder} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={inviteForm.control}
                                name="isActive"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={(checked) =>
                                                    field.onChange(checked === true)
                                                }
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal">{t.targetActive}</FormLabel>
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setInviteDialogOpen(false)}
                                >
                                    {tc.cancel}
                                </Button>
                                <Button type="submit" isLoading={inviteForm.formState.isSubmitting}>
                                    {t.joinAndSave}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingTarget ? t.editTargetTitle : t.newTargetTitle}</DialogTitle>
                        <DialogDescription>{renderRichText(t.targetDialogDesc)}</DialogDescription>
                    </DialogHeader>
                    <Form {...targetForm}>
                        <form onSubmit={targetForm.handleSubmit(onSubmitTarget)} className="space-y-4">
                            <FormField
                                control={targetForm.control}
                                name="targetType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t.targetType}</FormLabel>
                                        <Select
                                            value={field.value}
                                            onValueChange={(value) =>
                                                field.onChange(value as 'phone' | 'group')
                                            }
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="phone">{t.phone}</SelectItem>
                                                <SelectItem value="group">{t.waGroupOption}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={targetForm.control}
                                name="target"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {watchedTargetType === 'group' ? t.groupIdLabel : t.numberLabel}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={
                                                    watchedTargetType === 'group'
                                                        ? '120363012345678901@g.us'
                                                        : '5511999999999'
                                                }
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={targetForm.control}
                                name="label"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t.labelOptional}</FormLabel>
                                        <FormControl>
                                            <Input placeholder="On-call" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={targetForm.control}
                                name="isActive"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={(checked) =>
                                                    field.onChange(checked === true)
                                                }
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal">{t.targetActive}</FormLabel>
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setTargetDialogOpen(false)}
                                >
                                    {tc.cancel}
                                </Button>
                                <Button type="submit" isLoading={targetForm.formState.isSubmitting}>
                                    {t.save}
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
                title={
                    deleteTarget?.kind === 'group' ? t.removeWaGroupTitle : t.removeTargetTitle
                }
                description={
                    deleteTarget?.kind === 'group'
                        ? t.removeWaGroupDesc.replace('{name}', deleteTarget.item.name)
                        : deleteTarget?.kind === 'target'
                          ? t.removeTargetDesc.replace(
                                '{name}',
                                deleteTarget.item.label?.trim() || deleteTarget.item.target,
                            )
                          : t.removeConfirmGeneric
                }
                resourceName={tc.deleteConfirmPlaceholder}
                confirmLabel={t.remove}
                isConfirming={deleting}
                onConfirm={onDelete}
            />
        </div>
    );
}
