export type AutomationWorkflowStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';
export type AutomationCloudProvider = 'AWS' | 'GCP' | 'AZURE';

export interface AutomationNodeInput {
    id: string;
    type: string;
    name: string;
    config: Record<string, unknown>;
    position?: { x: number; y: number } | null;
}

export interface AutomationEdgeInput {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
}

export interface AutomationWorkflow {
    id: string;
    tenantId: string;
    cloudAccountId: string;
    name: string;
    description: string | null;
    cloudProvider: AutomationCloudProvider;
    status: AutomationWorkflowStatus;
    version: number;
    createdBy: string | null;
    updatedBy: string | null;
    nodes: AutomationNodeInput[];
    edges: AutomationEdgeInput[];
    variables?: Record<string, { type: string; default?: unknown; required?: boolean; description?: string }>;
    createdAt: string;
    updatedAt: string;
}

export interface ActionFieldDescriptor {
    key: string;
    label: string;
    input: 'text' | 'region' | 'boolean' | 'select' | 'template' | 'resource' | 'keyValue' | 'families';
    required?: boolean;
    sensitive?: boolean;
    acceptsBinding?: boolean;
    bindingModes?: Array<'LITERAL' | 'VARIABLE' | 'NODE_OUTPUT' | 'EXISTING_RESOURCE'>;
    options?: { value: string; label: string }[];
    defaultValue?: string | number | boolean | null;
}

export interface ActionDefinition {
    type: string;
    provider: string;
    kind?: 'native' | 'cloudformation' | 'existing_resource' | 'data';
    name: string;
    category: string;
    outputFields: readonly string[];
    requiredIamActions: readonly string[];
    dynamicOutputs?: boolean;
    fields?: ActionFieldDescriptor[];
}

export interface NodeOutputReference {
    type: 'NODE_OUTPUT';
    nodeId: string;
    field: string;
}

export type ExecutionNodeStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'COMPLETED' | 'CANCELLED' | 'ROLLED_BACK';

export interface AutomationExecutionNode {
    id: string;
    executionId: string;
    nodeId: string;
    status: ExecutionNodeStatus;
    startedAt: string | null;
    finishedAt: string | null;
    input: Record<string, unknown> | null;
    output: Record<string, unknown> | null;
    error: string | null;
    resourceId: string | null;
    awsOperationId?: string | null;
}

export interface AutomationWorkflowExecution {
    id: string;
    organizationId: string;
    cloudAccountId: string;
    automationId: string | null;
    automationVersion: number | null;
    triggeredBy: string | null;
    status: ExecutionStatus;
    errorMessage: string | null;
    durationMs: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    inventorySyncStatus?: string;
    createdAt: string;
    executionNodes?: AutomationExecutionNode[];
}

function orgQuery(organizationId: string) {
    return `organizationId=${encodeURIComponent(organizationId)}`;
}

export async function fetchAutomations(organizationId: string): Promise<Response> {
    return fetch(`/api/automations?${orgQuery(organizationId)}`, { cache: 'no-store' });
}

export async function fetchAutomation(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}?${orgQuery(organizationId)}`, {
        cache: 'no-store',
    });
}

export async function createAutomation(
    organizationId: string,
    body: { name: string; description?: string; cloudAccountId: string; cloudProvider?: AutomationCloudProvider },
): Promise<Response> {
    return fetch(`/api/automations?${orgQuery(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
}

export async function updateAutomation(
    automationId: string,
    organizationId: string,
    body: {
        name?: string;
        description?: string | null;
        cloudAccountId?: string;
        nodes?: AutomationNodeInput[];
        edges?: AutomationEdgeInput[];
        variables?: AutomationWorkflow['variables'];
    },
): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}?${orgQuery(organizationId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
}

export async function deleteAutomation(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}?${orgQuery(organizationId)}`, {
        method: 'DELETE',
        cache: 'no-store',
    });
}

export async function publishAutomation(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/publish?${orgQuery(organizationId)}`, {
        method: 'POST',
        cache: 'no-store',
    });
}

export async function activateAutomation(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/activate?${orgQuery(organizationId)}`, {
        method: 'POST',
        cache: 'no-store',
    });
}

export async function deactivateAutomation(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/deactivate?${orgQuery(organizationId)}`, {
        method: 'POST',
        cache: 'no-store',
    });
}

export async function executeAutomation(
    automationId: string,
    organizationId: string,
    body: { confirm: true; clientRequestId?: string; acknowledgeCapabilities?: boolean; parameters?: Record<string, unknown> },
): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/execute?${orgQuery(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
}

export async function validateAutomation(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/validate?${orgQuery(organizationId)}`, {
        method: 'POST',
        cache: 'no-store',
    });
}

export async function planAutomation(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/plan?${orgQuery(organizationId)}`, {
        method: 'POST',
        cache: 'no-store',
    });
}

export async function cancelAutomationPlan(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/plan/cancel?${orgQuery(organizationId)}`, {
        method: 'POST',
        cache: 'no-store',
    });
}

export async function reviseAutomation(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/revise?${orgQuery(organizationId)}`, {
        method: 'POST',
        cache: 'no-store',
    });
}

export async function fetchAutomationTemplates(organizationId: string): Promise<Response> {
    return fetch(`/api/automation/templates?${orgQuery(organizationId)}`, { cache: 'no-store' });
}

export async function fetchAutomationTemplate(templateId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automation/templates/${encodeURIComponent(templateId)}?${orgQuery(organizationId)}`, { cache: 'no-store' });
}

export async function importAutomationTemplate(
    organizationId: string,
    body: { name: string; description?: string; content: string },
): Promise<Response> {
    return fetch(`/api/automation/templates?${orgQuery(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
}

export async function fetchExistingResources(
    organizationId: string,
    cloudAccountId: string,
    region: string,
    resourceType: string,
): Promise<Response> {
    const params = new URLSearchParams({ organizationId, cloudAccountId, region, resourceType });
    return fetch(`/api/automation/resources/catalog?${params.toString()}`, { cache: 'no-store' });
}

export async function duplicateAutomation(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/duplicate?${orgQuery(organizationId)}`, {
        method: 'POST',
        cache: 'no-store',
    });
}

export async function fetchAutomationExecutions(automationId: string, organizationId: string): Promise<Response> {
    return fetch(`/api/automations/${encodeURIComponent(automationId)}/executions?${orgQuery(organizationId)}`, {
        cache: 'no-store',
    });
}

export async function fetchAutomationExecution(
    automationId: string,
    executionId: string,
    organizationId: string,
): Promise<Response> {
    return fetch(
        `/api/automations/${encodeURIComponent(automationId)}/executions/${encodeURIComponent(executionId)}?${orgQuery(organizationId)}`,
        { cache: 'no-store' },
    );
}

export async function rollbackAutomationExecution(
    automationId: string,
    executionId: string,
    organizationId: string,
): Promise<Response> {
    return fetch(
        `/api/automations/${encodeURIComponent(automationId)}/executions/${encodeURIComponent(executionId)}/rollback?${orgQuery(organizationId)}`,
        { method: 'POST', cache: 'no-store' },
    );
}

export async function fetchActionCatalog(organizationId: string, provider?: AutomationCloudProvider): Promise<Response> {
    const params = new URLSearchParams({ organizationId });
    if (provider) params.set('provider', provider);
    return fetch(`/api/automation/actions?${params.toString()}`, { cache: 'no-store' });
}
