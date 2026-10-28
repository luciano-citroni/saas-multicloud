'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    addEdge,
    useEdgesState,
    useNodesState,
    useReactFlow,
    type Connection,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    Cloud,
    HardDrive,
    Settings2,
    Trash2,
    ChevronRight,
    ChevronDown,
    Layers,
    Database,
    Box,
    Server,
    Container,
    Network,
    Shield,
    Zap,
    Globe,
    Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { automationNodeTypes, type AutomationNodeData } from '@/components/root/automation/automation-nodes';
import {
    fetchAutomationTemplate,
    fetchExistingResources,
    type ActionDefinition,
    type ActionFieldDescriptor,
    type AutomationEdgeInput,
    type AutomationNodeInput,
} from '@/app/actions/automations';
import { cn } from '@/lib/utils';
import { StackCreationLine, type StackResource } from './stack-creation-line';

const ACTION_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
    AWS_S3_BUCKET_CREATE: { icon: HardDrive, color: 'bg-chart-2 text-primary-foreground' },
    AWS_CLOUDFRONT_DISTRIBUTION_CREATE: { icon: Cloud, color: 'bg-chart-4 text-primary-foreground' },
    AWS_ECS_CLUSTER_CREATE: { icon: Container, color: 'bg-chart-1 text-primary-foreground' },
    AWS_ECS_TASK_DEFINITION_CREATE: { icon: Container, color: 'bg-chart-1/90 text-primary-foreground' },
    AWS_ECR_REPOSITORY_CREATE: { icon: Box, color: 'bg-chart-2/90 text-primary-foreground' },
    AWS_LOAD_BALANCER_CREATE: { icon: Network, color: 'bg-chart-3 text-primary-foreground' },
    AWS_LAMBDA_FUNCTION_CREATE: { icon: Zap, color: 'bg-chart-5 text-primary-foreground' },
    AWS_IAM_ROLE_CREATE: { icon: Shield, color: 'bg-destructive text-destructive-foreground' },
    AWS_SECURITY_GROUP_CREATE: { icon: Shield, color: 'bg-destructive/90 text-destructive-foreground' },
    AWS_VPC_CREATE: { icon: Network, color: 'bg-primary text-primary-foreground' },
    AWS_SUBNET_CREATE: { icon: Network, color: 'bg-primary/90 text-primary-foreground' },
    AWS_ROUTE_TABLE_CREATE: { icon: Network, color: 'bg-secondary text-secondary-foreground' },
    AWS_NAT_GATEWAY_CREATE: { icon: Globe, color: 'bg-chart-3/90 text-primary-foreground' },
    AWS_RDS_INSTANCE_CREATE: { icon: Database, color: 'bg-chart-1 text-primary-foreground' },
    AWS_EC2_INSTANCE_CREATE: { icon: Server, color: 'bg-chart-4 text-primary-foreground' },
    AWS_AMPLIFY_APP_CREATE: { icon: Globe, color: 'bg-accent text-accent-foreground' },
    AWS_API_GATEWAY_CREATE: { icon: Network, color: 'bg-chart-5/90 text-primary-foreground' },
    AWS_CLOUDFORMATION_STACK: { icon: Layers, color: 'bg-primary text-primary-foreground' },
    AWS_EXISTING_RESOURCE: { icon: Database, color: 'bg-muted text-muted-foreground' },
    AWS_DATA_INPUT: { icon: Box, color: 'bg-secondary text-secondary-foreground' },
    AWS_CALLER_IDENTITY: { icon: Shield, color: 'bg-muted text-muted-foreground' },
    AWS_REFRESH_INVENTORY: { icon: Layers, color: 'bg-muted text-muted-foreground' },
};

export interface TemplateOption {
    id: string;
    name: string;
    origin?: string;
    latestVersion?: { version: number } | null;
}

type VariableMap = Record<string, { type: string; default?: unknown; required?: boolean }>;

type Props = {
    initialNodes?: AutomationNodeInput[];
    initialEdges?: AutomationEdgeInput[];
    actions: ActionDefinition[];
    templates?: TemplateOption[];
    variables?: VariableMap;
    organizationId?: string | null;
    cloudAccountId?: string;
    onChange: (nodes: AutomationNodeInput[], edges: AutomationEdgeInput[]) => void;
    readOnly?: boolean;
};

export function WorkflowAutomationBuilder(props: Props) {
    return (
        <ReactFlowProvider>
            <BuilderCanvas {...props} />
        </ReactFlowProvider>
    );
}

function defaultConfig(action: ActionDefinition | undefined): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const field of action?.fields ?? []) {
        if (field.input === 'families') {
            const raw = field.defaultValue;
            config[field.key] = Array.isArray(raw) ? raw : raw ? [String(raw)] : field.options?.[0] ? [field.options[0].value] : [];
            continue;
        }
        if (field.defaultValue !== undefined) config[field.key] = field.defaultValue;
        else if (field.input === 'boolean') config[field.key] = false;
        else if (field.input === 'keyValue') config[field.key] = {};
        else if (field.bindingModes?.length === 1 && field.bindingModes[0] === 'NODE_OUTPUT') {
            config[field.key] = { type: 'NODE_OUTPUT', nodeId: '', field: '' };
        } else config[field.key] = '';
    }
    if (action?.type === 'AWS_CLOUDFRONT_DISTRIBUTION_CREATE') {
        config.origin = { type: 'NODE_OUTPUT', nodeId: '', field: 'bucketDomainName' };
        config.enabled = true;
        config.priceClass = 'PriceClass_100';
    }
    return config;
}

function BuilderCanvas({
    initialNodes = [],
    initialEdges = [],
    actions,
    templates = [],
    variables = {},
    organizationId,
    cloudAccountId,
    onChange,
    readOnly = false,
}: Props) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [blockSearch, setBlockSearch] = useState('');
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
    const initialized = useRef(false);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const { screenToFlowPosition } = useReactFlow();

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        if (initialNodes.length === 0) return;
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
        setEdges(initialEdges.map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId })));
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    useEffect(() => {
        onChangeRef.current(
            nodes.map((node) => {
                const data = node.data as AutomationNodeData;
                return { id: node.id, type: data.resourceType, name: data.label || data.resourceType, position: node.position, config: data.config };
            }),
            edges.map((edge) => ({ id: edge.id, sourceNodeId: edge.source, targetNodeId: edge.target })),
        );
    }, [nodes, edges]);

    const addNode = useCallback(
        (type: string, name: string, position?: { x: number; y: number }) => {
            if (readOnly) return;
            const action = actions.find((item) => item.type === type);
            const id = crypto.randomUUID();
            setNodes((current) => [
                ...current,
                {
                    id,
                    type: 'automationResource',
                    position: position ?? { x: 80 + current.length * 40, y: 120 + current.length * 24 },
                    data: { label: name, resourceType: type, configured: false, config: defaultConfig(action) } satisfies AutomationNodeData,
                },
            ]);
            setSelectedNodeId(id);
        },
        [actions, readOnly, setNodes],
    );

    const updateConfig = useCallback(
        (key: string, value: unknown) => {
            if (!selectedNodeId || readOnly) return;
            setNodes((current) =>
                current.map((node) => {
                    if (node.id !== selectedNodeId) return node;
                    const data = node.data as AutomationNodeData;
                    const config = { ...data.config, [key]: value };
                    const label = (key === 'bucketName' || key === 'stackName') && typeof value === 'string' && value ? value : data.label;
                    return { ...node, data: { ...data, config, label, configured: true } };
                }),
            );
        },
        [readOnly, selectedNodeId, setNodes],
    );

    const selected = nodes.find((node) => node.id === selectedNodeId);
    const selectedAction = actions.find((action) => action.type === (selected?.data as AutomationNodeData | undefined)?.resourceType);
    const categoryOrder = ['Compute', 'Containers', 'Networking', 'Storage', 'Database', 'CDN', 'Frontend', 'Security', 'Template', 'Referência', 'Dados', 'Operação'];
    const search = blockSearch.trim().toLowerCase();
    const filteredActions = actions.filter((action) => {
        if (!search) return true;
        return (
            action.name.toLowerCase().includes(search) ||
            action.type.toLowerCase().includes(search) ||
            action.category.toLowerCase().includes(search)
        );
    });
    const actionsByCategory = filteredActions.reduce<Record<string, ActionDefinition[]>>((acc, action) => {
        const category = action.category || 'Outros';
        (acc[category] ??= []).push(action);
        return acc;
    }, {});
    const orderedCategories = Object.keys(actionsByCategory).sort((left, right) => {
        const leftIndex = categoryOrder.indexOf(left);
        const rightIndex = categoryOrder.indexOf(right);
        if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
    });

    return (
        <div className="flex h-[70vh] min-h-[520px] overflow-hidden rounded-xl border">
            {!readOnly && (
                <div className="flex w-64 shrink-0 flex-col border-r bg-muted/30">
                    <div className="sticky top-0 z-10 space-y-2 border-b bg-muted/30 p-3 backdrop-blur">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocos</p>
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                className="h-8 pl-8 text-xs"
                                placeholder="Buscar recurso ou ação…"
                                value={blockSearch}
                                onChange={(event) => setBlockSearch(event.target.value)}
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            {filteredActions.length} de {actions.length} blocos
                        </p>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                        {actions.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">Nenhum bloco disponível para este provedor.</p>
                        ) : filteredActions.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">Nenhum bloco corresponde à busca.</p>
                        ) : (
                            orderedCategories.map((category) => {
                                const categoryActions = actionsByCategory[category] ?? [];
                                const collapsed = collapsedCategories[category] === true && !search;
                                return (
                                    <div key={category} className="space-y-1.5">
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-left hover:bg-muted"
                                            onClick={() =>
                                                setCollapsedCategories((current) => ({
                                                    ...current,
                                                    [category]: !current[category],
                                                }))
                                            }
                                        >
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                {category}
                                                <span className="ml-1 text-muted-foreground/70">({categoryActions.length})</span>
                                            </span>
                                            {collapsed ? (
                                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                            )}
                                        </button>
                                        {!collapsed &&
                                            categoryActions.map((action) => {
                                                const meta = ACTION_ICONS[action.type] ?? { icon: Cloud, color: 'bg-muted text-muted-foreground' };
                                                const Icon = meta.icon;
                                                return (
                                                    <button
                                                        key={action.type}
                                                        type="button"
                                                        draggable
                                                        onDragStart={(event) => {
                                                            event.dataTransfer.setData('application/automation-action', action.type);
                                                            event.dataTransfer.setData('application/automation-name', action.name);
                                                            event.dataTransfer.effectAllowed = 'move';
                                                        }}
                                                        onClick={() => addNode(action.type, action.name)}
                                                        className="flex w-full cursor-grab items-center gap-2.5 rounded-lg border bg-background p-2.5 text-left shadow-sm hover:border-primary"
                                                    >
                                                        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.color)}>
                                                            <Icon className="h-4 w-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-semibold">{action.name}</p>
                                                            <p className="truncate text-[10px] text-muted-foreground">
                                                                {action.kind ?? 'native'}
                                                            </p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            <div className="min-w-0 flex-1">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={readOnly ? undefined : onNodesChange}
                    onEdgesChange={readOnly ? undefined : onEdgesChange}
                    onConnect={(connection: Connection) => {
                        if (readOnly || !connection.source || connection.source === connection.target) return;
                        setEdges((current) => addEdge({ ...connection, id: crypto.randomUUID() }, current));
                    }}
                    onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                        event.preventDefault();
                        const type = event.dataTransfer.getData('application/automation-action');
                        const name = event.dataTransfer.getData('application/automation-name');
                        if (!type) return;
                        addNode(type, name || type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
                    }}
                    onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
                    onPaneClick={() => setSelectedNodeId(null)}
                    nodeTypes={automationNodeTypes}
                    defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
                    deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
                    fitView
                    nodesDraggable={!readOnly}
                    nodesConnectable={!readOnly}
                    elementsSelectable
                    className="bg-background"
                >
                    <Background gap={16} />
                    <Controls />
                </ReactFlow>
            </div>

            {selected && !readOnly && (
                <div
                    className={cn(
                        'flex shrink-0 flex-col border-l',
                        (selected.data as AutomationNodeData).resourceType === 'AWS_CLOUDFORMATION_STACK' ? 'w-[28rem]' : 'w-80',
                    )}
                >
                    <div className="flex items-center justify-between border-b px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold">Propriedades</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setNodes((current) => current.filter((node) => node.id !== selected.id));
                                setEdges((current) => current.filter((edge) => edge.source !== selected.id && edge.target !== selected.id));
                                setSelectedNodeId(null);
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-3">
                        {(selectedAction?.fields ?? [])
                            .filter((field) => !(field.key === 'parameters' && (selectedAction?.fields ?? []).some((item) => item.input === 'template')))
                            .map((field) => (
                            <FieldEditor
                                key={field.key}
                                field={field}
                                value={(selected.data as AutomationNodeData).config[field.key]}
                                nodes={nodes}
                                edges={edges}
                                nodeId={selected.id}
                                actions={actions}
                                variables={variables}
                                templates={templates}
                                organizationId={organizationId}
                                cloudAccountId={cloudAccountId}
                                onChange={(value) => updateConfig(field.key, value)}
                                onPatch={(patch) => {
                                    setNodes((current) =>
                                        current.map((node) => {
                                            if (node.id !== selected.id) return node;
                                            const data = node.data as AutomationNodeData;
                                            return { ...node, data: { ...data, config: { ...data.config, ...patch }, configured: true } };
                                        }),
                                    );
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {!selected && nodes.length > 0 && !readOnly && (
                <div className="flex w-48 shrink-0 flex-col items-center justify-center gap-2 border-l bg-muted/20 text-center">
                    <ChevronRight className="h-6 w-6 text-muted-foreground" />
                    <p className="px-4 text-xs text-muted-foreground">Arraste um bloco e conecte as dependências</p>
                </div>
            )}
        </div>
    );
}

type AssessmentResource = { id: string; name: string; detail?: string; vpcId?: string };

function assessmentForParameter(parameter: { name: string; type?: string }): { resourceType: string; multiple: boolean; field: 'id' | 'name' | 'detail' } | null {
    const parameterType = parameter.type ?? '';
    const byType: Record<string, { resourceType: string; multiple: boolean }> = {
        'AWS::EC2::VPC::Id': { resourceType: 'vpc', multiple: false },
        'AWS::EC2::Subnet::Id': { resourceType: 'subnet', multiple: false },
        'List<AWS::EC2::Subnet::Id>': { resourceType: 'subnet', multiple: true },
        'AWS::EC2::SecurityGroup::Id': { resourceType: 'security_group', multiple: false },
        'List<AWS::EC2::SecurityGroup::Id>': { resourceType: 'security_group', multiple: true },
    };
    if (byType[parameterType]) return { ...byType[parameterType], field: 'id' };
    const byName: Record<string, { resourceType: string; field: 'id' | 'name' | 'detail' }> = {
        ExistingClusterName: { resourceType: 'ecs_cluster', field: 'name' },
        ExistingRepositoryUri: { resourceType: 'ecr_repository', field: 'detail' },
        ExecutionRoleArn: { resourceType: 'iam_role', field: 'id' },
        TaskRoleArn: { resourceType: 'iam_role', field: 'id' },
        SecretArn: { resourceType: 'secret', field: 'id' },
    };
    const named = byName[parameter.name];
    return named ? { ...named, multiple: false } : null;
}

function assessmentValue(resource: AssessmentResource, field: 'id' | 'name' | 'detail'): string {
    if (field === 'name') return resource.name;
    if (field === 'detail') return resource.detail ?? resource.id;
    return resource.id;
}

function AssessmentParameter({
    label,
    sensitive,
    multiple,
    resourceType,
    field,
    value,
    region,
    vpcId,
    organizationId,
    cloudAccountId,
    onChange,
}: {
    label: string;
    sensitive?: boolean;
    multiple: boolean;
    resourceType: string;
    field: 'id' | 'name' | 'detail';
    value: unknown;
    region: string;
    vpcId?: string;
    organizationId?: string | null;
    cloudAccountId?: string;
    onChange: (value: unknown) => void;
}) {
    const [options, setOptions] = useState<AssessmentResource[]>([]);

    useEffect(() => {
        if (!organizationId || !cloudAccountId || !region) return;
        void fetchExistingResources(organizationId, cloudAccountId, region, resourceType)
            .then((response) => response.json())
            .then((body) => {
                const items = Array.isArray(body) ? body : body?.items;
                setOptions(Array.isArray(items) ? items : []);
            })
            .catch(() => setOptions([]));
    }, [organizationId, cloudAccountId, region, resourceType]);

    const visible = vpcId ? options.filter((item) => !item.vpcId || item.vpcId === vpcId) : options;
    const current = typeof value === 'string' ? value : '';
    const selected = new Set(current.split(',').map((item) => item.trim()).filter(Boolean));

    if (visible.length === 0) {
        return (
            <div className="space-y-1">
                <Label className="text-xs">{label}{sensitive ? ' · sensível' : ''}</Label>
                <p className="text-[10px] text-muted-foreground">Nenhum dado do assessment para {resourceType}</p>
                <Input className="h-8 text-xs" type={sensitive ? 'password' : 'text'} value={current} onChange={(event) => onChange(event.target.value)} />
            </div>
        );
    }

    if (multiple) {
        return (
            <div className="space-y-1">
                <Label className="text-xs">{label} · assessment</Label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded border p-2">
                    {visible.map((resource) => {
                        const optionValue = assessmentValue(resource, field);
                        if (!optionValue) return null;
                        return (
                            <label key={resource.id} className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={selected.has(optionValue)}
                                    onChange={(event) => {
                                        const next = new Set(selected);
                                        if (event.target.checked) next.add(optionValue);
                                        else next.delete(optionValue);
                                        onChange([...next].join(','));
                                    }}
                                />
                                <span>{resource.name}{resource.detail ? ` · ${resource.detail}` : ''}</span>
                            </label>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <Label className="text-xs">{label} · assessment{sensitive ? ' · sensível' : ''}</Label>
            <Select value={current || undefined} onValueChange={onChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione do assessment" /></SelectTrigger>
                <SelectContent>
                    {visible.map((resource) => {
                        const optionValue = assessmentValue(resource, field);
                        if (!optionValue) return null;
                        return (
                            <SelectItem key={resource.id} value={optionValue} className="text-xs">
                                {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                            </SelectItem>
                        );
                    })}
                </SelectContent>
            </Select>
        </div>
    );
}

function FieldEditor({
    field,
    value,
    nodes,
    edges,
    nodeId,
    actions,
    variables,
    templates,
    organizationId,
    cloudAccountId,
    onChange,
    onPatch,
}: {
    field: ActionFieldDescriptor;
    value: unknown;
    nodes: Node[];
    edges: Edge[];
    nodeId: string;
    actions: ActionDefinition[];
    variables: VariableMap;
    templates: TemplateOption[];
    organizationId?: string | null;
    cloudAccountId?: string;
    onChange: (value: unknown) => void;
    onPatch: (patch: Record<string, unknown>) => void;
}) {
    const [templateParameters, setTemplateParameters] = useState<Array<{ name: string; type?: string; description?: string; default?: unknown; required?: boolean; noEcho?: boolean; allowedValues?: unknown[] }>>([]);
    const [templateResources, setTemplateResources] = useState<StackResource[]>([]);
    const [resources, setResources] = useState<AssessmentResource[]>([]);
    const region = String((nodes.find((node) => node.id === nodeId)?.data as AutomationNodeData | undefined)?.config.region ?? '');
    const selectedResourceType = String((nodes.find((node) => node.id === nodeId)?.data as AutomationNodeData | undefined)?.config.resourceType ?? '');

    useEffect(() => {
        if (field.input !== 'resource' || !organizationId || !cloudAccountId || !region || !selectedResourceType) return;
        void fetchExistingResources(organizationId, cloudAccountId, region, selectedResourceType)
            .then((response) => response.json())
            .then((body) => {
                const items = Array.isArray(body) ? body : body?.items;
                setResources(Array.isArray(items) ? items : []);
            })
            .catch(() => setResources([]));
    }, [field.input, organizationId, cloudAccountId, region, selectedResourceType]);

    useEffect(() => {
        if (field.input !== 'template') return;
        if (!organizationId || typeof value !== 'string' || !value) {
            setTemplateParameters((current) => (current.length === 0 ? current : []));
            setTemplateResources((current) => (current.length === 0 ? current : []));
            return;
        }
        void fetchAutomationTemplate(value, organizationId)
            .then((response) => response.json())
            .then((body) => {
                const version = body?.versions?.[0];
                setTemplateParameters(version?.parameters ?? []);
                setTemplateResources(Array.isArray(version?.resources) ? version.resources : []);
                onPatch({
                    templateVersion: version?.version,
                    declaredOutputs: (version?.outputs ?? []).map((output: { name: string }) => output.name),
                });
            })
            .catch(() => {
                setTemplateParameters([]);
                setTemplateResources([]);
            });
    }, [field.input, organizationId, value]);

    if (field.input === 'boolean') {
        return (
            <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
                {field.label}
            </label>
        );
    }

    if (field.input === 'region' || field.input === 'select') {
        if (field.acceptsBinding && value && typeof value === 'object') {
            return (
                <BindingControl
                    label={field.label}
                    modes={field.bindingModes}
                    value={value}
                    nodes={nodes}
                    edges={edges}
                    nodeId={nodeId}
                    actions={actions}
                    variables={variables}
                    onChange={onChange}
                />
            );
        }
        return (
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <Label className="text-xs">{field.label}</Label>
                    {field.acceptsBinding && (
                        <button type="button" className="text-[10px] text-primary" onClick={() => onChange({ type: 'VARIABLE', name: Object.keys(variables)[0] ?? '' })}>
                            Vincular
                        </button>
                    )}
                </div>
                <Select value={value ? String(value) : undefined} onValueChange={onChange}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {(field.options ?? []).map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        );
    }

    if (field.input === 'template') {
        return (
            <div className="space-y-2">
                <Label className="text-xs">{field.label}</Label>
                <Select value={value ? String(value) : undefined} onValueChange={onChange}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                        {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id} className="text-xs">
                                {template.name}{template.origin === 'PLATFORM' ? ' · plataforma' : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <StackCreationLine
                    resources={templateResources}
                    parameters={{
                        ...Object.fromEntries(templateParameters.map((parameter) => [parameter.name, parameter.default ?? ''])),
                        ...(((nodes.find((node) => node.id === nodeId)?.data as AutomationNodeData | undefined)?.config.parameters as Record<string, unknown>) ?? {}),
                    }}
                />
                {templateParameters.map((parameter) => {
                    const current = nodes.find((node) => node.id === nodeId)?.data as AutomationNodeData | undefined;
                    const parameters = (current?.config.parameters as Record<string, unknown>) ?? {};
                    const parameterValue = parameters[parameter.name] ?? parameter.default ?? '';
                    const assessment = assessmentForParameter(parameter);
                    const region = typeof current?.config.region === 'string' ? current.config.region : '';
                    const vpcId = typeof parameters.VpcId === 'string' ? parameters.VpcId : undefined;
                    const isBinding = Boolean(parameterValue && typeof parameterValue === 'object');
                    if (assessment && !isBinding) {
                        return (
                            <AssessmentParameter
                                key={parameter.name}
                                label={parameter.name}
                                sensitive={parameter.noEcho}
                                multiple={assessment.multiple}
                                resourceType={assessment.resourceType}
                                field={assessment.field}
                                value={parameterValue}
                                region={region}
                                vpcId={assessment.resourceType === 'subnet' || assessment.resourceType === 'security_group' ? vpcId : undefined}
                                organizationId={organizationId}
                                cloudAccountId={cloudAccountId}
                                onChange={(binding) => onPatch({ parameters: { ...parameters, [parameter.name]: binding } })}
                            />
                        );
                    }
                    return (
                    <BindingControl
                        key={parameter.name}
                        label={parameter.name}
                        sensitive={parameter.noEcho}
                        value={parameterValue}
                        nodes={nodes}
                        edges={edges}
                        nodeId={nodeId}
                        actions={actions}
                        variables={variables}
                        onChange={(binding) => {
                            onPatch({ parameters: { ...parameters, [parameter.name]: binding } });
                        }}
                    />
                    );
                })}
            </div>
        );
    }

    if (field.input === 'resource') {
        return (
            <div className="space-y-1">
                <Label className="text-xs">{field.label} · assessment</Label>
                {resources.length > 0 ? (
                    <Select value={value ? String(value) : undefined} onValueChange={onChange}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione do assessment" /></SelectTrigger>
                        <SelectContent>
                            {resources.map((resource) => (
                                <SelectItem key={resource.id} value={resource.id} className="text-xs">
                                    {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Input className="h-8 text-xs" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} placeholder="Nenhum dado do assessment" />
                )}
            </div>
        );
    }

    if (field.input === 'families') {
        const selectedValues = Array.isArray(value) ? value.map(String) : [];
        return (
            <div className="space-y-1">
                <Label className="text-xs">{field.label}</Label>
                {(field.options ?? []).map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={selectedValues.includes(option.value)}
                            onChange={(event) => {
                                const next = event.target.checked
                                    ? [...selectedValues, option.value]
                                    : selectedValues.filter((item) => item !== option.value);
                                onChange(next);
                            }}
                        />
                        {option.label}
                    </label>
                ))}
            </div>
        );
    }

    if (field.input === 'keyValue') {
        const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
        const entries = Object.entries(record);
        return (
            <div className="space-y-2">
                <Label className="text-xs">{field.label}</Label>
                {entries.map(([key, entry]) => (
                    <div key={key} className="flex gap-1">
                        <Input className="h-8 text-xs" value={key} readOnly />
                        <Input
                            className="h-8 text-xs"
                            value={typeof entry === 'string' ? entry : ''}
                            onChange={(event) => onChange({ ...record, [key]: event.target.value })}
                        />
                        <button type="button" className="text-xs text-muted-foreground" onClick={() => {
                            const next = { ...record };
                            delete next[key];
                            onChange(next);
                        }}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="text-xs text-primary"
                    onClick={() => {
                        const key = `valor${entries.length + 1}`;
                        onChange({ ...record, [key]: '' });
                    }}
                >
                    Adicionar valor
                </button>
            </div>
        );
    }

    if (field.acceptsBinding) {
        return (
            <BindingControl
                label={field.label}
                modes={field.bindingModes}
                value={value}
                nodes={nodes}
                edges={edges}
                nodeId={nodeId}
                actions={actions}
                variables={variables}
                onChange={(binding) => onChange(binding)}
            />
        );
    }

    return (
        <div className="space-y-1">
            <Label className="text-xs">{field.label}</Label>
            <Input className="h-8 text-xs" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}

function existingResourceTypesFromCatalog(actions: ActionDefinition[]): string[] {
    const existing = actions.find((action) => action.type === 'AWS_EXISTING_RESOURCE' || action.kind === 'existing_resource');
    const options = existing?.fields?.find((field) => field.key === 'resourceType')?.options ?? [];
    return options.map((option) => option.value);
}

function outputFieldsFor(node: Node, actions: ActionDefinition[]): string[] {
    const data = node.data as AutomationNodeData;
    const action = actions.find((item) => item.type === data.resourceType);
    const declared = Array.isArray(data.config.declaredOutputs) ? data.config.declaredOutputs.filter((item): item is string => typeof item === 'string') : [];
    const values = data.config.values;
    const valueKeys = values && typeof values === 'object' && !Array.isArray(values) ? Object.keys(values as Record<string, unknown>) : [];
    return [...(action?.outputFields ?? []), ...declared, ...valueKeys];
}

function BindingControl({
    label,
    modes = ['LITERAL', 'VARIABLE', 'NODE_OUTPUT', 'EXISTING_RESOURCE'],
    value,
    nodes,
    edges,
    nodeId,
    actions,
    variables,
    sensitive,
    onChange,
}: {
    label: string;
    modes?: Array<'LITERAL' | 'VARIABLE' | 'NODE_OUTPUT' | 'EXISTING_RESOURCE'>;
    value: unknown;
    nodes: Node[];
    edges: Edge[];
    nodeId: string;
    actions: ActionDefinition[];
    variables: VariableMap;
    sensitive?: boolean;
    onChange: (value: unknown) => void;
}) {
    const binding = value && typeof value === 'object' && 'type' in (value as object)
        ? (value as { type: string; name?: string; nodeId?: string; field?: string; value?: unknown; resourceType?: string; resourceId?: string })
        : null;
    const mode = binding?.type ?? 'LITERAL';
    const upstreamIds = new Set(edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source));
    const upstream = nodes.filter((node) => upstreamIds.has(node.id));
    const selectedUpstream = upstream.find((node) => node.id === binding?.nodeId);
    const upstreamFields = selectedUpstream ? outputFieldsFor(selectedUpstream, actions) : [];
    const existingResourceTypes = existingResourceTypesFromCatalog(actions);
    const defaultExistingType = existingResourceTypes[0] ?? 'vpc';

    return (
        <div className="space-y-1">
            <Label className="text-xs">{label}{sensitive ? ' · sensível' : ''}</Label>
            <Select
                value={mode}
                onValueChange={(next) => {
                    if (next === 'LITERAL') onChange('');
                    if (next === 'VARIABLE') onChange({ type: 'VARIABLE', name: Object.keys(variables)[0] ?? '' });
                    if (next === 'NODE_OUTPUT') {
                        const source = upstream[0];
                        const fields = source ? outputFieldsFor(source, actions) : [];
                        onChange({ type: 'NODE_OUTPUT', nodeId: source?.id ?? '', field: fields[0] ?? '' });
                    }
                    if (next === 'EXISTING_RESOURCE') onChange({ type: 'EXISTING_RESOURCE', resourceType: defaultExistingType, resourceId: '' });
                }}
            >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {modes.includes('LITERAL') && <SelectItem value="LITERAL" className="text-xs">Valor fixo</SelectItem>}
                    {modes.includes('VARIABLE') && <SelectItem value="VARIABLE" className="text-xs">Variável</SelectItem>}
                    {modes.includes('NODE_OUTPUT') && <SelectItem value="NODE_OUTPUT" className="text-xs">Saída de bloco</SelectItem>}
                    {modes.includes('EXISTING_RESOURCE') && <SelectItem value="EXISTING_RESOURCE" className="text-xs">Recurso existente</SelectItem>}
                </SelectContent>
            </Select>
            {mode === 'LITERAL' && (
                <Input
                    className="h-8 text-xs"
                    type={sensitive ? 'password' : 'text'}
                    value={binding ? String(binding.value ?? '') : String(value ?? '')}
                    onChange={(event) => onChange(event.target.value)}
                />
            )}
            {mode === 'VARIABLE' && (
                Object.keys(variables).length > 0 ? (
                    <Select value={binding?.name || undefined} onValueChange={(name) => onChange({ type: 'VARIABLE', name })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Variável" /></SelectTrigger>
                        <SelectContent>
                            {Object.keys(variables).map((name) => (
                                <SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <p className="text-[10px] text-muted-foreground">Crie uma variável no detalhe da automação</p>
                )
            )}
            {mode === 'NODE_OUTPUT' && (
                <>
                    <Select
                        value={binding?.nodeId || undefined}
                        onValueChange={(sourceId) => {
                            const source = upstream.find((node) => node.id === sourceId);
                            const fields = source ? outputFieldsFor(source, actions) : [];
                            onChange({ type: 'NODE_OUTPUT', nodeId: sourceId, field: fields[0] ?? binding?.field ?? '' });
                        }}
                    >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Bloco anterior" /></SelectTrigger>
                        <SelectContent>
                            {upstream.map((node) => (
                                <SelectItem key={node.id} value={node.id} className="text-xs">{(node.data as AutomationNodeData).label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {upstreamFields.length > 0 ? (
                        <Select
                            value={binding?.field || undefined}
                            onValueChange={(field) => onChange({ type: 'NODE_OUTPUT', nodeId: binding?.nodeId ?? '', field })}
                        >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Campo" /></SelectTrigger>
                            <SelectContent>
                                {upstreamFields.map((field) => (
                                    <SelectItem key={field} value={field} className="text-xs">{field}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Input
                            className="h-8 text-xs"
                            placeholder="Campo de saída"
                            value={binding?.field ?? ''}
                            onChange={(event) => onChange({ type: 'NODE_OUTPUT', nodeId: binding?.nodeId ?? '', field: event.target.value })}
                        />
                    )}
                </>
            )}
            {mode === 'EXISTING_RESOURCE' && (
                <>
                    <Select
                        value={binding?.resourceType || defaultExistingType}
                        onValueChange={(resourceType) => onChange({ type: 'EXISTING_RESOURCE', resourceType, resourceId: binding?.resourceId ?? '' })}
                    >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {existingResourceTypes.map((resourceType) => (
                                <SelectItem key={resourceType} value={resourceType} className="text-xs">{resourceType}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        className="h-8 text-xs"
                        placeholder="Id ou ARN"
                        value={binding?.resourceId ?? ''}
                        onChange={(event) => onChange({ type: 'EXISTING_RESOURCE', resourceType: binding?.resourceType ?? defaultExistingType, resourceId: event.target.value })}
                    />
                </>
            )}
        </div>
    );
}
