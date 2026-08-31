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
}

export interface WorkflowGraph {
    nodes: WorkflowNodeSnapshot[];
    edges: WorkflowEdgeSnapshot[];
    adjacency: Map<string, string[]>;
    reverseAdjacency: Map<string, string[]>;
}
