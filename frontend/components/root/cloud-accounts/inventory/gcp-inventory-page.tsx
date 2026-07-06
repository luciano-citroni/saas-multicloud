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

type Tab = 'compute' | 'networks' | 'subnetworks' | 'firewall' | 'storage' | 'sql' | 'iam' | 'gke';

type LoadState<T> = { status: 'idle' } | { status: 'loading' } | { status: 'success'; data: T[] } | { status: 'error'; message: string };

function formatDate(value: string | null | undefined) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

function normalizeItems<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    const p = payload as { items?: T[] } | null;
    if (p && Array.isArray(p.items)) return p.items;
    return [];
}

function EmptyState({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <AlertCircle className="size-8" />
            <span className="text-sm">Nenhum {label} encontrado. Execute um sync para popular o inventário.</span>
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
    if (data.length === 0) return <EmptyState label="VM" />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">Nome</TableHead>
                        <TableHead className="px-4 font-medium">Zona</TableHead>
                        <TableHead className="px-4 font-medium">Tipo de máquina</TableHead>
                        <TableHead className="px-4 font-medium">Status</TableHead>
                        <TableHead className="px-4 font-medium">IP interno</TableHead>
                        <TableHead className="px-4 font-medium">IP externo</TableHead>
                        <TableHead className="px-4 font-medium">Criado em</TableHead>
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
    if (data.length === 0) return <EmptyState label="VPC" />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">Nome</TableHead>
                        <TableHead className="px-4 font-medium">Modo de roteamento</TableHead>
                        <TableHead className="px-4 font-medium">Sub-redes automáticas</TableHead>
                        <TableHead className="px-4 font-medium">Criado em</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((net) => (
                        <TableRow key={net.id}>
                            <TableCell className="px-4 font-medium">{net.name}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{net.routingMode ?? '—'}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={net.autoCreateSubnetworks ? 'secondary' : 'outline'}>
                                    {net.autoCreateSubnetworks ? 'Sim' : 'Não'}
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
    if (data.length === 0) return <EmptyState label="sub-rede" />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">Nome</TableHead>
                        <TableHead className="px-4 font-medium">Região</TableHead>
                        <TableHead className="px-4 font-medium">CIDR</TableHead>
                        <TableHead className="px-4 font-medium">VPC</TableHead>
                        <TableHead className="px-4 font-medium">Acesso privado Google</TableHead>
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
                                    {sub.privateIpGoogleAccess ? 'Sim' : 'Não'}
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
    if (data.length === 0) return <EmptyState label="regra de firewall" />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">Nome</TableHead>
                        <TableHead className="px-4 font-medium">Direção</TableHead>
                        <TableHead className="px-4 font-medium">Prioridade</TableHead>
                        <TableHead className="px-4 font-medium">VPC</TableHead>
                        <TableHead className="px-4 font-medium">Status</TableHead>
                        <TableHead className="px-4 font-medium">Origens</TableHead>
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
                                <Badge variant={rule.disabled ? 'outline' : 'secondary'}>{rule.disabled ? 'Desabilitada' : 'Ativa'}</Badge>
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
    if (data.length === 0) return <EmptyState label="bucket" />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">Nome</TableHead>
                        <TableHead className="px-4 font-medium">Localização</TableHead>
                        <TableHead className="px-4 font-medium">Classe</TableHead>
                        <TableHead className="px-4 font-medium">Versionamento</TableHead>
                        <TableHead className="px-4 font-medium">Acesso público</TableHead>
                        <TableHead className="px-4 font-medium">Criado em</TableHead>
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
                                    {bucket.versioningEnabled ? 'Ativo' : 'Inativo'}
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
    if (data.length === 0) return <EmptyState label="instância SQL" />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">Nome</TableHead>
                        <TableHead className="px-4 font-medium">Versão</TableHead>
                        <TableHead className="px-4 font-medium">Região</TableHead>
                        <TableHead className="px-4 font-medium">Status</TableHead>
                        <TableHead className="px-4 font-medium">Tier</TableHead>
                        <TableHead className="px-4 font-medium">Backup</TableHead>
                        <TableHead className="px-4 font-medium">Disponibilidade</TableHead>
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
                                    {inst.backupEnabled ? 'Ativo' : 'Inativo'}
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
    if (data.length === 0) return <EmptyState label="service account" />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">E-mail</TableHead>
                        <TableHead className="px-4 font-medium">Nome</TableHead>
                        <TableHead className="px-4 font-medium">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((sa) => (
                        <TableRow key={sa.id}>
                            <TableCell className="px-4 font-mono text-xs font-medium">{sa.email}</TableCell>
                            <TableCell className="px-4 text-muted-foreground">{sa.displayName ?? '—'}</TableCell>
                            <TableCell className="px-4">
                                <Badge variant={sa.disabled ? 'outline' : 'secondary'}>{sa.disabled ? 'Desabilitada' : 'Ativa'}</Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function GkeTable({ data }: { data: GcpGkeCluster[] }) {
    if (data.length === 0) return <EmptyState label="cluster GKE" />;
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="px-4 font-medium">Nome</TableHead>
                        <TableHead className="px-4 font-medium">Localização</TableHead>
                        <TableHead className="px-4 font-medium">Status</TableHead>
                        <TableHead className="px-4 font-medium">Nós</TableHead>
                        <TableHead className="px-4 font-medium">Versão master</TableHead>
                        <TableHead className="px-4 font-medium">Criado em</TableHead>
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
                const parsed = JSON.parse(stored) as { id?: string };
                if (parsed?.id) setOrganizationId(parsed.id);
            } catch {
                // ignore
            }
        }
    }, []);

    const loadTab = useCallback(
        async (tab: Tab, orgId: string) => {
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

            const currentState = { compute, networks, subnetworks, firewall, storage, sql, iam, gke }[tab];
            if (currentState.status !== 'idle') return;

            setters[tab]({ status: 'loading' } as LoadState<never>);

            try {
                const fetchMap: Record<Tab, () => Promise<Response>> = {
                    compute: () => fetchGcpInstances(orgId, cloudAccountId),
                    networks: () => fetchGcpNetworks(orgId, cloudAccountId),
                    subnetworks: () => fetchGcpSubnetworks(orgId, cloudAccountId),
                    firewall: () => fetchGcpFirewallRules(orgId, cloudAccountId),
                    storage: () => fetchGcpBuckets(orgId, cloudAccountId),
                    sql: () => fetchGcpSqlInstances(orgId, cloudAccountId),
                    iam: () => fetchGcpServiceAccounts(orgId, cloudAccountId),
                    gke: () => fetchGcpGkeClusters(orgId, cloudAccountId),
                };

                const response = await fetchMap[tab]();
                const body = (await response.json().catch(() => null)) as unknown;

                if (!response.ok) {
                    const message = extractErrorMessage(body);
                    setters[tab]({ status: 'error', message } as LoadState<never>);
                    toast.error(message);
                    return;
                }

                setters[tab]({ status: 'success', data: normalizeItems(body) } as LoadState<never>);
            } catch {
                const message = 'Erro ao carregar recursos GCP';
                setters[tab]({ status: 'error', message } as LoadState<never>);
                toast.error(message);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [cloudAccountId, compute.status, networks.status, subnetworks.status, firewall.status, storage.status, sql.status, iam.status, gke.status]
    );

    useEffect(() => {
        if (organizationId) {
            void loadTab(activeTab, organizationId);
        }
    }, [organizationId, activeTab, loadTab]);

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
        const total = Math.ceil(filtered.length / pageSize) || 1;
        const paginated = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

        return (
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        value={nameFilter}
                        onChange={(e) => { setNameFilter(e.target.value); setPageIndex(0); }}
                        placeholder="Filtrar por nome..."
                        className="h-8 w-50"
                    />
                </div>
                {q !== '' && filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        Nenhum resultado para o filtro aplicado.
                    </div>
                ) : (
                    renderTable(paginated)
                )}
                {data.length > 0 && (
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
                            <span className="text-sm font-medium">Página {pageIndex + 1} de {total}</span>
                            <div className="flex items-center gap-1 self-start sm:self-auto">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(0)} disabled={pageIndex === 0}>
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex((p) => Math.max(p - 1, 0))} disabled={pageIndex === 0}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex((p) => Math.min(p + 1, total - 1))} disabled={pageIndex >= total - 1}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPageIndex(total - 1)} disabled={pageIndex >= total - 1}>
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
                    <p className="text-xs text-muted-foreground">Inventário de recursos GCP</p>
                </div>
                <div className="px-4 py-4">
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as Tab); setNameFilter(''); setPageIndex(0); }}>
                <TabsList className="flex-wrap h-auto gap-1">
                    <TabsTrigger value="compute" className="gap-1.5">
                        <Server className="size-3.5" />
                        Compute
                    </TabsTrigger>
                    <TabsTrigger value="networks" className="gap-1.5">
                        <Network className="size-3.5" />
                        VPCs
                    </TabsTrigger>
                    <TabsTrigger value="subnetworks" className="gap-1.5">
                        <Network className="size-3.5" />
                        Sub-redes
                    </TabsTrigger>
                    <TabsTrigger value="firewall" className="gap-1.5">
                        <Shield className="size-3.5" />
                        Firewall
                    </TabsTrigger>
                    <TabsTrigger value="storage" className="gap-1.5">
                        <HardDrive className="size-3.5" />
                        Storage
                    </TabsTrigger>
                    <TabsTrigger value="sql" className="gap-1.5">
                        <Database className="size-3.5" />
                        Cloud SQL
                    </TabsTrigger>
                    <TabsTrigger value="iam" className="gap-1.5">
                        <Shield className="size-3.5" />
                        IAM
                    </TabsTrigger>
                    <TabsTrigger value="gke" className="gap-1.5">
                        <Boxes className="size-3.5" />
                        GKE
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
