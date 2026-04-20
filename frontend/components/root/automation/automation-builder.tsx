'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, addEdge, useEdgesState, useNodesState, type Connection, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Server, HardDrive, Database, Zap, Trash2, Settings2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { automationNodeTypes, type AutomationNodeData } from './automation-nodes';
import { Ec2ConfigForm } from './ec2-config-form';
import type { FlowDefinition, FlowNode } from '@/app/actions/automation';
import { cn } from '@/lib/utils';

const PALETTE_ITEMS = [
    { type: 'ec2', label: 'EC2', description: 'Instância virtual', icon: Server, color: 'bg-orange-500' },
    { type: 's3', label: 'S3', description: 'Armazenamento de objetos', icon: HardDrive, color: 'bg-green-500' },
    { type: 'rds', label: 'RDS', description: 'Banco de dados gerenciado', icon: Database, color: 'bg-blue-500' },
    { type: 'lambda', label: 'Lambda', description: 'Computação serverless', icon: Zap, color: 'bg-purple-500' },
] as const;

const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
    ec2: { instanceType: 't3.micro', region: 'us-east-1', osPreset: 'amazon-linux-2023', amiId: '', vpcId: '', subnetId: '', securityGroupIds: [], keyName: '', diskType: 'gp3', diskSizeGb: 8, diskIops: 3000, diskThroughput: 125, diskDeleteOnTermination: true },
    s3: { bucketName: '', region: 'us-east-1', versioning: false, encryption: true, storageGb: 10 },
    rds: { dbInstanceIdentifier: '', dbInstanceClass: 'db.t3.micro', engine: 'postgres', masterUsername: 'admin', masterUserPassword: '', allocatedStorage: 20, region: 'us-east-1', multiAz: false },
    lambda: { functionName: '', runtime: 'nodejs20.x', handler: 'index.handler', region: 'us-east-1', memorySize: 128, timeout: 30, roleArn: '' },
};


function S3ConfigForm({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
    return (
        <div className="space-y-3">
            <div className="space-y-1">
                <Label className="text-xs">Bucket Name</Label>
                <Input className="h-8 text-xs" value={String(config.bucketName ?? '')} onChange={(e) => onChange('bucketName', e.target.value)} placeholder="meu-bucket-unico" />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Region</Label>
                <RegionSelect value={String(config.region ?? 'us-east-1')} onChange={(v) => onChange('region', v)} />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Storage estimado (GB)</Label>
                <Input className="h-8 text-xs" type="number" min={1} value={Number(config.storageGb ?? 10)} onChange={(e) => onChange('storageGb', Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2">
                <Checkbox checked={Boolean(config.versioning)} onCheckedChange={(v) => onChange('versioning', Boolean(v))} />
                <Label className="text-xs">Versionamento</Label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox checked={config.encryption !== false} onCheckedChange={(v) => onChange('encryption', Boolean(v))} />
                <Label className="text-xs">Criptografia AES-256</Label>
            </div>
        </div>
    );
}

function RdsConfigForm({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
    return (
        <div className="space-y-3">
            <div className="space-y-1">
                <Label className="text-xs">Identificador</Label>
                <Input className="h-8 text-xs" value={String(config.dbInstanceIdentifier ?? '')} onChange={(e) => onChange('dbInstanceIdentifier', e.target.value)} placeholder="my-db-instance" />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Engine</Label>
                <Select value={String(config.engine ?? 'postgres')} onValueChange={(v) => onChange('engine', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {['mysql', 'postgres', 'mariadb', 'aurora-mysql', 'aurora-postgresql'].map((e) => (
                            <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Instance Class</Label>
                <Select value={String(config.dbInstanceClass ?? 'db.t3.micro')} onValueChange={(v) => onChange('dbInstanceClass', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {['db.t3.micro', 'db.t3.small', 'db.t3.medium', 'db.t3.large', 'db.m5.large', 'db.m5.xlarge', 'db.r5.large'].map((c) => (
                            <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Region</Label>
                <RegionSelect value={String(config.region ?? 'us-east-1')} onChange={(v) => onChange('region', v)} />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Master Username</Label>
                <Input className="h-8 text-xs" value={String(config.masterUsername ?? '')} onChange={(e) => onChange('masterUsername', e.target.value)} />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Master Password</Label>
                <Input className="h-8 text-xs" type="password" value={String(config.masterUserPassword ?? '')} onChange={(e) => onChange('masterUserPassword', e.target.value)} />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Storage (GB)</Label>
                <Input className="h-8 text-xs" type="number" min={20} value={Number(config.allocatedStorage ?? 20)} onChange={(e) => onChange('allocatedStorage', Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2">
                <Checkbox checked={Boolean(config.multiAz)} onCheckedChange={(v) => onChange('multiAz', Boolean(v))} />
                <Label className="text-xs">Multi-AZ</Label>
            </div>
        </div>
    );
}

function LambdaConfigForm({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
    return (
        <div className="space-y-3">
            <div className="space-y-1">
                <Label className="text-xs">Function Name</Label>
                <Input className="h-8 text-xs" value={String(config.functionName ?? '')} onChange={(e) => onChange('functionName', e.target.value)} placeholder="minha-funcao" />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Runtime</Label>
                <Select value={String(config.runtime ?? 'nodejs20.x')} onValueChange={(v) => onChange('runtime', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {['nodejs20.x', 'nodejs18.x', 'python3.12', 'python3.11', 'java21'].map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Region</Label>
                <RegionSelect value={String(config.region ?? 'us-east-1')} onChange={(v) => onChange('region', v)} />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Memory (MB)</Label>
                <Select value={String(config.memorySize ?? 128)} onValueChange={(v) => onChange('memorySize', Number(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {[128, 256, 512, 1024, 2048].map((m) => (
                            <SelectItem key={m} value={String(m)} className="text-xs">{m} MB</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Timeout (s)</Label>
                <Input className="h-8 text-xs" type="number" min={1} max={900} value={Number(config.timeout ?? 30)} onChange={(e) => onChange('timeout', Number(e.target.value))} />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Execution Role ARN</Label>
                <Input className="h-8 text-xs" value={String(config.roleArn ?? '')} onChange={(e) => onChange('roleArn', e.target.value)} placeholder="arn:aws:iam::..." />
            </div>
        </div>
    );
}

function RegionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const regions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-west-2', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1', 'sa-east-1'];
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
                {regions.map((r) => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}

type Props = {
    onFlowChange: (flow: FlowDefinition) => void;
    cloudAccountId: string;
    organizationId: string;
};

export function AutomationBuilder({ onFlowChange, cloudAccountId, organizationId }: Props) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

    const selectedNode = nodes.find((n) => n.id === selectedNodeId);

    const onConnect = useCallback((connection: Connection) => {
        setEdges((eds) => addEdge(connection, eds));
    }, [setEdges]);

    const addNode = useCallback((type: string) => {
        const id = crypto.randomUUID();
        const nodeCount = nodes.length;
        const newNode: Node = {
            id,
            type: 'automationResource',
            position: { x: 80 + nodeCount * 220, y: 150 },
            data: {
                label: '',
                resourceType: type,
                configured: false,
                config: { ...DEFAULT_CONFIGS[type] },
            } satisfies AutomationNodeData,
        };

        setNodes((nds) => {
            const updated = [...nds, newNode];
            return updated;
        });

        setSelectedNodeId(id);
    }, [nodes, edges, setNodes]);

    const updateNodeConfig = useCallback((key: string, value: unknown) => {
        if (!selectedNodeId) return;

        setNodes((nds) => {
            const updated = nds.map((n) => {
                if (n.id !== selectedNodeId) return n;
                const data = n.data as AutomationNodeData;
                const newConfig = { ...data.config, [key]: value };
                const configured = isConfigured(data.resourceType, newConfig);
                const label = buildLabel(data.resourceType, newConfig);
                return { ...n, data: { ...data, config: newConfig, configured, label } };
            });
            return updated;
        });
    }, [selectedNodeId, setNodes]);

    const deleteNode = useCallback((nodeId: string) => {
        setNodes((nds) => {
            const updated = nds.filter((n) => n.id !== nodeId);
            return updated;
        });
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        setSelectedNodeId(null);
    }, [setNodes, setEdges]);

    useEffect(() => {
        const flowNodes: FlowNode[] = nodes.map((n) => {
            const data = n.data as AutomationNodeData;
            return {
                id: n.id,
                type: data.resourceType,
                label: data.label || undefined,
                position: n.position,
                config: data.config,
            };
        });
        onFlowChange({ nodes: flowNodes, edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) });
    }, [nodes, edges, onFlowChange]);

    const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
        onEdgesChange(changes);
    }, [onEdgesChange]);

    return (
        <div className="flex h-140 overflow-hidden rounded-xl border">
            {/* Node palette */}
            <div className="flex w-52 shrink-0 flex-col gap-2 border-r bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recursos</p>
                {PALETTE_ITEMS.map(({ type, label, description, icon: Icon, color }) => (
                    <button
                        key={type}
                        onClick={() => addNode(type)}
                        className="group flex cursor-pointer items-center gap-2.5 rounded-lg border bg-background p-2.5 text-left shadow-sm transition-all hover:border-primary hover:shadow-md"
                    >
                        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white', color)}>
                            <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold">{label}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{description}</p>
                        </div>
                    </button>
                ))}
                {nodes.length === 0 && (
                    <p className="mt-4 text-center text-[11px] text-muted-foreground">Clique em um recurso para adicioná-lo ao canvas</p>
                )}
            </div>

            {/* Canvas */}
            <div ref={reactFlowWrapper} className="flex-1">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
                    onPaneClick={() => setSelectedNodeId(null)}
                    nodeTypes={automationNodeTypes}
                    defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
                    fitView
                    className="bg-background"
                >
                    <Background gap={16} color="hsl(var(--border))" />
                    <Controls />
                </ReactFlow>
            </div>

            {/* Config panel */}
            {selectedNode && (
                <div className="flex w-64 shrink-0 flex-col border-l">
                    <div className="flex items-center justify-between border-b px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold">Configurar recurso</span>
                        </div>
                        <button
                            onClick={() => deleteNode(selectedNode.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3">
                        {(() => {
                            const data = selectedNode.data as AutomationNodeData;
                            const config = data.config;
                            const handleChange = updateNodeConfig;
                            switch (data.resourceType) {
                                case 'ec2': return <Ec2ConfigForm config={config} onChange={handleChange} cloudAccountId={cloudAccountId} organizationId={organizationId} />;
                                case 's3': return <S3ConfigForm config={config} onChange={handleChange} />;
                                case 'rds': return <RdsConfigForm config={config} onChange={handleChange} />;
                                case 'lambda': return <LambdaConfigForm config={config} onChange={handleChange} />;
                                default: return null;
                            }
                        })()}
                    </div>
                </div>
            )}

            {!selectedNode && nodes.length > 0 && (
                <div className="flex w-56 shrink-0 flex-col items-center justify-center gap-2 border-l bg-muted/20 text-center">
                    <ChevronRight className="h-6 w-6 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground px-4">Clique em um node para configurá-lo</p>
                </div>
            )}
        </div>
    );
}

function isConfigured(type: string, config: Record<string, unknown>): boolean {
    switch (type) {
        case 'ec2': return Boolean(config.instanceType && config.region && (config.amiId || config.osPreset));
        case 's3': return Boolean(config.bucketName && String(config.bucketName).length >= 3 && config.region);
        case 'rds': return Boolean(config.dbInstanceIdentifier && config.engine && config.masterUserPassword);
        case 'lambda': return Boolean(config.functionName && config.roleArn);
        default: return false;
    }
}

function buildLabel(type: string, config: Record<string, unknown>): string {
    switch (type) {
        case 'ec2': return String(config.instanceType || 'EC2');
        case 's3': return String(config.bucketName || 'S3 Bucket');
        case 'rds': return `${String(config.engine || 'RDS')} / ${String(config.dbInstanceClass || 'db.t3.micro')}`;
        case 'lambda': return String(config.functionName || 'Lambda');
        default: return type;
    }
}
