'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import {
    fetchGcpInstances,
    fetchGcpNetworks,
    fetchGcpSubnetworks,
    fetchGcpFirewallRules,
    fetchGcpBuckets,
    fetchGcpSqlInstances,
    fetchGcpServiceAccounts,
    fetchGcpGkeClusters,
    type GcpVmInstance,
    type GcpVpcNetwork,
    type GcpSubnetwork,
    type GcpFirewallRule,
    type GcpStorageBucket,
    type GcpSqlInstance,
    type GcpServiceAccount,
    type GcpGkeCluster,
} from '@/app/actions/gcp-inventory';
import { AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Server, Network, HardDrive, Database, Shield, Boxes } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { toIntlLocale } from '@/lib/i18n/format';

type Tab = 'compute' | 'networks' | 'subnetworks' | 'firewall' | 'storage' | 'sql' | 'iam' | 'gke';

type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

type LoadState<T> =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; data: T[]; pagination: PaginationMeta | null }
    | { status: 'error'; message: string };

function normalizePagination(payload: unknown): PaginationMeta | null {
    if (!payload || typeof payload !== 'object') return null;
    const pagination = (payload as { pagination?: Record<string, unknown> }).pagination;
    if (!pagination) return null;
    const page = Number(pagination.page);
    const limit = Number(pagination.limit);
    const totalItems = Number(pagination.totalItems);
    const totalPages = Number(pagination.totalPages);
    if (![page, limit, totalItems, totalPages].every((value) => Number.isFinite(value))) return null;
    return {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: pagination.hasNextPage === true,
        hasPreviousPage: pagination.hasPreviousPage === true,
    };
}

function formatDate(value: string | null | undefined) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(toIntlLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

function normalizeItems<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    const p = payload as { items?: T[] } | null;
    if (p && Array.isArray(p.items)) return p.items;
    return [];
}

function EmptyState({ label }: { label: string }) {
    const tgi = useTranslations('gcpInventory');
    return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <AlertCircle className="size-8" />
            <span className="text-sm">{tgi.emptyState.replace('{label}', label)}</span>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
            ))}
        </div>
    );
}

function ComputeTable({ data }: { data: GcpVmInstance[] }) {
    const tgi = useTranslations('gcpInventory');
    const tc = useTranslations('common');
    if (data.length === 0) return <EmptyState label={tgi.labelVm} />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colZone}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colMachineType}</TableHead>
                        <TableHead className="px-4 font-medium">{tc.status}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colInternalIp}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colExternalIp}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colCreatedAt}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((vm) => (
                        <TableRow key={vm.id}>
                            <TableCell className="px-4 font-medium">{vm.name}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{vm.zone}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{vm.machineType}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={vm.status === 'RUNNING' ? 'secondary' : 'outline'}>{vm.status}</Badge>
                            </TableCell>
                            <TableCell className="px-4 text-muted-foreground">{vm.networkIp ?? '—'}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{vm.externalIp ?? '—'}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{formatDate(vm.creationTimestamp)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function NetworksTable({ data }: { data: GcpVpcNetwork[] }) {
    const tgi = useTranslations('gcpInventory');
    const tc = useTranslations('common');
    if (data.length === 0) return <EmptyState label={tgi.labelVpc} />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colRoutingMode}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colAutoSubnets}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colCreatedAt}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((net) => (
                        <TableRow key={net.id}>
                            <TableCell className="px-4 font-medium">{net.name}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{net.routingMode ?? '—'}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={net.autoCreateSubnetworks ? 'secondary' : 'outline'}>
                                    {net.autoCreateSubnetworks ? tc.yes : tc.no}
                                </Badge>
                            </TableCell>
                            <TableCell className="px-4 text-muted-foreground">{formatDate(net.creationTimestamp)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function SubnetworksTable({ data }: { data: GcpSubnetwork[] }) {
    const tgi = useTranslations('gcpInventory');
    const tc = useTranslations('common');
    if (data.length === 0) return <EmptyState label={tgi.labelSubnetwork} />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colRegion}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colCidr}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colVpc}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colPrivateGoogleAccess}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((sub) => (
                        <TableRow key={sub.id}>
                            <TableCell className="px-4 font-medium">{sub.name}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{sub.region}</TableCell>
                            <TableCell className="px-4 font-mono text-xs text-muted-foreground">{sub.ipCidrRange}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{sub.networkName ?? '—'}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={sub.privateIpGoogleAccess ? 'secondary' : 'outline'}>
                                    {sub.privateIpGoogleAccess ? tc.yes : tc.no}
                                </Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function FirewallTable({ data }: { data: GcpFirewallRule[] }) {
    const tgi = useTranslations('gcpInventory');
    const tc = useTranslations('common');
    if (data.length === 0) return <EmptyState label={tgi.labelFirewall} />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colDirection}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colPriority}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colVpc}</TableHead>
                        <TableHead className="px-4 font-medium">{tc.status}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colSources}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((rule) => (
                        <TableRow key={rule.id}>
                            <TableCell className="px-4 font-medium">{rule.name}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={rule.direction === 'INGRESS' ? 'default' : 'outline'}>{rule.direction}</Badge>
                            </TableCell>
                            <TableCell className="px-4 text-muted-foreground">{rule.priority}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{rule.networkName ?? '—'}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={rule.disabled ? 'outline' : 'secondary'}>{rule.disabled ? tgi.ruleDisabled : tgi.ruleActive}</Badge>
                            </TableCell>
                            <TableCell className="px-4 font-mono text-xs text-muted-foreground">
                                {rule.sourceRanges?.slice(0, 2).join(', ') ?? '—'}
                                {(rule.sourceRanges?.length ?? 0) > 2 && ` +${(rule.sourceRanges?.length ?? 0) - 2}`}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function StorageTable({ data }: { data: GcpStorageBucket[] }) {
    const tgi = useTranslations('gcpInventory');
    const tc = useTranslations('common');
    if (data.length === 0) return <EmptyState label={tgi.labelBucket} />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colLocation}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colClass}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colVersioning}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colPublicAccess}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colCreatedAt}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((bucket) => (
                        <TableRow key={bucket.id}>
                            <TableCell className="px-4 font-medium">{bucket.name}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{bucket.location}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{bucket.storageClass}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={bucket.versioningEnabled ? 'secondary' : 'outline'}>
                                    {bucket.versioningEnabled ? tgi.enabled : tgi.disabled}
                                </Badge>
                            </TableCell>
                            <TableCell className="px-4 text-muted-foreground">{bucket.publicAccessPrevention ?? '—'}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{formatDate(bucket.timeCreated)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function SqlTable({ data }: { data: GcpSqlInstance[] }) {
    const tgi = useTranslations('gcpInventory');
    const tc = useTranslations('common');
    if (data.length === 0) return <EmptyState label={tgi.labelSql} />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colVersion}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colRegion}</TableHead>
                        <TableHead className="px-4 font-medium">{tc.status}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colTier}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colBackup}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colAvailability}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((inst) => (
                        <TableRow key={inst.id}>
                            <TableCell className="px-4 font-medium">{inst.name}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{inst.databaseVersion}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{inst.region}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={inst.state === 'RUNNABLE' ? 'secondary' : 'outline'}>{inst.state}</Badge>
                            </TableCell>
                            <TableCell className="px-4 text-muted-foreground">{inst.tier ?? '—'}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={inst.backupEnabled ? 'secondary' : 'outline'}>
                                    {inst.backupEnabled ? tgi.enabled : tgi.disabled}
                                </Badge>
                            </TableCell>
                            <TableCell className="px-4 text-muted-foreground">{inst.availabilityType ?? '—'}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function IamTable({ data }: { data: GcpServiceAccount[] }) {
    const tgi = useTranslations('gcpInventory');
    const tc = useTranslations('common');
    if (data.length === 0) return <EmptyState label={tgi.labelServiceAccount} />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">{tc.email}</TableHead>
                        <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                        <TableHead className="px-4 font-medium">{tc.status}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((sa) => (
                        <TableRow key={sa.id}>
                            <TableCell className="px-4 font-mono text-xs font-medium">{sa.email}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{sa.displayName ?? '—'}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={sa.disabled ? 'outline' : 'secondary'}>{sa.disabled ? tgi.ruleDisabled : tgi.ruleActive}</Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function GkeTable({ data }: { data: GcpGkeCluster[] }) {
    const tgi = useTranslations('gcpInventory');
    const tc = useTranslations('common');
    if (data.length === 0) return <EmptyState label={tgi.labelGke} />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colLocation}</TableHead>
                        <TableHead className="px-4 font-medium">{tc.status}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colNodes}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colMasterVersion}</TableHead>
                        <TableHead className="px-4 font-medium">{tgi.colCreatedAt}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((cluster) => (
                        <TableRow key={cluster.id}>
                            <TableCell className="px-4 font-medium">{cluster.name}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{cluster.location}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={cluster.status === 'RUNNING' ? 'secondary' : 'outline'}>{cluster.status}</Badge>
                            </TableCell>
                            <TableCell className="px-4 text-muted-foreground">{cluster.nodeCount ?? '—'}</TableCell>
                            <TableCell className="px-4 font-mono text-xs text-muted-foreground">{cluster.currentMasterVersion ?? '—'}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{formatDate(cluster.createTime)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

type GcpInventoryPageProps = {
    cloudAccountId: string;
    accountAlias: string;
};

export function GcpInventoryPage({ cloudAccountId, accountAlias }: GcpInventoryPageProps) {
    const tgi = useTranslations('gcpInventory');
    const tc = useTranslations('common');
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('compute');
    const [nameFilter, setNameFilter] = useState('');
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    const [compute, setCompute] = useState<LoadState<GcpVmInstance>>({ status: 'idle' });
    const [networks, setNetworks] = useState<LoadState<GcpVpcNetwork>>({ status: 'idle' });
    const [subnetworks, setSubnetworks] = useState<LoadState<GcpSubnetwork>>({ status: 'idle' });
    const [firewall, setFirewall] = useState<LoadState<GcpFirewallRule>>({ status: 'idle' });
    const [storage, setStorage] = useState<LoadState<GcpStorageBucket>>({ status: 'idle' });
    const [sql, setSql] = useState<LoadState<GcpSqlInstance>>({ status: 'idle' });
    const [iam, setIam] = useState<LoadState<GcpServiceAccount>>({ status: 'idle' });
    const [gke, setGke] = useState<LoadState<GcpGkeCluster>>({ status: 'idle' });

    useEffect(() => {
        const stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as { id?: string } | string;
                if (typeof parsed === 'string') {
                    setOrganizationId(parsed);
                } else if (parsed?.id) {
                    setOrganizationId(parsed.id);
                }
            } catch {
                setOrganizationId(stored);
            }
        }
    }, []);

    const loadTab = useCallback(
        async (tab: Tab, orgId: string, page: number, limit: number) => {
            const setters: Record<Tab, (s: LoadState<never>) => void> = {
                compute: setCompute as (s: LoadState<never>) => void,
                networks: setNetworks as (s: LoadState<never>) => void,
                subnetworks: setSubnetworks as (s: LoadState<never>) => void,
                firewall: setFirewall as (s: LoadState<never>) => void,
                storage: setStorage as (s: LoadState<never>) => void,
                sql: setSql as (s: LoadState<never>) => void,
                iam: setIam as (s: LoadState<never>) => void,
                gke: setGke as (s: LoadState<never>) => void,
            };

            setters[tab]({ status: 'loading' } as LoadState<never>);

            try {
                const options = { page, limit };
                const fetchMap: Record<Tab, () => Promise<Response>> = {
                    compute: () => fetchGcpInstances(orgId, cloudAccountId, options),
                    networks: () => fetchGcpNetworks(orgId, cloudAccountId, options),
                    subnetworks: () => fetchGcpSubnetworks(orgId, cloudAccountId, options),
                    firewall: () => fetchGcpFirewallRules(orgId, cloudAccountId, options),
                    storage: () => fetchGcpBuckets(orgId, cloudAccountId, options),
                    sql: () => fetchGcpSqlInstances(orgId, cloudAccountId, options),
                    iam: () => fetchGcpServiceAccounts(orgId, cloudAccountId, options),
                    gke: () => fetchGcpGkeClusters(orgId, cloudAccountId, options),
                };

                const response = await fetchMap[tab]();
                const body = (await response.json().catch(() => null)) as unknown;

                if (!response.ok) {
                    const message = extractErrorMessage(body);
                    setters[tab]({ status: 'error', message } as LoadState<never>);
                    toast.error(message);
                    return;
                }

                setters[tab]({
                    status: 'success',
                    data: normalizeItems(body),
                    pagination: normalizePagination(body),
                } as LoadState<never>);
            } catch {
                const message = tgi.loadError;
                setters[tab]({ status: 'error', message } as LoadState<never>);
                toast.error(message);
            }
        },
        [cloudAccountId, tgi.loadError]
    );

    useEffect(() => {
        if (organizationId) {
            void loadTab(activeTab, organizationId, pageIndex + 1, pageSize);
        }
    }, [organizationId, activeTab, pageIndex, pageSize, loadTab]);

    function renderTabContent<T>(state: LoadState<T>, getName: (item: T) => string, renderTable: (data: T[]) => React.ReactNode) {
        if (state.status === 'loading' || state.status === 'idle') return <LoadingSkeleton />;
        if (state.status === 'error') {
            return (
                <div className="flex items-center gap-2 py-8 text-destructive">
                    <AlertCircle className="size-4" />
                    <span className="text-sm">{state.message}</span>
                </div>
            );
        }
        const data = state.data;
        const q = nameFilter.trim().toLowerCase();
        const filtered = q ? data.filter((item) => getName(item).toLowerCase().includes(q)) : data;
        const totalPages = Math.max(1, state.pagination?.totalPages ?? 1);
        const totalItems = state.pagination?.totalItems ?? data.length;

        return (
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        value={nameFilter}
                        onChange={(e) => { setNameFilter(e.target.value); }}
                        placeholder={tgi.filterPlaceholder}
                        className="h-8 w-50"
                    />
                </div>
                {q !== '' && filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        {tgi.noFilterResults}
                    </div>
                ) : (
                    renderTable(filtered)
                )}
                {totalItems > 0 && (
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
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">{accountAlias}</p>
                    <p className="text-xs text-muted-foreground">{tgi.title}</p>
                </div>
                <div className="px-4 py-4">
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as Tab); setNameFilter(''); setPageIndex(0); }}>
                <TabsList className="flex-wrap h-auto gap-1">
                    <TabsTrigger value="compute" className="gap-1.5">
                        <Server className="size-3.5" />
                        {tgi.tabCompute}
                    </TabsTrigger>
                    <TabsTrigger value="networks" className="gap-1.5">
                        <Network className="size-3.5" />
                        {tgi.tabNetworks}
                    </TabsTrigger>
                    <TabsTrigger value="subnetworks" className="gap-1.5">
                        <Network className="size-3.5" />
                        {tgi.tabSubnetworks}
                    </TabsTrigger>
                    <TabsTrigger value="firewall" className="gap-1.5">
                        <Shield className="size-3.5" />
                        {tgi.tabFirewall}
                    </TabsTrigger>
                    <TabsTrigger value="storage" className="gap-1.5">
                        <HardDrive className="size-3.5" />
                        {tgi.tabStorage}
                    </TabsTrigger>
                    <TabsTrigger value="sql" className="gap-1.5">
                        <Database className="size-3.5" />
                        {tgi.tabSql}
                    </TabsTrigger>
                    <TabsTrigger value="iam" className="gap-1.5">
                        <Shield className="size-3.5" />
                        {tgi.tabIam}
                    </TabsTrigger>
                    <TabsTrigger value="gke" className="gap-1.5">
                        <Boxes className="size-3.5" />
                        {tgi.tabGke}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="compute" className="mt-4">
                    {renderTabContent(compute, (item: GcpVmInstance) => item.name, (data) => <ComputeTable data={data as GcpVmInstance[]} />)}
                </TabsContent>

                <TabsContent value="networks" className="mt-4">
                    {renderTabContent(networks, (item: GcpVpcNetwork) => item.name, (data) => <NetworksTable data={data as GcpVpcNetwork[]} />)}
                </TabsContent>

                <TabsContent value="subnetworks" className="mt-4">
                    {renderTabContent(subnetworks, (item: GcpSubnetwork) => item.name, (data) => <SubnetworksTable data={data as GcpSubnetwork[]} />)}
                </TabsContent>

                <TabsContent value="firewall" className="mt-4">
                    {renderTabContent(firewall, (item: GcpFirewallRule) => item.name, (data) => <FirewallTable data={data as GcpFirewallRule[]} />)}
                </TabsContent>

                <TabsContent value="storage" className="mt-4">
                    {renderTabContent(storage, (item: GcpStorageBucket) => item.name, (data) => <StorageTable data={data as GcpStorageBucket[]} />)}
                </TabsContent>

                <TabsContent value="sql" className="mt-4">
                    {renderTabContent(sql, (item: GcpSqlInstance) => item.name, (data) => <SqlTable data={data as GcpSqlInstance[]} />)}
                </TabsContent>

                <TabsContent value="iam" className="mt-4">
                    {renderTabContent(iam, (item: GcpServiceAccount) => item.email, (data) => <IamTable data={data as GcpServiceAccount[]} />)}
                </TabsContent>

                <TabsContent value="gke" className="mt-4">
                    {renderTabContent(gke, (item: GcpGkeCluster) => item.name, (data) => <GkeTable data={data as GcpGkeCluster[]} />)}
                </TabsContent>
            </Tabs>
                </div>
            </div>
        </div>
    );
}
