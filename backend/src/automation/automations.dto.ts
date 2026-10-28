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
});

export const importTemplateSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional().nullable(),
    content: z.string().min(1),
});

export type CreateAutomationDto = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationDto = z.infer<typeof updateAutomationSchema>;
export type ExecuteAutomationDto = z.infer<typeof executeAutomationSchema>;
export type ImportTemplateDto = z.infer<typeof importTemplateSchema>;

// Re-export node output schema for frontend reference
export { nodeOutputReferenceSchema };
