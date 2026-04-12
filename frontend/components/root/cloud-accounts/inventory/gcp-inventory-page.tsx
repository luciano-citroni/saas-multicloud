'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { AlertCircle, Server, Network, HardDrive, Database, Shield, Boxes } from 'lucide-react';

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
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead>Tipo de máquina</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP interno</TableHead>
                    <TableHead>IP externo</TableHead>
                    <TableHead>Criado em</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((vm) => (
                    <TableRow key={vm.id}>
                        <TableCell className="font-medium">{vm.name}</TableCell>
                        <TableCell className="text-muted-foreground">{vm.zone}</TableCell>
                        <TableCell className="text-muted-foreground">{vm.machineType}</TableCell>
                        <TableCell>
                            <Badge variant={vm.status === 'RUNNING' ? 'secondary' : 'outline'}>{vm.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{vm.networkIp ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{vm.externalIp ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(vm.creationTimestamp)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function NetworksTable({ data }: { data: GcpVpcNetwork[] }) {
    if (data.length === 0) return <EmptyState label="VPC" />;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Modo de roteamento</TableHead>
                    <TableHead>Sub-redes automáticas</TableHead>
                    <TableHead>Criado em</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((net) => (
                    <TableRow key={net.id}>
                        <TableCell className="font-medium">{net.name}</TableCell>
                        <TableCell className="text-muted-foreground">{net.routingMode ?? '—'}</TableCell>
                        <TableCell>
                            <Badge variant={net.autoCreateSubnetworks ? 'secondary' : 'outline'}>
                                {net.autoCreateSubnetworks ? 'Sim' : 'Não'}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(net.creationTimestamp)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function SubnetworksTable({ data }: { data: GcpSubnetwork[] }) {
    if (data.length === 0) return <EmptyState label="sub-rede" />;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Região</TableHead>
                    <TableHead>CIDR</TableHead>
                    <TableHead>VPC</TableHead>
                    <TableHead>Acesso privado Google</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((sub) => (
                    <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.name}</TableCell>
                        <TableCell className="text-muted-foreground">{sub.region}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{sub.ipCidrRange}</TableCell>
                        <TableCell className="text-muted-foreground">{sub.networkName ?? '—'}</TableCell>
                        <TableCell>
                            <Badge variant={sub.privateIpGoogleAccess ? 'secondary' : 'outline'}>
                                {sub.privateIpGoogleAccess ? 'Sim' : 'Não'}
                            </Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function FirewallTable({ data }: { data: GcpFirewallRule[] }) {
    if (data.length === 0) return <EmptyState label="regra de firewall" />;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Direção</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>VPC</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Origens</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((rule) => (
                    <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                            <Badge variant={rule.direction === 'INGRESS' ? 'default' : 'outline'}>{rule.direction}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{rule.priority}</TableCell>
                        <TableCell className="text-muted-foreground">{rule.networkName ?? '—'}</TableCell>
                        <TableCell>
                            <Badge variant={rule.disabled ? 'outline' : 'secondary'}>{rule.disabled ? 'Desabilitada' : 'Ativa'}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                            {rule.sourceRanges?.slice(0, 2).join(', ') ?? '—'}
                            {(rule.sourceRanges?.length ?? 0) > 2 && ` +${(rule.sourceRanges?.length ?? 0) - 2}`}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function StorageTable({ data }: { data: GcpStorageBucket[] }) {
    if (data.length === 0) return <EmptyState label="bucket" />;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Versionamento</TableHead>
                    <TableHead>Acesso público</TableHead>
                    <TableHead>Criado em</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((bucket) => (
                    <TableRow key={bucket.id}>
                        <TableCell className="font-medium">{bucket.name}</TableCell>
                        <TableCell className="text-muted-foreground">{bucket.location}</TableCell>
                        <TableCell className="text-muted-foreground">{bucket.storageClass}</TableCell>
                        <TableCell>
                            <Badge variant={bucket.versioningEnabled ? 'secondary' : 'outline'}>
                                {bucket.versioningEnabled ? 'Ativo' : 'Inativo'}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{bucket.publicAccessPrevention ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(bucket.timeCreated)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function SqlTable({ data }: { data: GcpSqlInstance[] }) {
    if (data.length === 0) return <EmptyState label="instância SQL" />;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Versão</TableHead>
                    <TableHead>Região</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Backup</TableHead>
                    <TableHead>Disponibilidade</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((inst) => (
                    <TableRow key={inst.id}>
                        <TableCell className="font-medium">{inst.name}</TableCell>
                        <TableCell className="text-muted-foreground">{inst.databaseVersion}</TableCell>
                        <TableCell className="text-muted-foreground">{inst.region}</TableCell>
                        <TableCell>
                            <Badge variant={inst.state === 'RUNNABLE' ? 'secondary' : 'outline'}>{inst.state}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{inst.tier ?? '—'}</TableCell>
                        <TableCell>
                            <Badge variant={inst.backupEnabled ? 'secondary' : 'outline'}>
                                {inst.backupEnabled ? 'Ativo' : 'Inativo'}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{inst.availabilityType ?? '—'}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function IamTable({ data }: { data: GcpServiceAccount[] }) {
    if (data.length === 0) return <EmptyState label="service account" />;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((sa) => (
                    <TableRow key={sa.id}>
                        <TableCell className="font-medium font-mono text-xs">{sa.email}</TableCell>
                        <TableCell className="text-muted-foreground">{sa.displayName ?? '—'}</TableCell>
                        <TableCell>
                            <Badge variant={sa.disabled ? 'outline' : 'secondary'}>{sa.disabled ? 'Desabilitada' : 'Ativa'}</Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function GkeTable({ data }: { data: GcpGkeCluster[] }) {
    if (data.length === 0) return <EmptyState label="cluster GKE" />;
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Nós</TableHead>
                    <TableHead>Versão master</TableHead>
                    <TableHead>Criado em</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((cluster) => (
                    <TableRow key={cluster.id}>
                        <TableCell className="font-medium">{cluster.name}</TableCell>
                        <TableCell className="text-muted-foreground">{cluster.location}</TableCell>
                        <TableCell>
                            <Badge variant={cluster.status === 'RUNNING' ? 'secondary' : 'outline'}>{cluster.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{cluster.nodeCount ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{cluster.currentMasterVersion ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(cluster.createTime)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

type GcpInventoryPageProps = {
    cloudAccountId: string;
    accountAlias: string;
};

export function GcpInventoryPage({ cloudAccountId, accountAlias }: GcpInventoryPageProps) {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('compute');

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
                    const message = extractErrorMessage(body, 'pt');
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

    function renderTabContent<T>(state: LoadState<T>, renderTable: (data: T[]) => React.ReactNode) {
        if (state.status === 'loading' || state.status === 'idle') return <LoadingSkeleton />;
        if (state.status === 'error') {
            return (
                <div className="flex items-center gap-2 py-8 text-destructive">
                    <AlertCircle className="size-4" />
                    <span className="text-sm">{state.message}</span>
                </div>
            );
        }
        return renderTable(state.data);
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{accountAlias}</h1>
                <p className="text-muted-foreground text-sm mt-1">Inventário de recursos GCP</p>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
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
                    {renderTabContent(compute, (data) => <ComputeTable data={data as GcpVmInstance[]} />)}
                </TabsContent>

                <TabsContent value="networks" className="mt-4">
                    {renderTabContent(networks, (data) => <NetworksTable data={data as GcpVpcNetwork[]} />)}
                </TabsContent>

                <TabsContent value="subnetworks" className="mt-4">
                    {renderTabContent(subnetworks, (data) => <SubnetworksTable data={data as GcpSubnetwork[]} />)}
                </TabsContent>

                <TabsContent value="firewall" className="mt-4">
                    {renderTabContent(firewall, (data) => <FirewallTable data={data as GcpFirewallRule[]} />)}
                </TabsContent>

                <TabsContent value="storage" className="mt-4">
                    {renderTabContent(storage, (data) => <StorageTable data={data as GcpStorageBucket[]} />)}
                </TabsContent>

                <TabsContent value="sql" className="mt-4">
                    {renderTabContent(sql, (data) => <SqlTable data={data as GcpSqlInstance[]} />)}
                </TabsContent>

                <TabsContent value="iam" className="mt-4">
                    {renderTabContent(iam, (data) => <IamTable data={data as GcpServiceAccount[]} />)}
                </TabsContent>

                <TabsContent value="gke" className="mt-4">
                    {renderTabContent(gke, (data) => <GkeTable data={data as GcpGkeCluster[]} />)}
                </TabsContent>
            </Tabs>
        </div>
    );
}
