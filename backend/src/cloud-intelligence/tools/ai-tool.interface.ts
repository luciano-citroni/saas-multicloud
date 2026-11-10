import { z } from 'zod';
import type { AiChatSource } from '../../db/entites/ai-chat-message.entity';
import type { AiChatToolDefinition } from '../providers/ai-provider.interface';

export type ToolSecurityContext = {
    organizationId: string;
    userId: string;
    enabledModules: Set<string>;
};

export type ToolExecutionResult = {
    content: string;
    sources: AiChatSource[];
};

export type AiToolHandler = (
    args: Record<string, unknown>,
    ctx: ToolSecurityContext,
) => Promise<ToolExecutionResult>;

export type AiToolDefinition = AiChatToolDefinition & {
    requiredModules: string[];
    schema: z.ZodTypeAny;
    handler: AiToolHandler;
};

export interface AiTool {
    readonly name: string;
    readonly description: string;
    readonly requiredModules: string[];
    readonly parameters: Record<string, unknown>;
    readonly schema: z.ZodTypeAny;
    execute(args: Record<string, unknown>, ctx: ToolSecurityContext): Promise<ToolExecutionResult>;
}
