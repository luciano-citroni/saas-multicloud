export interface WorkflowNodeSnapshot {
    id: string;
    type: string;
    name: string;
    config: Record<string, unknown>;
    position?: { x: number; y: number } | null;
}

export interface WorkflowEdgeSnapshot {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
}

export interface WorkflowSnapshot {
    nodes: WorkflowNodeSnapshot[];
    edges: WorkflowEdgeSnapshot[];
    variables?: Record<string, { type: string; default?: unknown; required?: boolean; description?: string }>;
    templates?: Record<string, EmbeddedWorkflowTemplate>;
}

export interface EmbeddedWorkflowTemplate {
    templateId: string;
    version: number;
    contentHash: string;
    content: string;
    parameters: Array<{ name: string; noEcho?: boolean; required?: boolean; default?: unknown; type?: string }>;
    outputs: Array<{ name: string }>;
    resources: Array<{ logicalId: string; type: string }>;
    hasTransform: boolean;
    capabilities: string[];
}

export interface WorkflowGraph {
    nodes: WorkflowNodeSnapshot[];
    edges: WorkflowEdgeSnapshot[];
    adjacency: Map<string, string[]>;
    reverseAdjacency: Map<string, string[]>;
}
