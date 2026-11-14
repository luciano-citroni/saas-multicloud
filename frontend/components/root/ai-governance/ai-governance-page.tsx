'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Gauge,
    KeyRound,
    MoreHorizontal,
    RefreshCw,
    Shield,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { extractErrorMessage } from '@/lib/error-messages';
import { supportsAiGatewayTokenLimits } from '@/lib/ai-gateway-limits';
import { useTranslations } from '@/lib/i18n';
import { toIntlLocale } from '@/lib/i18n/format';
import { cn } from '@/lib/utils';
import {
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import {
    deleteAiFinopsConnection,
    fetchAiFinopsConnectionSyncs,
    fetchAiFinopsConnections,
    fetchAiFinopsCostUsers,
    fetchAiFinopsPolicies,
    fetchAiFinopsProviders,
    syncAiFinopsConnection,
    syncAiFinopsCopilotSeats,
    testAiFinopsConnection,
} from '@/app/actions/ai-finops';
import { AiBudgetsPanel } from './ai-budgets-panel';
import { AiConnectionForm } from './ai-connection-form';
import {
    isConnectionBoundPolicy,
    type ConnectionLimitsPolicy,
} from './ai-connection-limits-page';

type Provider = { id: string; slug: string; name: string; capabilities: Record<string, boolean> };
type Connection = {
    id: string;
    name: string;
    providerSlug: string;
    status: string;
    statusMessage: string | null;
    lastSyncAt: string | null;
    lastSyncStatus?: string | null;
    modelsCount: number;
    maskedCredential: string | null;
    hasAdminAccess?: boolean;
};
type CostUser = { externalId: string; label: string };
type ConnectionSyncRun = {
    id: string;
    status: string;
    errorMessage?: string | null;
};

const CONNECTIONS_PAGE_SIZES = [5, 10, 20, 30] as const;
const GOVERNANCE_TABS = ['connections', 'limits'] as const;
type GovernanceTab = (typeof GOVERNANCE_TABS)[number];

const CAPABILITY_KEYS = [
    'validateCredentials',
    'listModels',
    'fetchUsage',
    'fetchCosts',
    'usageByUser',
    'syncHistorical',
] as const;

function asArray<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
        return (payload as { items: T[] }).items;
    }
    return [];
}

function statusBadgeVariant(status: string): 'secondary' | 'outline' | 'destructive' | 'default' {
    if (status === 'active') return 'secondary';
    if (status === 'partial' || status === 'pending') return 'outline';
    if (status === 'error') return 'destructive';
    return 'outline';
}

function parseTab(value: string | null): GovernanceTab {
    if (value === 'limits' || value === 'connections') return value;
    return 'connections';
}

function Panel({
    title,
    description,
    actions,
    children,
    className,
}: {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={cn('rounded-xl border', className)}>
            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h2 className="text-sm font-medium">{title}</h2>
                    {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            <div className="p-4">{children}</div>
        </section>
    );
}

function EmptyCopy({ children }: { children: React.ReactNode }) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{children}</p>;
}

export function AiGovernancePage() {
    const t = useTranslations('aiGovernance');
    const tf = useTranslations('finops');
    const tc = useTranslations('common');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const activeTab = parseTab(searchParams.get('tab'));

    const [tenantId, setTenantId] = useState<string | null>(null);
    const [midOrgId, setMidOrgId] = useState<string | null>(null);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [policies, setPolicies] = useState<ConnectionLimitsPolicy[]>([]);
    const [costUsers, setCostUsers] = useState<CostUser[]>([]);
    const [syncingById, setSyncingById] = useState<Record<string, string>>({});
    const [pending, startTransition] = useTransition();
    const syncingByIdRef = useRef(syncingById);
    syncingByIdRef.current = syncingById;
    const policiesCount = policies.length;
    const connectionsWithLimits = useMemo(() => {
        const ids = new Set<string>();
        for (const connection of connections) {
            if (policies.some((policy) => isConnectionBoundPolicy(policy, connection.id))) {
                ids.add(connection.id);
            }
        }
        return ids;
    }, [connections, policies]);

    const connectionsPageSize = useMemo(() => {
        const raw = Number(searchParams.get('connLimit') ?? '10');
        return CONNECTIONS_PAGE_SIZES.includes(raw as (typeof CONNECTIONS_PAGE_SIZES)[number])
            ? raw
            : 10;
    }, [searchParams]);
    const connectionsPage = useMemo(() => {
        const raw = Number(searchParams.get('connPage') ?? '1');
        return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
    }, [searchParams]);

    const providerNameBySlug = useMemo(
        () => new Map(providers.map((provider) => [provider.slug, provider.name])),
        [providers],
    );

    const connectionsTotalPages = Math.max(1, Math.ceil(connections.length / connectionsPageSize));
    const safeConnectionsPage = Math.min(connectionsPage, connectionsTotalPages);
    const pagedConnections = useMemo(() => {
        const start = (safeConnectionsPage - 1) * connectionsPageSize;
        return connections.slice(start, start + connectionsPageSize);
    }, [connections, connectionsPageSize, safeConnectionsPage]);

    const activeConnections = useMemo(
        () => connections.filter((c) => c.status === 'active' || c.status === 'partial').length,
        [connections],
    );

    const setQuery = (patch: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === '') params.delete(key);
            else params.set(key, value);
        }
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    const setTab = (tab: GovernanceTab) => setQuery({ tab });

    const setConnectionsQuery = (page: number, limit: number) => {
        setQuery({
            tab: 'connections',
            connPage: String(page),
            connLimit: String(limit),
        });
    };

    const statusLabel = (status: string) => {
        const key = status as keyof typeof t.connectionStatus;
        return t.connectionStatus[key] ?? status;
    };

    const formatSyncDate = (value: string | null) => {
        if (!value) return '—';
        return new Date(value).toLocaleString(toIntlLocale(), {
            dateStyle: 'short',
            timeStyle: 'short',
        });
    };

    const clearSyncing = useCallback((connectionId: string) => {
        setSyncingById((prev) => {
            if (!(connectionId in prev)) return prev;
            const next = { ...prev };
            delete next[connectionId];
            return next;
        });
    }, []);

    const markSyncing = useCallback((connectionId: string, syncRunId: string) => {
        setSyncingById((prev) => ({ ...prev, [connectionId]: syncRunId }));
    }, []);

    const refresh = useCallback((options?: { silent?: boolean }) => {
        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const mid = getActiveMidOrgId(orgId);
        setTenantId(orgId);
        setMidOrgId(mid);
        if (!orgId || !mid) return;

        const run = async () => {
            try {
                const [providersRes, connectionsRes, policiesRes, usersRes] = await Promise.all([
                    fetchAiFinopsProviders(orgId),
                    fetchAiFinopsConnections(orgId, mid),
                    fetchAiFinopsPolicies(orgId, mid),
                    fetchAiFinopsCostUsers(orgId, { midOrganizationId: mid }),
                ]);

                if (!providersRes.ok || !connectionsRes.ok) {
                    if (options?.silent) return;
                    const body = await (providersRes.ok ? connectionsRes : providersRes)
                        .json()
                        .catch(() => ({}));
                    toast.error(extractErrorMessage(body));
                    return;
                }

                setProviders(asArray<Provider>(await providersRes.json()));
                setConnections(asArray<Connection>(await connectionsRes.json()));
                setPolicies(
                    policiesRes.ok
                        ? asArray<ConnectionLimitsPolicy>(await policiesRes.json())
                        : [],
                );
                setCostUsers(usersRes.ok ? asArray<CostUser>(await usersRes.json()) : []);
            } catch {
                if (!options?.silent) toast.error(t.loadError);
            }
        };

        if (options?.silent) {
            void run();
            return;
        }
        startTransition(() => {
            void run();
        });
    }, [t.loadError]);

    const pollActiveSyncs = useCallback(async () => {
        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const current = syncingByIdRef.current;
        const entries = Object.entries(current);
        if (!orgId || entries.length === 0) return;

        let finished = false;
        for (const [connectionId, syncRunId] of entries) {
            try {
                const res = await fetchAiFinopsConnectionSyncs(orgId, connectionId);
                if (!res.ok) continue;
                const runs = asArray<ConnectionSyncRun>(await res.json());
                const run =
                    runs.find((item) => item.id === syncRunId) ??
                    runs.find((item) => item.status === 'pending' || item.status === 'running') ??
                    runs[0];
                if (!run) continue;
                if (run.status === 'pending' || run.status === 'running') continue;

                clearSyncing(connectionId);
                finished = true;
                if (run.status === 'failed') {
                    toast.error(run.errorMessage?.trim() || t.syncFailedToast);
                } else {
                    toast.success(t.syncComplete);
                }
            } catch {
                // keep polling
            }
        }

        if (finished) {
            refresh({ silent: true });
        }
    }, [clearSyncing, refresh, t.syncComplete, t.syncFailedToast]);

    useEffect(() => {
        refresh();
        const onChange = () => refresh();
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onChange);
        return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onChange);
    }, [refresh]);

    useEffect(() => {
        if (Object.keys(syncingById).length === 0) return;
        const timer = window.setInterval(() => {
            void pollActiveSyncs();
        }, 3000);
        void pollActiveSyncs();
        return () => window.clearInterval(timer);
    }, [pollActiveSyncs, syncingById]);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'budgets') {
            router.replace('/finops/budgets?kind=ai');
            return;
        }
        if (!tab || GOVERNANCE_TABS.includes(tab as GovernanceTab)) return;
        setTab('connections');
    }, [searchParams, router]);

    const header = (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
                <div className="text-muted-foreground flex items-center gap-2">
                    <Shield className="size-4" />
                    <span className="text-xs font-medium tracking-wide uppercase">{t.eyebrow}</span>
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-balance">{t.title}</h1>
                <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed text-pretty">
                    {t.subtitle}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" size="sm">
                    <Link href="/finops/budgets?kind=ai">{t.openAiBudgets}</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                    <Link href="/finops/ai">{t.openAiCosts}</Link>
                </Button>
                <Button variant="outline" size="sm" isLoading={pending} onClick={refresh}>
                    <RefreshCw className="size-3.5" />
                    {tc.refresh}
                </Button>
            </div>
        </div>
    );

    if (!tenantId || !midOrgId) {
        return (
            <div className="flex flex-col gap-6">
                {header}
                <div className="rounded-xl border px-4 py-12 text-center">
                    <p className="text-muted-foreground text-sm">{t.selectMidOrg}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-16">
            {header}

            <p className="text-muted-foreground border-border/60 bg-muted/20 rounded-xl border px-4 py-3 text-sm">
                {t.byokNote}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
                {[
                    { label: t.connections, value: connections.length, icon: KeyRound },
                    { label: t.kpiActiveConnections, value: activeConnections, icon: Check },
                    { label: t.tabLimits, value: policiesCount, icon: Gauge },
                ].map((kpi) => (
                    <div
                        key={kpi.label}
                        className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
                    >
                        <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                            <kpi.icon className="size-3.5" />
                            {kpi.label}
                        </div>
                        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                            {kpi.value}
                        </p>
                    </div>
                ))}
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setTab(parseTab(value))} className="gap-4">
                <TabsList className="bg-muted/40 h-auto w-full flex-wrap justify-start gap-1 p-1">
                    <TabsTrigger value="connections">{t.tabConnections}</TabsTrigger>
                    <TabsTrigger value="limits">{t.tabLimits}</TabsTrigger>
                </TabsList>

                <TabsContent value="connections" className="space-y-4">
                    <Panel title={t.capabilityMatrix} description={t.capabilityMatrixDesc}>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t.providers}</TableHead>
                                        {CAPABILITY_KEYS.map((key) => (
                                            <TableHead key={key} className="text-xs whitespace-nowrap">
                                                {t.capabilities[key]}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {providers.map((provider) => (
                                        <TableRow key={provider.id}>
                                            <TableCell className="font-medium">{provider.name}</TableCell>
                                            {CAPABILITY_KEYS.map((key) => {
                                                const on = Boolean(provider.capabilities?.[key]);
                                                return (
                                                    <TableCell key={key}>
                                                        <Badge
                                                            variant={on ? 'secondary' : 'outline'}
                                                            className="gap-1"
                                                        >
                                                            {on ? (
                                                                <Check className="size-3 text-emerald-600" />
                                                            ) : (
                                                                <X className="text-muted-foreground size-3" />
                                                            )}
                                                            {on ? tc.yes : tc.no}
                                                        </Badge>
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Panel>

                    <Panel title={t.addConnection} description={t.addConnectionDesc}>
                        <AiConnectionForm
                            tenantId={tenantId}
                            midOrgId={midOrgId}
                            providers={providers}
                            onSuccess={refresh}
                        />
                    </Panel>

                    <Panel title={t.connections} description={t.connectionsDesc}>
                        {connections.length === 0 ? (
                            <EmptyCopy>{t.noConnections}</EmptyCopy>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t.connectionName}</TableHead>
                                                <TableHead>{t.providers}</TableHead>
                                                <TableHead>{t.status}</TableHead>
                                                <TableHead>{t.adminAccess}</TableHead>
                                                <TableHead>{t.models}</TableHead>
                                                <TableHead>{t.lastSync}</TableHead>
                                                <TableHead className="w-12 pr-4 text-right">
                                                    {tc.actions}
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pagedConnections.map((connection) => (
                                                <TableRow key={connection.id}>
                                                    <TableCell>
                                                        {supportsAiGatewayTokenLimits(
                                                            connection.providerSlug,
                                                        ) ? (
                                                            <Link
                                                                href={`/ai-governance/connections/${connection.id}/limits`}
                                                                className="text-left"
                                                            >
                                                                <div className="hover:text-primary font-medium underline-offset-2 hover:underline">
                                                                    {connection.name}
                                                                </div>
                                                                <div className="text-muted-foreground text-xs">
                                                                    {t.credentialLabel}:{' '}
                                                                    {connection.maskedCredential ??
                                                                        '••••'}
                                                                </div>
                                                            </Link>
                                                        ) : (
                                                            <>
                                                                <div className="font-medium">
                                                                    {connection.name}
                                                                </div>
                                                                <div className="text-muted-foreground text-xs">
                                                                    {t.credentialLabel}:{' '}
                                                                    {connection.maskedCredential ??
                                                                        '••••'}
                                                                </div>
                                                            </>
                                                        )}
                                                        {connectionsWithLimits.has(connection.id) ? (
                                                            <Badge
                                                                variant="secondary"
                                                                className="mt-1"
                                                            >
                                                                {t.connectionHasLimits}
                                                            </Badge>
                                                        ) : null}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">
                                                            {providerNameBySlug.get(
                                                                connection.providerSlug,
                                                            ) ?? connection.providerSlug}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            {syncingById[connection.id] ? (
                                                                <Badge
                                                                    variant="default"
                                                                    className="inline-flex w-fit items-center gap-1"
                                                                >
                                                                    <RefreshCw className="size-3 animate-spin" />
                                                                    {t.syncing}
                                                                </Badge>
                                                            ) : (
                                                                <Badge
                                                                    variant={statusBadgeVariant(
                                                                        connection.status,
                                                                    )}
                                                                >
                                                                    {statusLabel(connection.status)}
                                                                </Badge>
                                                            )}
                                                            {!syncingById[connection.id] &&
                                                            connection.statusMessage ? (
                                                                <span className="text-muted-foreground max-w-xs text-xs">
                                                                    {connection.statusMessage}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {connection.hasAdminAccess ? (
                                                            <Badge variant="secondary">
                                                                {t.adminAccessBadge}
                                                            </Badge>
                                                        ) : (
                                                            <Badge
                                                                variant="outline"
                                                                className="text-muted-foreground"
                                                            >
                                                                {t.adminAccessNone}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="tabular-nums">
                                                        {connection.modelsCount}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {syncingById[connection.id] ? (
                                                            <Badge
                                                                variant="outline"
                                                                className="inline-flex items-center gap-1"
                                                            >
                                                                <RefreshCw className="size-3 animate-spin" />
                                                                {t.syncing}
                                                            </Badge>
                                                        ) : (
                                                            formatSyncDate(connection.lastSyncAt)
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="pr-4 text-right">
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
                                                                    onClick={() =>
                                                                        startTransition(async () => {
                                                                            const res =
                                                                                await testAiFinopsConnection(
                                                                                    tenantId,
                                                                                    connection.id,
                                                                                );
                                                                            const body = await res
                                                                                .json()
                                                                                .catch(() => ({}));
                                                                            if (!res.ok) {
                                                                                toast.error(
                                                                                    extractErrorMessage(
                                                                                        body,
                                                                                    ),
                                                                                );
                                                                                return;
                                                                            }
                                                                            toast.success(
                                                                                body.message ?? t.test,
                                                                            );
                                                                            refresh();
                                                                        })
                                                                    }
                                                                >
                                                                    {t.test}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    disabled={Boolean(
                                                                        syncingById[connection.id],
                                                                    )}
                                                                    onClick={() => {
                                                                        if (syncingById[connection.id]) {
                                                                            toast.info(t.alreadySyncing);
                                                                            return;
                                                                        }
                                                                        startTransition(async () => {
                                                                            const res =
                                                                                await syncAiFinopsConnection(
                                                                                    tenantId,
                                                                                    connection.id,
                                                                                );
                                                                            const body = await res
                                                                                .json()
                                                                                .catch(() => ({}));
                                                                            if (!res.ok) {
                                                                                toast.error(
                                                                                    extractErrorMessage(
                                                                                        body,
                                                                                    ),
                                                                                );
                                                                                return;
                                                                            }
                                                                            const syncRunId =
                                                                                typeof body?.id ===
                                                                                'string'
                                                                                    ? body.id
                                                                                    : `local-${connection.id}`;
                                                                            markSyncing(
                                                                                connection.id,
                                                                                syncRunId,
                                                                            );
                                                                            toast.success(t.synced);
                                                                            refresh({ silent: true });
                                                                        });
                                                                    }}
                                                                >
                                                                    {syncingById[connection.id] ? (
                                                                        <span className="inline-flex items-center gap-2">
                                                                            <RefreshCw className="size-3.5 animate-spin" />
                                                                            {t.syncing}
                                                                        </span>
                                                                    ) : (
                                                                        t.sync
                                                                    )}
                                                                </DropdownMenuItem>
                                                                {connection.providerSlug ===
                                                                'microsoft_copilot' ? (
                                                                    <DropdownMenuItem
                                                                        onClick={() =>
                                                                            startTransition(
                                                                                async () => {
                                                                                    const res =
                                                                                        await syncAiFinopsCopilotSeats(
                                                                                            tenantId,
                                                                                            connection.id,
                                                                                        );
                                                                                    const body =
                                                                                        await res
                                                                                            .json()
                                                                                            .catch(
                                                                                                () =>
                                                                                                    ({}),
                                                                                            );
                                                                                    if (!res.ok) {
                                                                                        toast.error(
                                                                                            extractErrorMessage(
                                                                                                body,
                                                                                            ),
                                                                                        );
                                                                                        return;
                                                                                    }
                                                                                    toast.success(
                                                                                        typeof body.message ===
                                                                                            'string' &&
                                                                                            body.message.trim()
                                                                                            ? body.message
                                                                                            : t.synced,
                                                                                    );
                                                                                    refresh();
                                                                                },
                                                                            )
                                                                        }
                                                                    >
                                                                        {t.syncSeats}
                                                                    </DropdownMenuItem>
                                                                ) : null}
                                                                {supportsAiGatewayTokenLimits(
                                                                    connection.providerSlug,
                                                                ) ? (
                                                                    <DropdownMenuItem
                                                                        onClick={() =>
                                                                            router.push(
                                                                                `/ai-governance/connections/${connection.id}/limits`,
                                                                            )
                                                                        }
                                                                    >
                                                                        {t.connectionLimitsAction}
                                                                    </DropdownMenuItem>
                                                                ) : null}
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    variant="destructive"
                                                                    onClick={() =>
                                                                        startTransition(async () => {
                                                                            const res =
                                                                                await deleteAiFinopsConnection(
                                                                                    tenantId,
                                                                                    connection.id,
                                                                                );
                                                                            if (!res.ok) {
                                                                                const body =
                                                                                    await res
                                                                                        .json()
                                                                                        .catch(
                                                                                            () =>
                                                                                                ({}),
                                                                                        );
                                                                                toast.error(
                                                                                    extractErrorMessage(
                                                                                        body,
                                                                                    ),
                                                                                );
                                                                                return;
                                                                            }
                                                                            toast.success(
                                                                                t.connectionRemoved,
                                                                            );
                                                                            refresh();
                                                                        })
                                                                    }
                                                                >
                                                                    {t.remove}
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
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
                                            value={`${connectionsPageSize}`}
                                            onValueChange={(value) =>
                                                setConnectionsQuery(1, Number(value))
                                            }
                                        >
                                            <SelectTrigger className="h-8 min-w-22">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent
                                                collisionPadding={{ bottom: 96, right: 24 }}
                                            >
                                                {CONNECTIONS_PAGE_SIZES.map((size) => (
                                                    <SelectItem key={size} value={`${size}`}>
                                                        {size}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                        <span className="text-sm font-medium">
                                            {tc.page} {safeConnectionsPage} {tc.of}{' '}
                                            {connectionsTotalPages}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                disabled={safeConnectionsPage <= 1}
                                                onClick={() =>
                                                    setConnectionsQuery(1, connectionsPageSize)
                                                }
                                            >
                                                <ChevronsLeft className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                disabled={safeConnectionsPage <= 1}
                                                onClick={() =>
                                                    setConnectionsQuery(
                                                        Math.max(1, safeConnectionsPage - 1),
                                                        connectionsPageSize,
                                                    )
                                                }
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                disabled={
                                                    safeConnectionsPage >= connectionsTotalPages
                                                }
                                                onClick={() =>
                                                    setConnectionsQuery(
                                                        Math.min(
                                                            connectionsTotalPages,
                                                            safeConnectionsPage + 1,
                                                        ),
                                                        connectionsPageSize,
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
                                                disabled={
                                                    safeConnectionsPage >= connectionsTotalPages
                                                }
                                                onClick={() =>
                                                    setConnectionsQuery(
                                                        connectionsTotalPages,
                                                        connectionsPageSize,
                                                    )
                                                }
                                            >
                                                <ChevronsRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Panel>
                </TabsContent>

                <TabsContent value="limits" className="space-y-4">
                    <Panel title={t.tabLimits} description={t.limitsTabDesc}>
                        <AiBudgetsPanel
                            tenantId={tenantId}
                            midOrgId={midOrgId}
                            budgets={[]}
                            connections={connections}
                            costUsers={costUsers}
                            onChanged={refresh}
                            mode="policies"
                        />
                    </Panel>
                    <p className="text-muted-foreground text-xs">
                        {tf.aiPoliciesGatewayNote}{' '}
                        <Link href="/finops/budgets?kind=ai" className="underline underline-offset-2">
                            {t.openAiBudgets}
                        </Link>
                        {' · '}
                        <Link href="/finops/ai" className="underline underline-offset-2">
                            {t.openAiCosts}
                        </Link>
                    </p>
                </TabsContent>
            </Tabs>
        </div>
    );
}
