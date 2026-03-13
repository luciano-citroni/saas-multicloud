'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Background, Controls, Handle, MiniMap, Position, ReactFlow } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import dagre from 'dagre';
import { toPng } from 'html-to-image';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FolderTree, Layers3, LayoutGrid, Play, Radar, ScanSearch } from 'lucide-react';

const ACTIVE_ORG_STORAGE_KEY = 'smc_active_organization_id';
const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

type AssessmentGraphPayload = {
    architectureGraph?: {
        nodes?: Node[];
        edges?: Edge[];
    };
};

type ArchitectureNodeData = {
    label?: string;
    resourceType?: string;
    status?: string;
    details?: Record<string, unknown>;
    group?: {
        vpcId?: string;
        vpcName?: string;
        region?: string;
    };
};

type GroupNodeData = {
    label: string;
};

type GroupingMode = 'resourceType' | 'vpc' | 'region' | 'none';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 86;
const GROUP_PADDING_X = 24;
const GROUP_PADDING_Y = 18;
const GROUP_HEADER_HEIGHT = 34;
const GROUP_COLUMNS = 3;
const GROUP_GAP_X = 80;
const GROUP_GAP_Y = 90;

function ArchitectureNode({ data }: { data: ArchitectureNodeData }) {
    return (
        <>
            <Handle
                type="target"
                position={Position.Left}
                className="h-2! w-2! border-border! bg-muted-foreground/70!"
                style={{ left: -5 }}
            />
            <div className="w-65 rounded-xl border border-border/80 bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <p className="truncate text-sm font-semibold text-card-foreground">{data.label ?? 'Resource'}</p>
                <p className="truncate text-xs text-muted-foreground">{data.resourceType ?? 'Unknown'}</p>
                {data.status ? <p className="mt-1 truncate text-[11px] text-muted-foreground">Status: {data.status}</p> : null}
            </div>
            <Handle
                type="source"
                position={Position.Right}
                className="h-2! w-2! border-border! bg-muted-foreground/70!"
                style={{ right: -5 }}
            />
        </>
    );
}

function ResourceGroupNode({ data }: { data: GroupNodeData }) {
    return (
        <div className="h-full w-full rounded-2xl border border-border/80 bg-linear-to-b from-muted/40 to-transparent">
            <div className="flex h-8 items-center rounded-t-2xl border-b border-border/80 bg-background/70 px-3 backdrop-blur-sm">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{data.label}</p>
            </div>
        </div>
    );
}

function getResourceGroup(resourceType: string | undefined): string {
    const value = (resourceType ?? '').toLowerCase();

    if (value.includes('vpc') || value.includes('subnet') || value.includes('route table') || value.includes('load balancer')) {
        return 'Network / VPC';
    }

    if (value.includes('ecs') || value.includes('container')) {
        return 'ECS / Containers';
    }

    if (value.includes('iam')) {
        return 'IAM / Identity';
    }

    if (value.includes('rds') || value.includes('dynamo') || value.includes('cache')) {
        return 'Data';
    }

    if (value.includes('lambda') || value.includes('api gateway')) {
        return 'Serverless';
    }

    return 'Others';
}

function getGroupPriority(label: string): number {
    const order = ['Network / VPC', 'ECS / Containers', 'IAM / Identity', 'Serverless', 'Data', 'Others'];
    const index = order.indexOf(label);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function normalizeGroupId(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function getNodeGroupLabel(node: Node, groupingMode: GroupingMode): string {
    const data = (node.data ?? {}) as ArchitectureNodeData;

    if (groupingMode === 'resourceType') {
        return getResourceGroup(data.resourceType);
    }

    if (groupingMode === 'vpc') {
        const vpcName = data.group?.vpcName;
        if (typeof vpcName === 'string' && vpcName.trim().length > 0) {
            return `VPC: ${vpcName}`;
        }

        if (data.resourceType === 'VPC' && typeof data.label === 'string' && data.label.trim().length > 0) {
            return `VPC: ${data.label}`;
        }

        return 'VPC: Global / Sem VPC';
    }

    if (groupingMode === 'region') {
        const region = data.group?.region;
        if (typeof region === 'string' && region.trim().length > 0) {
            return `Region: ${region}`;
        }

        return 'Region: N/A';
    }

    return 'All Resources';
}

function layoutNodesInGroup(children: Node[], allEdges: Edge[]): Node[] {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'TB', ranksep: 70, nodesep: 44, marginx: 0, marginy: 0 });

    for (const child of children) {
        graph.setNode(child.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    const nodeIds = new Set(children.map((child) => child.id));
    for (const edge of allEdges) {
        if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
            graph.setEdge(edge.source, edge.target);
        }
    }

    dagre.layout(graph);

    return children.map((child, index) => {
        const positioned = graph.node(child.id) as { x: number; y: number } | undefined;

        if (!positioned) {
            return {
                ...child,
                position: {
                    x: GROUP_PADDING_X,
                    y: GROUP_PADDING_Y + GROUP_HEADER_HEIGHT + index * (NODE_HEIGHT + 18),
                },
            };
        }

        return {
            ...child,
            position: {
                x: positioned.x - NODE_WIDTH / 2 + GROUP_PADDING_X,
                y: positioned.y - NODE_HEIGHT / 2 + GROUP_PADDING_Y + GROUP_HEADER_HEIGHT,
            },
        };
    });
}

function buildGroupedNodes(resourceNodes: Node[], allEdges: Edge[], groupingMode: GroupingMode): Node[] {
    if (!resourceNodes.length) {
        return [];
    }

    if (groupingMode === 'none') {
        return resourceNodes;
    }

    const groups = new Map<string, Node[]>();
    const labelsById = new Map<string, string>();

    for (const node of resourceNodes) {
        const label = getNodeGroupLabel(node, groupingMode);
        const groupId = `group:${normalizeGroupId(label) || 'default'}`;

        const list = groups.get(groupId) ?? [];
        list.push(node);
        groups.set(groupId, list);
        labelsById.set(groupId, label);
    }

    const orderedGroups = Array.from(groups.entries()).sort((a, b) => {
        const aLabel = labelsById.get(a[0]) ?? a[0].replace('group:', '');
        const bLabel = labelsById.get(b[0]) ?? b[0].replace('group:', '');

        if (groupingMode === 'resourceType') {
            return getGroupPriority(aLabel) - getGroupPriority(bLabel);
        }

        return aLabel.localeCompare(bLabel, 'pt-BR');
    });

    const preparedGroups = orderedGroups.map(([groupId, children]) => {
        const label = labelsById.get(groupId) ?? groupId.replace('group:', '');
        const laidOutChildren = layoutNodesInGroup(children, allEdges);

        const maxChildX = Math.max(...laidOutChildren.map((child) => child.position.x + NODE_WIDTH));
        const maxChildY = Math.max(...laidOutChildren.map((child) => child.position.y + NODE_HEIGHT));

        const width = maxChildX + GROUP_PADDING_X;
        const height = maxChildY + GROUP_PADDING_Y;

        return {
            groupId,
            label,
            width,
            height,
            children: laidOutChildren,
        };
    });

    const maxGroupWidth = Math.max(...preparedGroups.map((group) => group.width));
    const maxGroupHeight = Math.max(...preparedGroups.map((group) => group.height));

    const grouped: Node[] = [];

    preparedGroups.forEach((group, index) => {
        const column = index % GROUP_COLUMNS;
        const row = Math.floor(index / GROUP_COLUMNS);

        const groupX = column * (maxGroupWidth + GROUP_GAP_X);
        const groupY = row * (maxGroupHeight + GROUP_GAP_Y);

        grouped.push({
            id: group.groupId,
            type: 'resourceGroup',
            position: { x: groupX, y: groupY },
            data: { label: group.label },
            draggable: false,
            selectable: false,
            style: {
                width: group.width,
                height: group.height,
                zIndex: 0,
            },
        });

        for (const child of group.children) {
            grouped.push({
                ...child,
                parentId: group.groupId,
                extent: 'parent',
            });
        }
    });

    return grouped;
}

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
    if (!nodes.length) {
        return [];
    }

    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'LR', ranksep: 130, nodesep: 70, marginx: 30, marginy: 30 });

    for (const node of nodes) {
        graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    for (const edge of edges) {
        graph.setEdge(edge.source, edge.target);
    }

    dagre.layout(graph);

    return nodes.map((node) => {
        const positionedNode = graph.node(node.id) as { x: number; y: number } | undefined;

        if (!positionedNode) {
            return node;
        }

        return {
            ...node,
            position: {
                x: positionedNode.x - NODE_WIDTH / 2,
                y: positionedNode.y - NODE_HEIGHT / 2,
            },
        };
    });
}

function normalizeNodes(nodes: unknown): Node[] {
    if (!Array.isArray(nodes)) {
        return [];
    }

    return nodes
        .filter((node) => typeof node === 'object' && node !== null)
        .map((node) => {
            const candidate = node as Partial<Node>;
            return {
                id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
                type: 'architectureNode',
                position:
                    candidate.position && typeof candidate.position.x === 'number' && typeof candidate.position.y === 'number'
                        ? candidate.position
                        : { x: 0, y: 0 },
                data:
                    candidate.data && typeof candidate.data === 'object'
                        ? candidate.data
                        : {
                              label: 'Resource',
                              resourceType: 'Unknown',
                          },
            } as Node;
        });
}

function normalizeEdges(edges: unknown): Edge[] {
    if (!Array.isArray(edges)) {
        return [];
    }

    return edges
        .filter((edge) => typeof edge === 'object' && edge !== null)
        .map((edge) => {
            const candidate = edge as Partial<Edge>;
            return {
                id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
                source: typeof candidate.source === 'string' ? candidate.source : '',
                target: typeof candidate.target === 'string' ? candidate.target : '',
                label: candidate.label,
                type: candidate.type ?? 'smoothstep',
                animated: candidate.animated,
                data: candidate.data,
            } as Edge;
        })
        .filter((edge) => edge.source.length > 0 && edge.target.length > 0);
}

const GROUPING_MODE_OPTIONS: Array<{ value: GroupingMode; label: string; icon: typeof Layers3 }> = [
    { value: 'resourceType', label: 'Por tipo', icon: Layers3 },
    { value: 'vpc', label: 'Por VPC', icon: FolderTree },
    { value: 'region', label: 'Por regiao', icon: Radar },
    { value: 'none', label: 'Sem grupos', icon: ScanSearch },
];

export default function AssessmentPage() {
    const router = useRouter();
    const { resolvedTheme } = useTheme();
    const graphWrapperRef = useRef<HTMLDivElement | null>(null);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [resourceNodes, setResourceNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [groupingMode, setGroupingMode] = useState<GroupingMode>('resourceType');

    const nodeTypes = useMemo(() => ({ architectureNode: ArchitectureNode, resourceGroup: ResourceGroupNode }), []);
    const nodes = useMemo(() => buildGroupedNodes(resourceNodes, edges, groupingMode), [resourceNodes, edges, groupingMode]);
    const visualGroupCount = useMemo(() => {
        if (!resourceNodes.length) {
            return 0;
        }

        if (groupingMode === 'none') {
            return 1;
        }

        return nodes.filter((node) => node.type === 'resourceGroup').length;
    }, [groupingMode, nodes, resourceNodes.length]);

    useEffect(() => {
        const nextOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const nextCloudAccountId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);

        setOrganizationId(nextOrganizationId);
        setCloudAccountId(nextCloudAccountId);
    }, []);

    const canRun = Boolean(organizationId && cloudAccountId);

    const runAssessment = useCallback(async () => {
        if (!organizationId || !cloudAccountId) {
            toast.error('Selecione organizacao e cloud account para executar o assessment.');
            return;
        }

        setRunning(true);

        try {
            const response = await fetch(
                `/api/aws/assessment/accounts/${encodeURIComponent(cloudAccountId)}?organizationId=${encodeURIComponent(organizationId)}`,
                {
                    method: 'POST',
                }
            );

            const payload = (await response.json().catch(() => null)) as AssessmentGraphPayload | { message?: string } | null;

            if (response.status === 401) {
                toast.error('Sua sessao expirou. Faca login novamente.');
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            if (!response.ok) {
                const message =
                    payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
                        ? payload.message
                        : 'Falha ao executar assessment.';
                toast.error(message);
                return;
            }

            const graph = payload && typeof payload === 'object' && 'architectureGraph' in payload ? payload.architectureGraph : undefined;
            const rawNodes = normalizeNodes(graph?.nodes);
            const nextEdges = normalizeEdges(graph?.edges);
            const nextNodes = autoLayout(rawNodes, nextEdges);

            setResourceNodes(nextNodes);
            setEdges(nextEdges);

            if (nextNodes.length === 0) {
                toast.warning('Assessment concluido, mas sem nos para exibir no grafo.');
            } else {
                toast.success('Assessment executado com sucesso.');
            }
        } catch {
            toast.error('Falha ao executar assessment.');
        } finally {
            setRunning(false);
        }
    }, [cloudAccountId, organizationId, router]);

    const subtitle = useMemo(() => {
        if (!canRun) {
            return 'Selecione uma organizacao e uma cloud account na sidebar para habilitar o assessment.';
        }

        return 'Execute o assessment para gerar e visualizar o grafo da arquitetura com React Flow.';
    }, [canRun]);

    const reorganizeGraph = useCallback(() => {
        setResourceNodes((previousNodes) => autoLayout(previousNodes, edges));
    }, [edges]);

    const downloadDiagram = useCallback(async () => {
        if (!graphWrapperRef.current || resourceNodes.length === 0) {
            return;
        }

        setDownloading(true);

        try {
            const backgroundColor = getComputedStyle(document.body).backgroundColor;
            const dataUrl = await toPng(graphWrapperRef.current, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor,
            });

            const link = document.createElement('a');
            link.download = `assessment-diagrama-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            link.href = dataUrl;
            link.click();
            toast.success('Diagrama baixado com sucesso.');
        } catch {
            toast.error('Nao foi possivel baixar o diagrama.');
        } finally {
            setDownloading(false);
        }
    }, [resourceNodes.length]);

    const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light';

    return (
        <div className="mx-auto flex w-full flex-col gap-4">
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle>AWS Assessment</CardTitle>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline">Nos: {resourceNodes.length}</Badge>
                            <Badge variant="outline">Arestas: {edges.length}</Badge>
                            <Badge variant="outline">Grupos visuais: {visualGroupCount}</Badge>
                        </div>
                    </div>
                    <CardDescription>{subtitle}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                    <Button type="button" onClick={() => void runAssessment()} isLoading={running} disabled={!canRun}>
                        <Play className="size-4" />
                        Rodar assessment
                    </Button>
                    <Button type="button" variant="outline" onClick={reorganizeGraph} disabled={resourceNodes.length === 0 || running}>
                        <LayoutGrid className="size-4" />
                        Reorganizar grafo
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void downloadDiagram()}
                        isLoading={downloading}
                        disabled={resourceNodes.length === 0}
                    >
                        <Download className="size-4" />
                        Baixar diagrama
                    </Button>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/30 p-1">
                        {GROUPING_MODE_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const selected = groupingMode === option.value;
                            return (
                                <Button
                                    key={option.value}
                                    type="button"
                                    size="sm"
                                    variant={selected ? 'default' : 'ghost'}
                                    onClick={() => setGroupingMode(option.value)}
                                    disabled={resourceNodes.length === 0 || running}
                                    className="rounded-md"
                                >
                                    <Icon className="size-4" />
                                    {option.label}
                                </Button>
                            );
                        })}
                    </div>
                    {!canRun && (
                        <Button type="button" variant="outline" onClick={() => router.push('/cloud-accounts/new')}>
                            Conectar cloud account
                        </Button>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Grafo da arquitetura</CardTitle>
                    <CardDescription>
                        Visualizacao carregada apos a execucao do assessment, com organizacao visual por tipo, VPC ou regiao.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {resourceNodes.length === 0 ? (
                        <div className="flex min-h-130 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                            Rode o assessment para montar o grafo.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="secondary">Layout automatico com Dagre</Badge>
                                <Badge variant="secondary">Node grouping: {GROUPING_MODE_OPTIONS.find((item) => item.value === groupingMode)?.label}</Badge>
                                <Badge variant="secondary">Pan e zoom habilitados</Badge>
                            </div>
                            <div
                                ref={graphWrapperRef}
                                className="h-[72vh] min-h-130 w-full overflow-hidden rounded-xl border border-border/80 bg-linear-to-b from-muted/25 to-background"
                            >
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                nodeTypes={nodeTypes}
                                colorMode={colorMode}
                                fitView
                                defaultEdgeOptions={{
                                    type: 'smoothstep',
                                    style: { stroke: 'var(--border)' },
                                    labelStyle: { fill: 'var(--muted-foreground)', fontSize: 11 },
                                }}
                            >
                                <MiniMap pannable zoomable />
                                <Controls />
                                <Background color="var(--border)" gap={20} size={1} />
                            </ReactFlow>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
