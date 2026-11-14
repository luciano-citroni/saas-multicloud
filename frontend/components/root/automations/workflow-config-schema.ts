import { z } from 'zod';
import type { ActionDefinition, AutomationNodeInput } from '@/app/actions/automations';

function isEmptyConfigValue(value: unknown): boolean {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') {
        const binding = value as { type?: string; name?: string; nodeId?: string; field?: string };
        if (binding.type === 'VARIABLE') return !binding.name?.trim();
        if (binding.type === 'NODE_OUTPUT') return !binding.nodeId?.trim() || !binding.field?.trim();
        if (binding.type === 'EXISTING_RESOURCE') return !binding.name?.trim() && !binding.nodeId?.trim();
        return Object.keys(value as Record<string, unknown>).length === 0;
    }
    return false;
}

export function createWorkflowNodesSchema(
    actions: ActionDefinition[],
    fieldRequiredMessage: string,
) {
    const byType = new Map(actions.map((action) => [action.type, action]));

    return z.array(z.custom<AutomationNodeInput>()).superRefine((nodes, ctx) => {
        nodes.forEach((node, index) => {
            const action = byType.get(node.type);
            const fields = action?.fields ?? [];
            for (const field of fields) {
                if (!field.required) continue;
                const value = node.config?.[field.key];
                if (isEmptyConfigValue(value)) {
                    ctx.addIssue({
                        code: 'custom',
                        message: fieldRequiredMessage,
                        path: [index, 'config', field.key],
                    });
                }
            }
        });
    });
}

export function validateWorkflowNodes(
    nodes: AutomationNodeInput[],
    actions: ActionDefinition[],
    fieldRequiredMessage: string,
): { ok: true } | { ok: false; message: string; nodeId?: string; fieldKey?: string } {
    const schema = createWorkflowNodesSchema(actions, fieldRequiredMessage);
    const parsed = schema.safeParse(nodes);
    if (parsed.success) return { ok: true };

    const issue = parsed.error.issues[0];
    const nodeIndex = typeof issue?.path[0] === 'number' ? issue.path[0] : undefined;
    const fieldKey = typeof issue?.path[2] === 'string' ? issue.path[2] : undefined;
    return {
        ok: false,
        message: issue?.message ?? fieldRequiredMessage,
        nodeId: nodeIndex != null ? nodes[nodeIndex]?.id : undefined,
        fieldKey,
    };
}
