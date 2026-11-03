import { z } from 'zod';
import { AutomationCloudProvider } from '../db/entites/automation.entity';
import { nodeOutputReferenceSchema, automationVariablesSchema } from './bindings';

export const automationNodeInputSchema = z.object({
    id: z.string().uuid(),
    type: z.string().min(1),
    name: z.string().min(1).max(255),
    config: z.record(z.unknown()),
    position: z.object({ x: z.number(), y: z.number() }).optional().nullable(),
});

export const automationEdgeInputSchema = z.object({
    id: z.string().uuid(),
    sourceNodeId: z.string().uuid(),
    targetNodeId: z.string().uuid(),
});

export const listAutomationsQuerySchema = z.object({
    /** Mid-organization (Organização) — filters via cloud_accounts.organization_id */
    midOrgId: z.string().uuid().optional(),
});

export type ListAutomationsQueryDto = z.infer<typeof listAutomationsQuerySchema>;

export const createAutomationSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional().nullable(),
    cloudAccountId: z.string().uuid(),
    cloudProvider: z.nativeEnum(AutomationCloudProvider).optional().default(AutomationCloudProvider.AWS),
});

export const updateAutomationSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional().nullable(),
    cloudAccountId: z.string().uuid().optional(),
    nodes: z.array(automationNodeInputSchema).optional(),
    edges: z.array(automationEdgeInputSchema).optional(),
    variables: automationVariablesSchema.optional(),
});

export const automationIdParamSchema = z.object({
    id: z.string().uuid(),
});

export const automationExecutionParamSchema = z.object({
    id: z.string().uuid(),
    executionId: z.string().uuid(),
});

export const executeAutomationSchema = z.object({
    confirm: z.literal(true),
    clientRequestId: z.string().min(8).max(80).optional(),
    acknowledgeCapabilities: z.boolean().optional().default(false),
    parameters: z.record(z.string(), z.unknown()).optional(),
    cloudAccountId: z.string().uuid().optional(),
});

export const rollbackAutomationSchema = z.object({
    confirm: z.literal(true),
});

export const planAutomationSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        cloudAccountId: z.string().uuid().optional(),
    }),
);

export const validatePermissionsSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        cloudAccountId: z.string().uuid().optional(),
    }),
);

export const grantMissingPermissionsSchema = z.object({
    cloudAccountId: z.string().uuid(),
    actions: z.array(z.string().min(1).max(128)).max(200).optional(),
});

export const importTemplateSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional().nullable(),
    content: z.string().min(1),
});

export type CreateAutomationDto = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationDto = z.infer<typeof updateAutomationSchema>;
export type ExecuteAutomationDto = z.infer<typeof executeAutomationSchema>;
export type RollbackAutomationDto = z.infer<typeof rollbackAutomationSchema>;
export type PlanAutomationDto = z.infer<typeof planAutomationSchema>;
export type ValidatePermissionsDto = z.infer<typeof validatePermissionsSchema>;
export type GrantMissingPermissionsDto = z.infer<typeof grantMissingPermissionsSchema>;
export type ImportTemplateDto = z.infer<typeof importTemplateSchema>;

// Re-export node output schema for frontend reference
export { nodeOutputReferenceSchema };
