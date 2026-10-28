import { z } from 'zod';

export const VARIABLE_TYPES = ['string', 'number', 'boolean', 'list', 'object', 'resource_ref', 'sensitive'] as const;

export const automationVariableSchema = z.object({
    type: z.enum(VARIABLE_TYPES),
    default: z.unknown().optional(),
    required: z.boolean().optional().default(false),
    description: z.string().max(500).optional(),
    sensitive: z.boolean().optional().default(false),
});

export const automationVariablesSchema = z.record(z.string().min(1), automationVariableSchema);

export type AutomationVariable = z.infer<typeof automationVariableSchema>;

export const literalBindingSchema = z.object({
    type: z.literal('LITERAL'),
    value: z.unknown(),
});

export const variableBindingSchema = z.object({
    type: z.literal('VARIABLE'),
    name: z.string().min(1),
});

export const nodeOutputReferenceSchema = z.object({
    type: z.literal('NODE_OUTPUT'),
    nodeId: z.string().min(1),
    field: z.string().min(1),
});

export const existingResourceBindingSchema = z.object({
    type: z.literal('EXISTING_RESOURCE'),
    resourceType: z.string().min(1),
    resourceId: z.string().min(1),
});

export const valueBindingSchema = z.discriminatedUnion('type', [
    literalBindingSchema,
    variableBindingSchema,
    nodeOutputReferenceSchema,
    existingResourceBindingSchema,
]);

export type ValueBinding = z.infer<typeof valueBindingSchema>;

export function walkBindings(value: unknown, visit: (binding: ValueBinding) => void): void {
    const parsed = valueBindingSchema.safeParse(value);
    if (parsed.success) {
        visit(parsed.data);
        if (parsed.data.type === 'LITERAL') {
            walkBindings(parsed.data.value, visit);
        }
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => walkBindings(item, visit));
        return;
    }

    if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach((child) => walkBindings(child, visit));
    }
}

export function collectNodeOutputReferences(value: unknown): Array<{ nodeId: string; field: string }> {
    const refs: Array<{ nodeId: string; field: string }> = [];
    walkBindings(value, (binding) => {
        if (binding.type === 'NODE_OUTPUT') {
            refs.push({ nodeId: binding.nodeId, field: binding.field });
        }
    });
    return refs;
}

export function collectVariableNames(value: unknown): string[] {
    const names: string[] = [];
    walkBindings(value, (binding) => {
        if (binding.type === 'VARIABLE') names.push(binding.name);
    });
    return names;
}

export function hasRuntimeOutputBinding(value: unknown): boolean {
    let found = false;
    walkBindings(value, (binding) => {
        if (binding.type === 'NODE_OUTPUT') found = true;
    });
    return found;
}

const SENSITIVE_KEY = /password|secretvalue|clientsecret|sessiontoken/i;

export function redactSensitive(value: unknown, sensitiveKeys: Set<string>): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => redactSensitive(item, sensitiveKeys));
    }

    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            if (sensitiveKeys.has(key) || SENSITIVE_KEY.test(key)) {
                result[key] = '[REDACTED]';
            } else {
                result[key] = redactSensitive(child, sensitiveKeys);
            }
        }
        return result;
    }

    return value;
}

export function sensitiveVariableNames(variables: Record<string, { type?: string; sensitive?: boolean }> | undefined): Set<string> {
    const names = new Set<string>();
    for (const [name, variable] of Object.entries(variables ?? {})) {
        if (variable?.type === 'sensitive' || variable?.sensitive === true) names.add(name);
    }
    return names;
}

export const TEMPLATE_BODY_LIMIT = 51_200;

export const SUCCESSFUL_STACK_STATUSES = new Set(['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'IMPORT_COMPLETE']);

export const TERMINAL_STACK_STATUSES = new Set([
    ...SUCCESSFUL_STACK_STATUSES,
    'CREATE_FAILED',
    'ROLLBACK_COMPLETE',
    'ROLLBACK_FAILED',
    'UPDATE_FAILED',
    'UPDATE_ROLLBACK_COMPLETE',
    'UPDATE_ROLLBACK_FAILED',
    'IMPORT_ROLLBACK_COMPLETE',
    'IMPORT_ROLLBACK_FAILED',
    'DELETE_COMPLETE',
    'DELETE_FAILED',
]);

export function isSuccessfulStackStatus(status: string | undefined): boolean {
    return SUCCESSFUL_STACK_STATUSES.has(status ?? '');
}

export function isTerminalStackStatus(status: string | undefined): boolean {
    return TERMINAL_STACK_STATUSES.has(status ?? '');
}

export function buildStackName(requested: string, automationId: string): string {
    const base = requested.replace(/[^A-Za-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    const suffix = automationId.replace(/-/g, '').slice(0, 8);
    const name = `smc-${base || 'stack'}-${suffix}`.slice(0, 128);
    return /^[A-Za-z]/.test(name) ? name : `s${name}`.slice(0, 128);
}

export function detectCapabilities(resourceTypes: string[], hasTransform: boolean): string[] {
    const capabilities: string[] = [];
    if (resourceTypes.some((type) => type.startsWith('AWS::IAM::'))) {
        capabilities.push('CAPABILITY_NAMED_IAM');
    }
    if (hasTransform) capabilities.push('CAPABILITY_AUTO_EXPAND');
    return capabilities;
}

export function templateVisibleToTenant(template: { tenantId: string | null }, tenantId: string): boolean {
    return template.tenantId === null || template.tenantId === tenantId;
}

export function resolveIdempotentSlot(existing: boolean, hasActive: boolean): 'reuse' | 'blocked' | 'proceed' {
    if (existing) return 'reuse';
    if (hasActive) return 'blocked';
    return 'proceed';
}
