'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Search,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatNumber } from '@/lib/i18n/format';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { extractErrorMessage } from '@/lib/error-messages';
import { supportsAiGatewayTokenLimits } from '@/lib/ai-gateway-limits';
import { useTranslations } from '@/lib/i18n';
import {
    hasRequiredOrganizationRole,
    normalizeOrganizationRole,
} from '@/lib/organization-rbac';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import { cn } from '@/lib/utils';
import {
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import {
    createAiFinopsPolicy,
    deleteAiFinopsPolicy,
    fetchAiFinopsConnections,
    fetchAiFinopsCostUsers,
    fetchAiFinopsPolicies,
    updateAiFinopsPolicy,
} from '@/app/actions/ai-finops';
import {
    createConnectionLimitsSchema,
    type ConnectionLimitsFormValues,
} from './schema';

export type ConnectionLimitsPolicy = {
    id: string;
    name: string;
    scopeType: string;
    scopeId: string | null;
    maxTokens: string | number | null;
    maxCost: string | number | null;
    maxRequestsPerMinute: number | null;
    onLimitAction: string;
    fallbackConfig?: Record<string, unknown> | null;
};

type ConnectionOption = {
    id: string;
    name: string;
    providerSlug: string;
    status?: string;
};

type CostUser = { externalId: string; label: string };

const PAGE_SIZES = [5, 10, 20, 30] as const;

function asArray<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
        return (payload as { items: T[] }).items;
    }
    return [];
}

function emptyFormValues(): ConnectionLimitsFormValues {
    return {
        target: 'connection',
        userExternalId: '',
        maxTokens: '',
        maxCost: '',
        maxRequestsPerMinute: '',
        onLimitAction: 'block',
    };
}

function toFormValues(policy: ConnectionLimitsPolicy | null): ConnectionLimitsFormValues {
    if (!policy) return emptyFormValues();
    return {
        target: policy.scopeType === 'user' ? 'user' : 'connection',
        userExternalId: policy.scopeType === 'user' ? (policy.scopeId ?? '') : '',
        maxTokens: policy.maxTokens != null ? String(policy.maxTokens) : '',
        maxCost: policy.maxCost != null ? String(policy.maxCost) : '',
        maxRequestsPerMinute:
            policy.maxRequestsPerMinute != null ? String(policy.maxRequestsPerMinute) : '',
        onLimitAction:
            policy.onLimitAction === 'notify' || policy.onLimitAction === 'rate_limit'
                ? policy.onLimitAction
                : 'block',
    };
}

export function isConnectionBoundPolicy(
    policy: ConnectionLimitsPolicy,
    connectionId: string,
): boolean {
    if (policy.scopeType === 'connection' && policy.scopeId === connectionId) return true;
    if (policy.scopeType === 'user') {
        return policy.fallbackConfig?.connectionId === connectionId;
    }
    return false;
}

export function AiConnectionLimitsPage() {
    const t = useTranslations('aiGovernance');
    const tc = useTranslations('common');
    const params = useParams<{ connectionId: string }>();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const connectionId = params.connectionId;

    const [tenantId, setTenantId] = useState<string | null>(null);
    const [midOrgId, setMidOrgId] = useState<string | null>(null);
    const [connection, setConnection] = useState<ConnectionOption | null>(null);
    const [policies, setPolicies] = useState<ConnectionLimitsPolicy[]>([]);
    const [users, setUsers] = useState<CostUser[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [pending, startTransition] = useTransition();
    const [formOpen, setFormOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<ConnectionLimitsPolicy | null>(null);
    const [deletePolicy, setDeletePolicy] = useState<ConnectionLimitsPolicy | null>(null);
    const [deleting, setDeleting] = useState(false);

    const { currentRole: rawRole } = useOrganizationFromSidebar(tenantId);
    const canManage = hasRequiredOrganizationRole(normalizeOrganizationRole(rawRole), 'ADMIN');

    const pageSize = useMemo(() => {
        const raw = Number(searchParams.get('limit') ?? '10');
        return PAGE_SIZES.includes(raw as (typeof PAGE_SIZES)[number]) ? raw : 10;
    }, [searchParams]);
    const page = useMemo(() => {
        const raw = Number(searchParams.get('page') ?? '1');
        return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
    }, [searchParams]);
    const searchQuery = (searchParams.get('q') ?? '').trim();
    const scopeFilter = searchParams.get('scope') === 'user' || searchParams.get('scope') === 'connection'
        ? searchParams.get('scope')!
        : 'all';
    const actionFilter =
        searchParams.get('action') === 'block' ||
        searchParams.get('action') === 'notify' ||
        searchParams.get('action') === 'rate_limit'
            ? searchParams.get('action')!
            : 'all';

    const schema = useMemo(
        () =>
            createConnectionLimitsSchema({
                userRequired: t.validation.connectionLimitsUserRequired,
                limitRequired: t.validation.connectionLimitsRequired,
                tokensInvalid: t.validation.connectionLimitsTokensInvalid,
                costInvalid: t.validation.connectionLimitsCostInvalid,
                rpmInvalid: t.validation.connectionLimitsRpmInvalid,
            }),
        [t.validation],
    );

    const form = useForm<ConnectionLimitsFormValues>({
        resolver: zodResolver(schema),
        defaultValues: emptyFormValues(),
        mode: 'onSubmit',
    });
    const target = form.watch('target');

    const userLabelById = useMemo(
        () => new Map(users.map((user) => [user.externalId, user.label])),
        [users],
    );

    const connectionPolicies = useMemo(() => {
        if (!connectionId) return [];
        return policies.filter((policy) => isConnectionBoundPolicy(policy, connectionId));
    }, [connectionId, policies]);

    const filteredPolicies = useMemo(() => {
        const needle = searchQuery.toLowerCase();
        return connectionPolicies.filter((policy) => {
            if (scopeFilter === 'user' && policy.scopeType !== 'user') return false;
            if (scopeFilter === 'connection' && policy.scopeType !== 'connection') return false;
            if (actionFilter !== 'all' && policy.onLimitAction !== actionFilter) return false;
            if (!needle) return true;
            const userLabel =
                policy.scopeType === 'user'
                    ? (userLabelById.get(policy.scopeId ?? '') ?? policy.scopeId ?? '')
                    : '';
            const haystack = [policy.name, userLabel, policy.scopeId ?? '', policy.onLimitAction]
                .join(' ')
                .toLowerCase();
            return haystack.includes(needle);
        });
    }, [actionFilter, connectionPolicies, scopeFilter, searchQuery, userLabelById]);

    const hasActiveFilters =
        Boolean(searchQuery) || scopeFilter !== 'all' || actionFilter !== 'all';

    const totalPages = Math.max(1, Math.ceil(filteredPolicies.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pagedPolicies = useMemo(() => {
        const start = (safePage - 1) * pageSize;
        return filteredPolicies.slice(start, start + pageSize);
    }, [filteredPolicies, pageSize, safePage]);

    const patchQuery = (patch: Record<string, string | null>, resetPage = true) => {
        const paramsNext = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === '' || value === 'all') paramsNext.delete(key);
            else paramsNext.set(key, value);
        }
        if (resetPage) paramsNext.set('page', '1');
        if (!paramsNext.get('limit')) paramsNext.set('limit', String(pageSize));
        router.replace(`${pathname}?${paramsNext.toString()}`, { scroll: false });
    };

    const setQuery = (nextPage: number, nextLimit: number) => {
        patchQuery({ page: String(nextPage), limit: String(nextLimit) }, false);
    };

    const clearFilters = () => {
        patchQuery({ q: null, scope: null, action: null, page: '1' });
    };

    const refresh = () => {
        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const mid = getActiveMidOrgId(orgId);
        setTenantId(orgId);
        setMidOrgId(mid);
        if (!orgId || !mid || !connectionId) {
            setLoading(false);
            return;
        }

        startTransition(async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const [connectionsRes, policiesRes, usersRes] = await Promise.all([
                    fetchAiFinopsConnections(orgId, mid),
                    fetchAiFinopsPolicies(orgId, mid),
                    fetchAiFinopsCostUsers(orgId, {
                        midOrganizationId: mid,
                        connectionIds: connectionId,
                    }),
                ]);

                if (!connectionsRes.ok) {
                    const body = await connectionsRes.json().catch(() => ({}));
                    setLoadError(extractErrorMessage(body));
                    setConnection(null);
                    return;
                }

                const connections = asArray<ConnectionOption>(await connectionsRes.json());
                const found = connections.find((item) => item.id === connectionId) ?? null;
                setConnection(found);

                if (!found) {
                    setLoadError(t.connectionNotFound);
                    return;
                }

                if (!supportsAiGatewayTokenLimits(found.providerSlug)) {
                    setLoadError(t.connectionLimitsIncompatible);
                    return;
                }

                setPolicies(
                    policiesRes.ok
                        ? asArray<ConnectionLimitsPolicy>(await policiesRes.json())
                        : [],
                );
                setUsers(usersRes.ok ? asArray<CostUser>(await usersRes.json()) : []);
            } catch {
                setLoadError(t.loadError);
            } finally {
                setLoading(false);
            }
        });
    };

    useEffect(() => {
        refresh();
        const onChange = () => refresh();
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onChange);
        return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionId]);

    useEffect(() => {
        if (page !== safePage) setQuery(safePage, pageSize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, safePage, pageSize]);

    const openCreate = () => {
        setEditingPolicy(null);
        form.reset(emptyFormValues());
        setFormOpen(true);
    };

    const openEdit = (policy: ConnectionLimitsPolicy) => {
        setEditingPolicy(policy);
        form.reset(toFormValues(policy));
        setFormOpen(true);
    };

    const closeForm = (open: boolean) => {
        setFormOpen(open);
        if (!open) {
            setEditingPolicy(null);
            form.reset(emptyFormValues());
        }
    };

    const onSubmit = form.handleSubmit((data) => {
        if (!connection || !canManage || !tenantId || !midOrgId) return;
        startTransition(async () => {
            const isUser = data.target === 'user';
            const userExternalId = (data.userExternalId ?? '').trim();
            const userLabel = userLabelById.get(userExternalId) ?? userExternalId;
            const payload = {
                organizationId: midOrgId,
                scopeType: isUser ? ('user' as const) : ('connection' as const),
                scopeId: isUser ? userExternalId : connection.id,
                name: isUser
                    ? `${t.connectionLimitsNamePrefix}: ${connection.name} / ${userLabel}`
                    : `${t.connectionLimitsNamePrefix}: ${connection.name}`,
                maxTokens: data.maxTokens ? Number(data.maxTokens) : null,
                maxCost: data.maxCost ? Number(data.maxCost) : null,
                maxRequestsPerMinute: data.maxRequestsPerMinute
                    ? Number(data.maxRequestsPerMinute)
                    : null,
                onLimitAction: data.onLimitAction,
                allowedProviders: [connection.providerSlug],
                allowedModels: [],
                fallbackConfig: isUser ? { connectionId: connection.id } : {},
            };

            const res = editingPolicy
                ? await updateAiFinopsPolicy(tenantId, editingPolicy.id, payload)
                : await createAiFinopsPolicy(tenantId, payload);
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(
                editingPolicy ? t.connectionLimitsUpdated : t.connectionLimitsCreated,
            );
            closeForm(false);
            refresh();
        });
    });

    const confirmDelete = async () => {
        if (!deletePolicy || !canManage || !tenantId) return false;
        setDeleting(true);
        try {
            const res = await deleteAiFinopsPolicy(tenantId, deletePolicy.id);
            if (!res.ok && res.status !== 204) {
                const body = await res.json().catch(() => ({}));
                toast.error(extractErrorMessage(body));
                return false;
            }
            toast.success(t.connectionLimitsRemoved);
            setDeletePolicy(null);
            refresh();
            return true;
        } finally {
            setDeleting(false);
        }
    };

    const actionLabel = (action: string) => {
        if (action === 'block') return t.connectionLimitsActionBlock;
        if (action === 'rate_limit') return t.connectionLimitsActionRateLimit;
        return t.connectionLimitsActionNotify;
    };

    const actionBadgeVariant = (
        action: string,
    ): 'default' | 'secondary' | 'outline' | 'destructive' => {
        if (action === 'block') return 'destructive';
        if (action === 'rate_limit') return 'default';
        return 'secondary';
    };

    const scopeLabel = (policy: ConnectionLimitsPolicy) => {
        if (policy.scopeType === 'user') {
            return userLabelById.get(policy.scopeId ?? '') ?? policy.scopeId ?? '—';
        }
        return t.connectionLimitsWholeConnection;
    };

    const formatCap = (value: string | number | null | undefined) => {
        if (value == null || value === '') return '—';
        const n = Number(value);
        if (!Number.isFinite(n)) return String(value);
        return formatNumber(n, { maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
    };

    const backHref = '/ai-governance?tab=connections';

    if (!tenantId || !midOrgId) {
        return (
            <div className="flex flex-col gap-4">
                <Button variant="outline" size="sm" asChild className="w-fit">
                    <Link href={backHref}>
                        <ArrowLeft className="size-4" />
                        {tc.back}
                    </Link>
                </Button>
                <p className="text-muted-foreground text-sm">{t.selectMidOrg}</p>
            </div>
        );
    }

    if (loading && !connection) {
        return <div className="text-muted-foreground text-sm">{tc.loading}</div>;
    }

    if (loadError || !connection) {
        return (
            <div className="flex flex-col gap-4">
                <Button variant="outline" size="sm" asChild className="w-fit">
                    <Link href={backHref}>
                        <ArrowLeft className="size-4" />
                        {tc.back}
                    </Link>
                </Button>
                <p className="text-destructive text-sm">{loadError ?? t.connectionNotFound}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit px-2">
                        <Link href={backHref}>
                            <ArrowLeft className="size-4" />
                            {tc.back}
                        </Link>
                    </Button>
                    <h1 className="text-xl font-semibold tracking-tight">
                        {t.connectionLimitsTitle}
                    </h1>
                    <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
                        {t.connectionLimitsDesc.replace('{name}', connection.name)}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                        <Badge variant="outline">{connection.name}</Badge>
                        <Badge variant="secondary">{connection.providerSlug}</Badge>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" isLoading={pending} onClick={refresh}>
                        <RefreshCw className="size-3.5" />
                        {tc.refresh}
                    </Button>
                    {canManage ? (
                        <Button size="sm" onClick={openCreate}>
                            <Plus className="size-3.5" />
                            {t.connectionLimitsAdd}
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="bg-muted/40 space-y-1 rounded-xl border px-4 py-3 text-xs leading-relaxed">
                <p>{t.connectionLimitsGatewayNote}</p>
                <p className="text-muted-foreground">{t.connectionLimitsMultiHint}</p>
            </div>

            <section className="space-y-3 rounded-xl border p-3 sm:p-4">
                <div className="flex items-center gap-2">
                    <Search className="text-muted-foreground size-4" />
                    <p className="text-sm font-medium">{t.connectionLimitsFilters}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="relative md:col-span-1">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                        <Input
                            value={searchParams.get('q') ?? ''}
                            onChange={(event) => patchQuery({ q: event.target.value || null })}
                            placeholder={t.connectionLimitsSearchPlaceholder}
                            className="pl-8"
                        />
                    </div>
                    <SearchableSelect
                        mode="single"
                        value={scopeFilter}
                        placeholder={t.connectionLimitsFilterScope}
                        onValueChange={(value) => patchQuery({ scope: value })}
                        options={[
                            { value: 'all', label: t.connectionLimitsFilterAll },
                            { value: 'connection', label: t.connectionLimitsWholeConnection },
                            { value: 'user', label: t.connectionLimitsProviderUser },
                        ]}
                    />
                    <SearchableSelect
                        mode="single"
                        value={actionFilter}
                        placeholder={t.connectionLimitsFilterAction}
                        onValueChange={(value) => patchQuery({ action: value })}
                        options={[
                            { value: 'all', label: t.connectionLimitsFilterAll },
                            { value: 'block', label: t.connectionLimitsActionBlock },
                            { value: 'notify', label: t.connectionLimitsActionNotify },
                            { value: 'rate_limit', label: t.connectionLimitsActionRateLimit },
                        ]}
                    />
                </div>
                {hasActiveFilters ? (
                    <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                            <X className="size-3.5" />
                            {t.connectionLimitsClearFilters}
                        </Button>
                    </div>
                ) : null}
            </section>

            <section className="rounded-xl border">
                <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <h2 className="text-sm font-medium">{t.connectionLimitsListTitle}</h2>
                        <p className="text-muted-foreground text-xs">
                            {t.connectionLimitsShowing
                                .replace('{shown}', String(filteredPolicies.length))
                                .replace('{total}', String(connectionPolicies.length))}
                        </p>
                    </div>
                </div>

                {connectionPolicies.length === 0 ? (
                    <p className="text-muted-foreground px-4 py-10 text-center text-sm">
                        {t.connectionLimitsEmpty}
                    </p>
                ) : filteredPolicies.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                        <p className="text-muted-foreground text-sm">
                            {t.connectionLimitsNoFilterResults}
                        </p>
                        <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                            <X className="size-3.5" />
                            {t.connectionLimitsClearFilters}
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 p-4">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t.connectionLimitsColScope}</TableHead>
                                        <TableHead className="text-right">
                                            {t.connectionLimitsColTokens}
                                        </TableHead>
                                        <TableHead className="text-right">
                                            {t.connectionLimitsColCost}
                                        </TableHead>
                                        <TableHead className="text-right">
                                            {t.connectionLimitsColRpm}
                                        </TableHead>
                                        <TableHead>{t.connectionLimitsColAction}</TableHead>
                                        <TableHead className="w-12 pr-4 text-right">
                                            {tc.actions}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pagedPolicies.map((policy) => (
                                        <TableRow key={policy.id}>
                                            <TableCell>
                                                <div className="space-y-1.5">
                                                    <div className="font-medium">
                                                        {scopeLabel(policy)}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <Badge
                                                            variant="outline"
                                                            className="text-xs"
                                                        >
                                                            {policy.scopeType === 'user'
                                                                ? t.connectionLimitsProviderUser
                                                                : t.connectionLimitsWholeConnection}
                                                        </Badge>
                                                        {policy.scopeType === 'user' &&
                                                        policy.scopeId ? (
                                                            <span className="text-muted-foreground font-mono text-[11px]">
                                                                {policy.scopeId}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatCap(policy.maxTokens)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {policy.maxCost != null
                                                    ? `$${formatCap(policy.maxCost)}`
                                                    : '—'}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatCap(policy.maxRequestsPerMinute)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={actionBadgeVariant(
                                                        policy.onLimitAction,
                                                    )}
                                                >
                                                    {actionLabel(policy.onLimitAction)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="pr-4 text-right">
                                                {canManage ? (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button size="icon-sm" variant="ghost">
                                                                <MoreHorizontal className="size-4" />
                                                                <span className="sr-only">
                                                                    {tc.actions}
                                                                </span>
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent
                                                            align="end"
                                                            collisionPadding={{
                                                                bottom: 96,
                                                                right: 24,
                                                            }}
                                                        >
                                                            <DropdownMenuItem
                                                                onClick={() => openEdit(policy)}
                                                            >
                                                                {tc.edit}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                variant="destructive"
                                                                onClick={() =>
                                                                    setDeletePolicy(policy)
                                                                }
                                                            >
                                                                {tc.delete}
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                ) : null}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                <span className="shrink-0 whitespace-nowrap">
                                    {tc.rowsPerPage}
                                </span>
                                <Select
                                    value={`${pageSize}`}
                                    onValueChange={(value) => setQuery(1, Number(value))}
                                >
                                    <SelectTrigger className="h-8 min-w-22">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent
                                        collisionPadding={{ bottom: 96, right: 24 }}
                                    >
                                        {PAGE_SIZES.map((size) => (
                                            <SelectItem key={size} value={`${size}`}>
                                                {size}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                <span className="text-sm font-medium">
                                    {tc.page} {safePage} {tc.of} {totalPages}
                                </span>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={safePage <= 1}
                                        onClick={() => setQuery(1, pageSize)}
                                    >
                                        <ChevronsLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={safePage <= 1}
                                        onClick={() =>
                                            setQuery(Math.max(1, safePage - 1), pageSize)
                                        }
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={safePage >= totalPages}
                                        onClick={() =>
                                            setQuery(
                                                Math.min(totalPages, safePage + 1),
                                                pageSize,
                                            )
                                        }
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={safePage >= totalPages}
                                        onClick={() => setQuery(totalPages, pageSize)}
                                    >
                                        <ChevronsRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            <Dialog open={formOpen} onOpenChange={closeForm}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>
                            {editingPolicy ? t.connectionLimitsEdit : t.connectionLimitsAdd}
                        </DialogTitle>
                        <DialogDescription>{t.connectionLimitsCapsHint}</DialogDescription>
                    </DialogHeader>

                    <Form {...form}>
                        <form onSubmit={onSubmit} className="space-y-5">
                            <FormField
                                control={form.control}
                                name="target"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <div className="space-y-1">
                                            <FormLabel>{t.connectionLimitsTarget}</FormLabel>
                                            <FormDescription>
                                                {t.connectionLimitsTargetHint}
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <RadioGroup
                                                value={field.value}
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    if (value === 'connection') {
                                                        form.setValue('userExternalId', '');
                                                        form.clearErrors('userExternalId');
                                                    }
                                                }}
                                                className="grid gap-2 sm:grid-cols-2"
                                            >
                                                <Label
                                                    htmlFor="limit-target-connection"
                                                    className={cn(
                                                        'hover:bg-muted/50 flex cursor-pointer flex-col gap-1 rounded-xl border p-3 font-normal transition-colors',
                                                        field.value === 'connection' &&
                                                            'border-primary bg-primary/5',
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <RadioGroupItem
                                                            id="limit-target-connection"
                                                            value="connection"
                                                        />
                                                        <span className="text-sm font-medium">
                                                            {t.connectionLimitsWholeConnection}
                                                        </span>
                                                    </div>
                                                    <span className="text-muted-foreground pl-6 text-xs leading-relaxed">
                                                        {t.connectionLimitsWholeConnectionHint}
                                                    </span>
                                                </Label>
                                                <Label
                                                    htmlFor="limit-target-user"
                                                    className={cn(
                                                        'hover:bg-muted/50 flex cursor-pointer flex-col gap-1 rounded-xl border p-3 font-normal transition-colors',
                                                        field.value === 'user' &&
                                                            'border-primary bg-primary/5',
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <RadioGroupItem
                                                            id="limit-target-user"
                                                            value="user"
                                                        />
                                                        <span className="text-sm font-medium">
                                                            {t.connectionLimitsProviderUser}
                                                        </span>
                                                    </div>
                                                    <span className="text-muted-foreground pl-6 text-xs leading-relaxed">
                                                        {t.connectionLimitsProviderUserHint}
                                                    </span>
                                                </Label>
                                            </RadioGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {target === 'user' ? (
                                <FormField
                                    control={form.control}
                                    name="userExternalId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.connectionLimitsProviderUser}</FormLabel>
                                            <SearchableSelect
                                                mode="single"
                                                value={field.value ?? ''}
                                                onValueChange={field.onChange}
                                                placeholder={
                                                    users.length === 0
                                                        ? t.connectionLimitsNoUsers
                                                        : t.connectionLimitsSelectUser
                                                }
                                                emptyText={t.connectionLimitsNoUsers}
                                                options={users.map((user) => ({
                                                    value: user.externalId,
                                                    label: user.label,
                                                }))}
                                            />
                                            <FormDescription>
                                                {t.connectionLimitsUserSyncHint}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}

                            <div className="space-y-3 rounded-xl border p-3 sm:p-4">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">{t.connectionLimitsCaps}</p>
                                    <p className="text-muted-foreground text-xs">
                                        {t.connectionLimitsCapsHint}
                                    </p>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="maxTokens"
                                        render={({ field }) => (
                                            <FormItem className="sm:col-span-2">
                                                <FormLabel>{t.connectionLimitsMaxTokens}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        inputMode="numeric"
                                                        placeholder={
                                                            t.connectionLimitsMaxTokensPlaceholder
                                                        }
                                                        {...field}
                                                        value={field.value ?? ''}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="maxCost"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.connectionLimitsMaxCost}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        inputMode="decimal"
                                                        placeholder={
                                                            t.connectionLimitsMaxCostPlaceholder
                                                        }
                                                        {...field}
                                                        value={field.value ?? ''}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="maxRequestsPerMinute"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.connectionLimitsMaxRpm}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        step={1}
                                                        inputMode="numeric"
                                                        placeholder={
                                                            t.connectionLimitsMaxRpmPlaceholder
                                                        }
                                                        {...field}
                                                        value={field.value ?? ''}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            <FormField
                                control={form.control}
                                name="onLimitAction"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t.connectionLimitsOnLimit}</FormLabel>
                                        <SearchableSelect
                                            mode="single"
                                            value={field.value}
                                            onValueChange={field.onChange}
                                            options={[
                                                { value: 'block', label: t.connectionLimitsActionBlock },
                                                { value: 'notify', label: t.connectionLimitsActionNotify },
                                                {
                                                    value: 'rate_limit',
                                                    label: t.connectionLimitsActionRateLimit,
                                                },
                                            ]}
                                        />
                                        <FormDescription>
                                            {t.connectionLimitsOnLimitHint}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => closeForm(false)}
                                >
                                    {tc.cancel}
                                </Button>
                                <Button type="submit" isLoading={pending}>
                                    {editingPolicy
                                        ? t.connectionLimitsSave
                                        : t.connectionLimitsAdd}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <ConfirmDeleteDialog
                open={Boolean(deletePolicy)}
                onOpenChange={(open) => {
                    if (!open) setDeletePolicy(null);
                }}
                title={t.connectionLimitsRemoveTitle}
                description={t.connectionLimitsDeleteDesc}
                resourceName={
                    deletePolicy
                        ? scopeLabel(deletePolicy)
                        : t.connectionLimitsWholeConnection
                }
                isConfirming={deleting}
                onConfirm={confirmDelete}
            />
        </div>
    );
}
