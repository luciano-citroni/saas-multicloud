import { z } from 'zod';
import type { VariableMap } from './variable-editor';

export function createExecutionParamsSchema(variables: VariableMap, fieldRequiredMessage: string) {
    const shape: Record<string, z.ZodType<string>> = {};

    for (const [name, variable] of Object.entries(variables)) {
        const required = variable.required !== false && variable.default == null;
        if (required) {
            shape[name] = z.string().trim().min(1, fieldRequiredMessage);
        } else {
            shape[name] = z.string().optional().default('');
        }
    }

    return z.object(shape);
}

export function validateExecutionParamsWithZod(
    variables: VariableMap,
    values: Record<string, string>,
    fieldRequiredMessage: string,
): { ok: true; data: Record<string, string> } | { ok: false; errors: Record<string, string> } {
    const schema = createExecutionParamsSchema(variables, fieldRequiredMessage);
    const parsed = schema.safeParse(values);
    if (parsed.success) {
        return { ok: true, data: parsed.data as Record<string, string> };
    }

    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !errors[key]) {
            errors[key] = issue.message;
        }
    }
    return { ok: false, errors };
}
