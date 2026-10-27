'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Key, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const OS_PRESETS = [
    { id: 'amazon-linux-2023', label: 'Amazon Linux 2023', short: 'AL2023', color: 'bg-orange-500' },
    { id: 'ubuntu-24.04', label: 'Ubuntu 24.04 LTS', short: 'Ubuntu 24', color: 'bg-orange-600' },
    { id: 'ubuntu-22.04', label: 'Ubuntu 22.04 LTS', short: 'Ubuntu 22', color: 'bg-orange-600' },
    { id: 'ubuntu-20.04', label: 'Ubuntu 20.04 LTS', short: 'Ubuntu 20', color: 'bg-orange-700' },
    { id: 'windows-2022', label: 'Windows Server 2022', short: 'Win 2022', color: 'bg-blue-600' },
    { id: 'windows-2019', label: 'Windows Server 2019', short: 'Win 2019', color: 'bg-blue-700' },
    { id: 'rhel-9', label: 'Red Hat Enterprise Linux 9', short: 'RHEL 9', color: 'bg-red-600' },
    { id: 'debian-12', label: 'Debian 12 (Bookworm)', short: 'Debian 12', color: 'bg-red-800' },
] as const;

const INSTANCE_TYPE_GROUPS = [
    {
        label: 'General Purpose — T series (burstable)',
        types: ['t3.nano', 't3.micro', 't3.small', 't3.medium', 't3.large', 't3.xlarge', 't3.2xlarge', 't3a.nano', 't3a.micro', 't3a.small', 't3a.medium', 't3a.large', 't2.micro', 't2.small', 't2.medium'],
    },
    {
        label: 'General Purpose — M series',
        types: ['m5.large', 'm5.xlarge', 'm5.2xlarge', 'm5.4xlarge', 'm5.8xlarge', 'm6i.large', 'm6i.xlarge', 'm6i.2xlarge', 'm6i.4xlarge', 'm7i.large', 'm7i.xlarge', 'm7i.2xlarge'],
    },
    {
        label: 'Compute Optimized — C series',
        types: ['c5.large', 'c5.xlarge', 'c5.2xlarge', 'c5.4xlarge', 'c5.9xlarge', 'c6i.large', 'c6i.xlarge', 'c6i.2xlarge', 'c6i.4xlarge', 'c7i.large', 'c7i.xlarge', 'c7i.2xlarge'],
    },
    {
        label: 'Memory Optimized — R series',
        types: ['r5.large', 'r5.xlarge', 'r5.2xlarge', 'r5.4xlarge', 'r5.8xlarge', 'r6i.large', 'r6i.xlarge', 'r6i.2xlarge', 'r6i.4xlarge', 'r7i.large', 'r7i.xlarge'],
    },
    {
        label: 'Storage Optimized — I series',
        types: ['i3.large', 'i3.xlarge', 'i3.2xlarge', 'i3.4xlarge', 'i3.8xlarge'],
    },
    {
        label: 'GPU — G / P series',
        types: ['g4dn.xlarge', 'g4dn.2xlarge', 'g4dn.4xlarge', 'g4dn.8xlarge', 'p3.2xlarge', 'p3.8xlarge'],
    },
];

const AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
    'ca-central-1', 'sa-east-1', 'af-south-1', 'me-south-1',
];

const ALL_INSTANCE_TYPES = INSTANCE_TYPE_GROUPS.flatMap((g) => g.types);

interface Vpc { id: string; cidr: string; isDefault: boolean; name: string }
interface Subnet { id: string; cidr: string; az: string; vpcId: string; name: string }
interface SecurityGroup { id: string; name: string; description: string; vpcId: string }
interface KeyPair { id: string; name: string; fingerprint: string }

type Props = {
    config: Record<string, unknown>;
    onChange: (k: string, v: unknown) => void;
    cloudAccountId: string;
    organizationId: string;
};

export function Ec2ConfigForm({ config, onChange, cloudAccountId, organizationId }: Props) {
    const [vpcs, setVpcs] = useState<Vpc[]>([]);
    const [subnets, setSubnets] = useState<Subnet[]>([]);
    const [sgs, setSgs] = useState<SecurityGroup[]>([]);
    const [keyPairs, setKeyPairs] = useState<KeyPair[]>([]);
    const [loadingVpcs, setLoadingVpcs] = useState(false);
    const [loadingSubnets, setLoadingSubnets] = useState(false);
    const [loadingSgs, setLoadingSgs] = useState(false);
    const [loadingKeyPairs, setLoadingKeyPairs] = useState(false);
    const [loadingAmi, setLoadingAmi] = useState(false);
    const [keyDialogOpen, setKeyDialogOpen] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [creatingKey, setCreatingKey] = useState(false);

    const region = String(config.region ?? 'us-east-1');
    const vpcId = config.vpcId ? String(config.vpcId) : '';
    const selectedSgIds = Array.isArray(config.securityGroupIds) ? (config.securityGroupIds as string[]) : [];

    const fetchVpcs = useCallback(async (r: string) => {
        setLoadingVpcs(true);
        setVpcs([]);
        try {
            const qs = new URLSearchParams({ organizationId, cloudAccountId, region: r });
            const res = await fetch(`/api/automation/resources/vpcs?${qs}`);
            if (res.ok) setVpcs(await res.json());
        } catch { /* ignore */ } finally { setLoadingVpcs(false); }
    }, [organizationId, cloudAccountId]);

    const fetchSubnets = useCallback(async (r: string, vpc?: string) => {
        setLoadingSubnets(true);
        setSubnets([]);
        try {
            const qs = new URLSearchParams({ organizationId, cloudAccountId, region: r });
            if (vpc) qs.set('vpcId', vpc);
            const res = await fetch(`/api/automation/resources/subnets?${qs}`);
            if (res.ok) setSubnets(await res.json());
        } catch { /* ignore */ } finally { setLoadingSubnets(false); }
    }, [organizationId, cloudAccountId]);

    const fetchSgs = useCallback(async (r: string, vpc?: string) => {
        setLoadingSgs(true);
        setSgs([]);
        try {
            const qs = new URLSearchParams({ organizationId, cloudAccountId, region: r });
            if (vpc) qs.set('vpcId', vpc);
            const res = await fetch(`/api/automation/resources/security-groups?${qs}`);
            if (res.ok) setSgs(await res.json());
        } catch { /* ignore */ } finally { setLoadingSgs(false); }
    }, [organizationId, cloudAccountId]);

    const fetchKeyPairs = useCallback(async (r: string) => {
        setLoadingKeyPairs(true);
        setKeyPairs([]);
        try {
            const qs = new URLSearchParams({ organizationId, cloudAccountId, region: r });
            const res = await fetch(`/api/automation/resources/key-pairs?${qs}`);
            if (res.ok) setKeyPairs(await res.json());
        } catch { /* ignore */ } finally { setLoadingKeyPairs(false); }
    }, [organizationId, cloudAccountId]);

    // Initial load
    useEffect(() => {
        void fetchVpcs(region);
        void fetchSubnets(region, vpcId || undefined);
        void fetchSgs(region, vpcId || undefined);
        void fetchKeyPairs(region);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRegionChange = (r: string) => {
        onChange('region', r);
        onChange('vpcId', '');
        onChange('subnetId', '');
        onChange('securityGroupIds', []);
        void fetchVpcs(r);
        void fetchSubnets(r);
        void fetchSgs(r);
        void fetchKeyPairs(r);
    };

    const handleVpcChange = (vpc: string) => {
        onChange('vpcId', vpc);
        onChange('subnetId', '');
        onChange('securityGroupIds', []);
        void fetchSubnets(region, vpc);
        void fetchSgs(region, vpc);
    };

    const handleOsSelect = async (osId: string) => {
        onChange('osPreset', osId);
        onChange('amiId', '');
        setLoadingAmi(true);
        try {
            const qs = new URLSearchParams({ organizationId, cloudAccountId, region, os: osId });
            const res = await fetch(`/api/automation/resources/ami?${qs}`);
            if (res.ok) {
                const data = await res.json();
                onChange('amiId', data.amiId);
            } else {
                toast.error(`AMI não encontrada para ${osId} em ${region}`);
            }
        } catch {
            toast.error('Erro ao resolver AMI');
        } finally {
            setLoadingAmi(false);
        }
    };

    const toggleSg = (sgId: string) => {
        const current = selectedSgIds;
        const updated = current.includes(sgId) ? current.filter((id) => id !== sgId) : [...current, sgId];
        onChange('securityGroupIds', updated);
    };

    const handleCreateKeyPair = async () => {
        if (!newKeyName.trim()) return;
        setCreatingKey(true);
        try {
            const qs = new URLSearchParams({ organizationId });
            const res = await fetch(`/api/automation/resources/key-pairs?${qs}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cloudAccountId, region, keyName: newKeyName.trim() }),
            });
            if (!res.ok) {
                const err = await res.json();
                toast.error(err.message ?? 'Erro ao criar chave');
                return;
            }
            const data = await res.json();

            // Download PEM
            const blob = new Blob([data.keyMaterial], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${data.name}.pem`;
            a.click();
            URL.revokeObjectURL(url);

            setKeyPairs((prev) => [...prev, { id: data.id, name: data.name, fingerprint: '' }]);
            onChange('keyName', data.name);
            setKeyDialogOpen(false);
            setNewKeyName('');
            toast.success(`Chave "${data.name}" criada e baixada com sucesso`);
        } catch {
            toast.error('Erro ao criar chave');
        } finally {
            setCreatingKey(false);
        }
    };

    const diskType = String(config.diskType ?? 'gp3');

    return (
        <div className="space-y-4">
            {/* OS Preset */}
            <div className="space-y-1.5">
                <Label className="text-xs font-medium">Sistema Operacional</Label>
                {loadingAmi && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Resolvendo AMI...
                    </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                    {OS_PRESETS.map((os) => {
                        const selected = config.osPreset === os.id;
                        return (
                            <button
                                key={os.id}
                                type="button"
                                onClick={() => void handleOsSelect(os.id)}
                                className={cn(
                                    'flex flex-col items-start rounded-md border px-2 py-1.5 text-left text-[10px] transition-all',
                                    selected ? 'border-primary bg-primary/5 font-medium' : 'border-border bg-background hover:border-muted-foreground/40',
                                )}
                            >
                                <span className={cn('mb-0.5 inline-block h-1.5 w-1.5 rounded-full', os.color)} />
                                <span className="leading-tight">{os.short}</span>
                            </button>
                        );
                    })}
                </div>
                {config.amiId ? (
                    <p className="truncate text-[10px] text-muted-foreground font-mono">{String(config.amiId)}</p>
                ) : null}
                {!config.osPreset && (
                    <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Ou informe AMI manualmente</Label>
                        <Input
                            className="h-7 text-xs"
                            value={String(config.amiId ?? '')}
                            onChange={(e) => onChange('amiId', e.target.value)}
                            placeholder="ami-xxxxxxxxxxxxxxxxx"
                        />
                    </div>
                )}
            </div>

            {/* Instance Type */}
            <div className="space-y-1">
                <Label className="text-xs">Tipo de Instância</Label>
                <Combobox items={ALL_INSTANCE_TYPES} value={String(config.instanceType ?? 't3.micro')} onValueChange={(v) => { if (v) onChange('instanceType', v); }}>
                    <ComboboxInput placeholder="Buscar tipo..." className="h-8 text-xs" />
                    <ComboboxContent>
                        <ComboboxEmpty className="text-xs">Tipo não encontrado.</ComboboxEmpty>
                        <ComboboxList>
                            {(t: string) => (
                                <ComboboxItem key={t} value={t} className="text-xs">{t}</ComboboxItem>
                            )}
                        </ComboboxList>
                    </ComboboxContent>
                </Combobox>
            </div>

            {/* Region */}
            <div className="space-y-1">
                <Label className="text-xs">Região</Label>
                <Combobox items={AWS_REGIONS} value={region} onValueChange={(v) => { if (v) handleRegionChange(v); }}>
                    <ComboboxInput placeholder="Buscar região..." className="h-8 text-xs" />
                    <ComboboxContent>
                        <ComboboxEmpty className="text-xs">Região não encontrada.</ComboboxEmpty>
                        <ComboboxList>
                            {(r: string) => (
                                <ComboboxItem key={r} value={r} className="text-xs">{r}</ComboboxItem>
                            )}
                        </ComboboxList>
                    </ComboboxContent>
                </Combobox>
            </div>

            {/* VPC */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <Label className="text-xs">VPC</Label>
                    <button type="button" onClick={() => void fetchVpcs(region)} className="text-[10px] text-muted-foreground hover:text-foreground">
                        <RefreshCw className={cn('h-3 w-3', loadingVpcs && 'animate-spin')} />
                    </button>
                </div>
                <Select value={vpcId} onValueChange={handleVpcChange} disabled={loadingVpcs}>
                    <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={loadingVpcs ? 'Carregando...' : 'Selecionar VPC'} />
                    </SelectTrigger>
                    <SelectContent>
                        {vpcs.map((v) => (
                            <SelectItem key={v.id} value={v.id} className="text-xs">
                                {v.isDefault ? `${v.id} (padrão)` : `${v.name} — ${v.cidr}`}
                            </SelectItem>
                        ))}
                        {vpcs.length === 0 && !loadingVpcs && (
                            <div className="px-2 py-1.5 text-[10px] text-muted-foreground">Nenhuma VPC encontrada</div>
                        )}
                    </SelectContent>
                </Select>
            </div>

            {/* Subnet */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <Label className="text-xs">Subnet</Label>
                    <button type="button" onClick={() => void fetchSubnets(region, vpcId || undefined)} className="text-[10px] text-muted-foreground hover:text-foreground">
                        <RefreshCw className={cn('h-3 w-3', loadingSubnets && 'animate-spin')} />
                    </button>
                </div>
                <Select value={String(config.subnetId ?? '')} onValueChange={(v) => onChange('subnetId', v)} disabled={loadingSubnets}>
                    <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={loadingSubnets ? 'Carregando...' : 'Selecionar subnet'} />
                    </SelectTrigger>
                    <SelectContent>
                        {subnets.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="text-xs">
                                {s.name} — {s.az} ({s.cidr})
                            </SelectItem>
                        ))}
                        {subnets.length === 0 && !loadingSubnets && (
                            <div className="px-2 py-1.5 text-[10px] text-muted-foreground">Nenhuma subnet encontrada</div>
                        )}
                    </SelectContent>
                </Select>
            </div>

            {/* Security Groups */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <Label className="text-xs">Security Groups</Label>
                    <button type="button" onClick={() => void fetchSgs(region, vpcId || undefined)} className="text-[10px] text-muted-foreground hover:text-foreground">
                        <RefreshCw className={cn('h-3 w-3', loadingSgs && 'animate-spin')} />
                    </button>
                </div>
                {loadingSgs ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
                    </div>
                ) : sgs.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground py-1">Nenhum SG encontrado</p>
                ) : (
                    <div className="max-h-28 overflow-y-auto rounded-md border p-1.5 space-y-1">
                        {sgs.map((sg) => (
                            <label key={sg.id} className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-muted/40">
                                <Checkbox
                                    checked={selectedSgIds.includes(sg.id)}
                                    onCheckedChange={() => toggleSg(sg.id)}
                                    className="mt-0.5 h-3.5 w-3.5"
                                />
                                <span className="text-[10px] leading-tight">
                                    <span className="font-medium">{sg.name}</span>
                                    <br />
                                    <span className="text-muted-foreground">{sg.id}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {/* Key Pair */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <Label className="text-xs">Key Pair</Label>
                    <button type="button" onClick={() => void fetchKeyPairs(region)} className="text-[10px] text-muted-foreground hover:text-foreground">
                        <RefreshCw className={cn('h-3 w-3', loadingKeyPairs && 'animate-spin')} />
                    </button>
                </div>
                <div className="flex gap-1.5">
                    <Select value={String(config.keyName ?? '')} onValueChange={(v) => onChange('keyName', v)} disabled={loadingKeyPairs}>
                        <SelectTrigger className="h-8 flex-1 text-xs">
                            <SelectValue placeholder={loadingKeyPairs ? 'Carregando...' : 'Sem chave'} />
                        </SelectTrigger>
                        <SelectContent>
                            {keyPairs.map((kp) => (
                                <SelectItem key={kp.id} value={kp.name} className="text-xs">{kp.name}</SelectItem>
                            ))}
                            {keyPairs.length === 0 && !loadingKeyPairs && (
                                <div className="px-2 py-1.5 text-[10px] text-muted-foreground">Nenhuma chave encontrada</div>
                            )}
                        </SelectContent>
                    </Select>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setKeyDialogOpen(true)}
                        title="Criar nova chave PEM"
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Disk Configuration */}
            <div className="space-y-1.5 rounded-md border p-2">
                <Label className="text-xs font-medium">Disco (EBS)</Label>
                <div className="grid grid-cols-2 gap-1.5">
                    <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Tipo</Label>
                        <Select value={diskType} onValueChange={(v) => onChange('diskType', v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {['gp3', 'gp2', 'io1', 'st1', 'sc1'].map((t) => (
                                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Tamanho (GB)</Label>
                        <Input
                            className="h-7 text-xs"
                            type="number"
                            min={1}
                            max={16384}
                            value={Number(config.diskSizeGb ?? 8)}
                            onChange={(e) => onChange('diskSizeGb', Number(e.target.value))}
                        />
                    </div>
                </div>
                {(diskType === 'gp3' || diskType === 'io1') && (
                    <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">IOPS</Label>
                        <Input
                            className="h-7 text-xs"
                            type="number"
                            min={100}
                            max={diskType === 'io1' ? 64000 : 16000}
                            value={Number(config.diskIops ?? 3000)}
                            onChange={(e) => onChange('diskIops', Number(e.target.value))}
                        />
                    </div>
                )}
                {diskType === 'gp3' && (
                    <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Throughput (MB/s)</Label>
                        <Input
                            className="h-7 text-xs"
                            type="number"
                            min={125}
                            max={1000}
                            value={Number(config.diskThroughput ?? 125)}
                            onChange={(e) => onChange('diskThroughput', Number(e.target.value))}
                        />
                    </div>
                )}
                <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                        checked={config.diskDeleteOnTermination !== false}
                        onCheckedChange={(v) => onChange('diskDeleteOnTermination', Boolean(v))}
                        className="h-3.5 w-3.5"
                    />
                    <span className="text-[10px]">Excluir disco ao terminar instância</span>
                </label>
            </div>

            {/* New Key Pair Dialog */}
            <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-sm">
                            <Key className="h-4 w-4" />
                            Criar novo Key Pair
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <p className="text-xs text-muted-foreground">
                            O par de chaves será criado na AWS na região <strong>{region}</strong>. O arquivo <code>.pem</code> será baixado automaticamente — guarde-o em local seguro.
                        </p>
                        <div className="space-y-1">
                            <Label className="text-xs">Nome da chave</Label>
                            <Input
                                className="h-8 text-xs"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                placeholder="minha-chave-ec2"
                                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateKeyPair(); }}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setKeyDialogOpen(false)}>Cancelar</Button>
                        <Button
                            size="sm"
                            isLoading={creatingKey}
                            disabled={!newKeyName.trim() || creatingKey}
                            onClick={() => void handleCreateKeyPair()}
                        >
                            Criar e baixar .pem
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
