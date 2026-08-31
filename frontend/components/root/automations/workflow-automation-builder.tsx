'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    addEdge,
    useEdgesState,
    useNodesState,
    type Connection,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Cloud, HardDrive, Settings2, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { automationNodeTypes, type AutomationNodeData } from '@/components/root/automation/automation-nodes';
import type { ActionDefinition, AutomationEdgeInput, AutomationNodeInput } from '@/app/actions/automations';
import { cn } from '@/lib/utils';

const ACTION_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
    AWS_S3_BUCKET_CREATE: { icon: HardDrive, color: 'bg-green-500' },
    AWS_CLOUDFRONT_DISTRIBUTION_CREATE: { icon: Cloud, color: 'bg-orange-500' },
};

const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
    AWS_S3_BUCKET_CREATE: {
        bucketName: '',
        region: 'us-east-1',
        versioning: false,
        encryption: true,
        publicAccessBlock: true,
    },
    AWS_CLOUDFRONT_DISTRIBUTION_CREATE: {
        comment: '',
        enabled: true,
        priceClass: 'PriceClass_100',
        origin: { type: 'NODE_OUTPUT', nodeId: '', field: 'bucketDomainName' },
    },
};

function RegionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const regions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'sa-east-1'];
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
                {regions.map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

type Props = {
    initialNodes?: AutomationNodeInput[];
    initialEdges?: AutomationEdgeInput[];
    actions: ActionDefinition[];
    onChange: (nodes: AutomationNodeInput[], edges: AutomationEdgeInput[]) => void;
    readOnly?: boolean;
};

export function WorkflowAutomationBuilder({ initialNodes = [], initialEdges = [], actions, onChange, readOnly = false }: Props) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const initialized = useRef(false);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        if (initialNodes.length > 0) {
            setNodes(
                initialNodes.map((node) => ({
                    id: node.id,
                    type: 'automationResource',
                    position: node.position ?? { x: 100, y: 100 },
                    data: {
                        label: node.name,
                        resourceType: node.type,
                        configured: true,
                        config: node.config,
                    } satisfies AutomationNodeData,
                })),
            );
            setEdges(
                initialEdges.map((edge) => ({
                    id: edge.id,
                    source: edge.sourceNodeId,
                    target: edge.targetNodeId,
                })),
            );
        }
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    const selectedNode = nodes.find((n) => n.id === selectedNodeId);

    const upstreamNodes = useCallback(
        (nodeId: string) => {
            const sources = edges.filter((e) => e.target === nodeId).map((e) => e.source);
            return nodes.filter((n) => sources.includes(n.id));
        },
        [edges, nodes],
    );

    const emitChange = useCallback(() => {
        const flowNodes: AutomationNodeInput[] = nodes.map((n) => {
            const data = n.data as AutomationNodeData;
            return {
                id: n.id,
                type: data.resourceType,
                name: data.label || data.resourceType,
                position: n.position,
                config: data.config,
            };
        });
        const flowEdges: AutomationEdgeInput[] = edges.map((e) => ({
            id: e.id,
            sourceNodeId: e.source,
            targetNodeId: e.target,
        }));
        onChange(flowNodes, flowEdges);
    }, [nodes, edges, onChange]);

    useEffect(() => {
        emitChange();
    }, [nodes, edges, emitChange]);

    const onConnect = useCallback(
        (connection: Connection) => {
            if (readOnly) return;
            setEdges((eds) => addEdge({ ...connection, id: crypto.randomUUID() }, eds));
        },
        [readOnly, setEdges],
    );

    const addNode = useCallback(
        (type: string, name: string) => {
            if (readOnly) return;
            const id = crypto.randomUUID();
            const newNode: Node = {
                id,
                type: 'automationResource',
                position: { x: 80 + nodes.length * 220, y: 150 },
                data: {
                    label: name,
                    resourceType: type,
                    configured: false,
                    config: { ...(DEFAULT_CONFIGS[type] ?? {}) },
                } satisfies AutomationNodeData,
            };
            setNodes((nds) => [...nds, newNode]);
            setSelectedNodeId(id);
        },
        [nodes.length, readOnly, setNodes],
    );

    const updateNodeConfig = useCallback(
        (key: string, value: unknown) => {
            if (!selectedNodeId || readOnly) return;
            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id !== selectedNodeId) return n;
                    const data = n.data as AutomationNodeData;
                    const newConfig = { ...data.config, [key]: value };
                    return {
                        ...n,
                        data: {
                            ...data,
                            config: newConfig,
                            configured: true,
                            label: buildLabel(data.resourceType, newConfig, data.label),
                        },
                    };
                }),
            );
        },
        [selectedNodeId, readOnly, setNodes],
    );

    const deleteNode = useCallback(
        (nodeId: string) => {
            if (readOnly) return;
            setNodes((nds) => nds.filter((n) => n.id !== nodeId));
            setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
            setSelectedNodeId(null);
        },
        [readOnly, setNodes, setEdges],
    );

    return (
        <div className="flex h-[520px] overflow-hidden rounded-xl border">
            {!readOnly && (
                <div className="flex w-52 shrink-0 flex-col gap-2 border-r bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ações</p>
                    {actions.map((action) => {
                        const meta = ACTION_ICONS[action.type] ?? { icon: Cloud, color: 'bg-slate-500' };
                        const Icon = meta.icon;
                        return (
                            <button
                                key={action.type}
                                type="button"
                                onClick={() => addNode(action.type, action.name)}
                                className="group flex cursor-pointer items-center gap-2.5 rounded-lg border bg-background p-2.5 text-left shadow-sm transition-all hover:border-primary hover:shadow-md"
                            >
                                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white', meta.color)}>
                                    <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold">{action.name}</p>
                                    <p className="truncate text-[10px] text-muted-foreground">{action.category}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            <div ref={reactFlowWrapper} className="flex-1">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={readOnly ? undefined : onNodesChange}
                    onEdgesChange={readOnly ? undefined : onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
                    onPaneClick={() => setSelectedNodeId(null)}
                    nodeTypes={automationNodeTypes}
                    defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
                    fitView
                    nodesDraggable={!readOnly}
                    nodesConnectable={!readOnly}
                    elementsSelectable={!readOnly}
                    className="bg-background"
                >
                    <Background gap={16} color="hsl(var(--border))" />
                    <Controls />
                </ReactFlow>
            </div>

            {selectedNode && !readOnly && (
                <div className="flex w-72 shrink-0 flex-col border-l">
                    <div className="flex items-center justify-between border-b px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold">Configuração</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => deleteNode(selectedNode.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {(() => {
                            const data = selectedNode.data as AutomationNodeData;
                            const config = data.config;
                            if (data.resourceType === 'AWS_S3_BUCKET_CREATE') {
                                return (
                                    <>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Nome do bucket</Label>
                                            <Input
                                                className="h-8 text-xs"
                                                value={String(config.bucketName ?? '')}
                                                onChange={(e) => updateNodeConfig('bucketName', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Região</Label>
                                            <RegionSelect
                                                value={String(config.region ?? 'us-east-1')}
                                                onChange={(v) => updateNodeConfig('region', v)}
                                            />
                                        </div>
                                    </>
                                );
                            }
                            if (data.resourceType === 'AWS_CLOUDFRONT_DISTRIBUTION_CREATE') {
                                const upstream = upstreamNodes(selectedNode.id);
                                const originRef = config.origin as { nodeId?: string; field?: string } | undefined;
                                return (
                                    <>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Comentário</Label>
                                            <Input
                                                className="h-8 text-xs"
                                                value={String(config.comment ?? '')}
                                                onChange={(e) => updateNodeConfig('comment', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Origem (node S3)</Label>
                                            <Select
                                                value={originRef?.nodeId ?? ''}
                                                onValueChange={(nodeId) =>
                                                    updateNodeConfig('origin', {
                                                        type: 'NODE_OUTPUT',
                                                        nodeId,
                                                        field: 'bucketDomainName',
                                                    })
                                                }
                                            >
                                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione o bucket" /></SelectTrigger>
                                                <SelectContent>
                                                    {upstream.map((n) => {
                                                        const d = n.data as AutomationNodeData;
                                                        return (
                                                            <SelectItem key={n.id} value={n.id} className="text-xs">
                                                                {d.label || d.resourceType}
                                                            </SelectItem>
                                                        );
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                );
                            }
                            return null;
                        })()}
                    </div>
                </div>
            )}

            {!selectedNode && nodes.length > 0 && !readOnly && (
                <div className="flex w-56 shrink-0 flex-col items-center justify-center gap-2 border-l bg-muted/20 text-center">
                    <ChevronRight className="h-6 w-6 text-muted-foreground" />
                    <p className="px-4 text-xs text-muted-foreground">Clique em um node para configurá-lo</p>
                </div>
            )}
        </div>
    );
}

function buildLabel(type: string, config: Record<string, unknown>, fallback: string): string {
    if (type === 'AWS_S3_BUCKET_CREATE') return String(config.bucketName || fallback || 'S3 Bucket');
    if (type === 'AWS_CLOUDFRONT_DISTRIBUTION_CREATE') return fallback || 'CloudFront';
    return fallback || type;
}
