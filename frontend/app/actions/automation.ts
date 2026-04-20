export type ResourceType = 'ec2' | 's3' | 'rds' | 'lambda';
export type PricingModel = 'ON_DEMAND' | 'RESERVED' | 'SAVINGS';

export type FlowNodeConfig = Record<string, unknown>;

export interface FlowNode {
    id: string;
    type: ResourceType;
    label?: string;
    position?: { x: number; y: number };
    config: FlowNodeConfig;
}

export interface FlowEdge {
    id: string;
    source: string;
    target: string;
}

export interface FlowDefinition {
    nodes: FlowNode[];
    edges: FlowEdge[];
}

export interface ResourceCostEstimate {
    nodeId: string;
    type: string;
    label: string;
    region: string;
    onDemand: number;
    reserved: number;
    savings: number;
}

export interface CostEstimateResponse {
    resources: ResourceCostEstimate[];
    totals: { onDemand: number; reserved: number; savings: number };
    savingsPercent: number;
}

export interface AutomationExecution {
    id: string;
    pricingModel: PricingModel;
    totalEstimatedCost: number;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    resources: ProvisionedResource[];
    createdAt: string;
    durationMs: number | null;
}

export interface ProvisionedResource {
    id: string;
    resourceType: string;
    awsResourceId: string | null;
    region: string;
    status: 'PENDING' | 'PROVISIONED' | 'FAILED';
    estimatedCost: number;
    createdAt: string;
}

export async function estimateAutomationCost(
    flow: FlowDefinition,
    cloudAccountId: string,
    organizationId: string,
): Promise<Response> {
    return fetch(`/api/automation/estimate?organizationId=${encodeURIComponent(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow, cloudAccountId }),
        cache: 'no-store',
    });
}

export async function runAutomation(
    flow: FlowDefinition,
    pricingModel: PricingModel,
    cloudAccountId: string,
    organizationId: string,
): Promise<Response> {
    return fetch(`/api/automation/run?organizationId=${encodeURIComponent(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow, pricingModel, cloudAccountId }),
        cache: 'no-store',
    });
}

export async function fetchAutomationExecutions(organizationId: string): Promise<Response> {
    return fetch(`/api/automation/executions?organizationId=${encodeURIComponent(organizationId)}`, {
        cache: 'no-store',
    });
}
