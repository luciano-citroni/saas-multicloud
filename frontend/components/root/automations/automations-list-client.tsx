'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Copy,
    History,
    Loader2,
    Play,
    Plus,
    Power,
    PowerOff,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { extractErrorMessage } from '@/lib/error-messages';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import { hasRequiredOrganizationRole, normalizeOrganizationRole } from '@/lib/organization-rbac';
import {
    fetchAutomations,
    deleteAutomation,
    duplicateAutomation,
    activateAutomation,
    deactivateAutomation,
    type AutomationWorkflow,
} from '@/app/actions/automations';
import { cn } from '@/lib/utils';
import { executionStatusClass, workflowStatusClass } from './status-styles';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 30] as const;

type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

function getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

function normalizePagination(payload: unknown): PaginationMeta | null {
    if (!payload || typeof payload !== 'object') return null;
    const pagination = (payload as { pagination?: Record<string, unknown> }).pagination;
    if (!pagination) return null;

    const page = Number(pagination.page);
    const limit = Number(pagination.limit);
    const totalItems = Number(pagination.totalItems);
    const totalPages = Number(pagination.totalPages);

    if (![page, limit, totalItems, totalPages].every((value) => Number.isFinite(value))) {
        return null;
    }

    return {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: Boolean(pagination.hasNextPage),
        hasPreviousPage: Boolean(pagination.hasPreviousPage),
    };
}

export function AutomationsListClient() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const limitParam = Number.parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10);
    const pageSize = PAGE_SIZE_OPTIONS.includes(limitParam as (typeof PAGE_SIZE_OPTIONS)[number])
        ? limitParam
        : DEFAULT_PAGE_SIZE;

    const [automations, setAutomations] = useState<AutomationWorkflow[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [orgId, setOrgId] = useState<string | null>(null);
    const midOrgId = useActiveMidOrgId(orgId);
    const { currentRole: rawRole } = useOrganizationFromSidebar(orgId);
    const role = normalizeOrganizationRole(rawRole);
    const [deleteTarget, setDeleteTarget] = useState<AutomationWorkflow | null>(null);
    const [deleting, setDeleting] = useState(false);

    const syncUrlState = useCallback(
        (next: Partial<{ page: number | null; limit: number | null }>) => {
            const params = new URLSearchParams(searchParams.toString());
            if (next.page !== undefined) {
                if (!next.page || next.page <= 1) params.delete('page');
                else params.set('page', String(next.page));
            }
            if (next.limit !== undefined) {
                if (!next.limit || next.limit === DEFAULT_PAGE_SIZE) params.delete('limit');
                else params.set('limit', String(next.limit));
            }
            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    const load = useCallback(async () => {
        const currentOrgId = getOrgId();
        if (!currentOrgId) {
            setAutomations([]);
            setPagination(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const response = await fetchAutomations(currentOrgId, {
                page,
                limit: pageSize,
                midOrgId: midOrgId ?? getActiveMidOrgId(currentOrgId),
            });
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            const items = (body as { items?: AutomationWorkflow[] }).items ?? (body as AutomationWorkflow[]);
            setAutomations(Array.isArray(items) ? items : []);
            setPagination(normalizePagination(body));
        } catch {
            toast.error('Falha ao carregar automações');
        } finally {
            setLoading(false);
        }
    }, [midOrgId, page, pageSize]);

    useEffect(() => {
        setOrgId(getOrgId());
        const handle = () => setOrgId(getOrgId());
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
        window.addEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, handle);
        window.addEventListener('storage', handle);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handle);
            window.removeEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, handle);
            window.removeEventListener('storage', handle);
        };
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!pagination) return;
        if (pagination.totalPages > 0 && page > pagination.totalPages) {
            syncUrlState({ page: pagination.totalPages });
        }
    }, [page, pagination, syncUrlState]);

    const canAdmin = hasRequiredOrganizationRole(role, 'ADMIN');

    const totalPages = Math.max(1, pagination?.totalPages ?? 1);
    const safePage = Math.min(page, totalPages);
    const hasPreviousPage = safePage > 1;
    const hasNextPage = pagination?.hasNextPage ?? safePage < totalPages;
    const totalItems = pagination?.totalItems ?? automations.length;

    const pageSummary = useMemo(() => {
        if (totalItems === 0) return '0 automação(ões)';
        return `Página ${safePage} de ${totalPages} · ${totalItems} automação(ões)`;
    }, [safePage, totalItems, totalPages]);

    async function handleAction(action: string, id: string) {
        const currentOrgId = getOrgId();
        if (!currentOrgId) return;

        const handlers: Record<string, () => Promise<Response>> = {
            execute: async () => {
                const automation = automations.find((item) => item.id === id);
                const fromExecution =
                    automation?.lastExecution?.status === 'FAILED' ? automation.lastExecution.id : null;
                const query = fromExecution
                    ? `execute=1&fromExecution=${encodeURIComponent(fromExecution)}`
                    : 'execute=1';
                const basePath =
                    automation?.status === 'DRAFT' && automation.version > 0
                        ? `/automations/${id}/published`
                        : `/automations/${id}`;
                router.push(`${basePath}?${query}`);
                return new Response(null, { status: 499 });
            },
            duplicate: () => duplicateAutomation(id, currentOrgId),
            activate: () => activateAutomation(id, currentOrgId),
            deactivate: () => deactivateAutomation(id, currentOrgId),
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

    async function confirmDelete(): Promise<boolean> {
        if (!deleteTarget) return true;
        const currentOrgId = getOrgId();
        if (!currentOrgId) return true;

        setDeleting(true);
        try {
            const response = await deleteAutomation(deleteTarget.id, currentOrgId);
            if (!response.ok && response.status !== 204) {
                const body = await response.json().catch(() => ({}));
                toast.error(extractErrorMessage(body as never, 'pt'));
                return false;
            }
            toast.success('Automação excluída');
            setDeleteTarget(null);
            await load();
            return true;
        } catch {
            toast.error('Falha ao excluir automação');
            return false;
        } finally {
            setDeleting(false);
        }
    }

    if (loading && automations.length === 0) {
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
                            <TableHead>Última execução</TableHead>
                            <TableHead>Versão</TableHead>
                            <TableHead>Atualizado</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {automations.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
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
                                    <TableCell>
                                        {automation.lastExecution ? (
                                            <div className="max-w-[260px] space-y-1.5">
                                                <Link
                                                    href={`/automations/${automation.id}/executions/${automation.lastExecution.id}`}
                                                    className="-m-1 block space-y-1 rounded-md p-1 hover:bg-muted/60"
                                                >
                                                    <Badge
                                                        className={cn(
                                                            'text-[10px]',
                                                            executionStatusClass(automation.lastExecution.status),
                                                        )}
                                                    >
                                                        {automation.lastExecution.status}
                                                    </Badge>
                                                    {automation.lastExecution.status === 'FAILED' &&
                                                        automation.lastExecution.errorMessage && (
                                                            <p className="line-clamp-2 text-[11px] text-destructive">
                                                                {automation.lastExecution.errorMessage}
                                                            </p>
                                                        )}
                                                </Link>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
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
                                            {canAdmin &&
                                                automation.version > 0 &&
                                                automation.status !== 'INACTIVE' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleAction('execute', automation.id)}
                                                    >
                                                        <Play className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            {canAdmin && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleAction('duplicate', automation.id)}
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canAdmin && automation.status === 'INACTIVE' && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleAction('activate', automation.id)}
                                                >
                                                    <Power className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canAdmin && automation.status === 'ACTIVE' && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleAction('deactivate', automation.id)}
                                                >
                                                    <PowerOff className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canAdmin && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setDeleteTarget(automation)}
                                                >
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

            {totalItems > 0 ? (
                <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                        <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                        <Select
                            value={`${pageSize}`}
                            onValueChange={(value) => {
                                syncUrlState({ limit: Number(value), page: null });
                            }}
                        >
                            <SelectTrigger className="h-8 min-w-22">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PAGE_SIZE_OPTIONS.map((size) => (
                                    <SelectItem key={size} value={`${size}`}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                        <span className="text-sm font-medium">{pageSummary}</span>
                        <div className="flex items-center gap-1 self-start sm:self-auto">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => syncUrlState({ page: null })}
                                disabled={!hasPreviousPage}
                            >
                                <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => syncUrlState({ page: Math.max(1, safePage - 1) })}
                                disabled={!hasPreviousPage}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => syncUrlState({ page: safePage + 1 })}
                                disabled={!hasNextPage}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => syncUrlState({ page: totalPages })}
                                disabled={!hasNextPage}
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            <ConfirmDeleteDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => {
                    if (!open && !deleting) setDeleteTarget(null);
                }}
                title="Excluir automação?"
                description={
                    <>
                        A automação <span className="font-medium text-foreground">{deleteTarget?.name}</span> será
                        removida permanentemente. Esta ação não pode ser desfeita.
                    </>
                }
                resourceName={deleteTarget?.name ?? ''}
                isConfirming={deleting}
                onConfirm={confirmDelete}
            />
        </div>
    );
}
