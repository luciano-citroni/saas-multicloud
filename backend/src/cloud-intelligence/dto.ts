import { z } from 'zod';
import {
    knowledgeDomainSchema,
    knowledgeRoleSchema,
    knowledgeStructuredRuleSchema,
} from './knowledge/knowledge-rule.schema';

export const createConversationSchema = z.object({
    title: z.string().min(1).max(200).optional(),
});

export type CreateConversationDto = z.infer<typeof createConversationSchema>;

export const sendMessageSchema = z.object({
    content: z.string().min(1).max(4000),
    cloudAccountId: z.string().uuid().optional(),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const conversationIdParamSchema = z.object({
    id: z.string().uuid(),
});

export type ConversationIdParam = z.infer<typeof conversationIdParamSchema>;

export const recommendationIdParamSchema = z.object({
    id: z.string().uuid(),
});

export type RecommendationIdParam = z.infer<typeof recommendationIdParamSchema>;

export const updateRecommendationSchema = z
    .object({
        status: z
            .enum([
                'NEW',
                'REVIEWING',
                'APPROVED',
                'REJECTED',
                'EXECUTING',
                'COMPLETED',
                'FAILED',
                'DISMISSED',
            ])
            .optional(),
        assigneeUserId: z.string().uuid().nullable().optional(),
        acknowledge: z.boolean().optional(),
        dismissReason: z.string().min(1).max(255).nullable().optional(),
    })
    .refine(
        (value) =>
            value.status !== undefined ||
            value.assigneeUserId !== undefined ||
            value.acknowledge !== undefined ||
            value.dismissReason !== undefined,
        { message: 'At least one field is required' },
    );

export type UpdateRecommendationDto = z.infer<typeof updateRecommendationSchema>;

export const listRecommendationsQuerySchema = z.object({
    status: z
        .enum([
            'NEW',
            'REVIEWING',
            'APPROVED',
            'REJECTED',
            'EXECUTING',
            'COMPLETED',
            'FAILED',
            'DISMISSED',
        ])
        .optional(),
    category: z.string().min(1).max(100).optional(),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
    source: z.enum(['governance', 'finops', 'correlated', 'tags']).optional(),
    q: z.string().min(1).max(200).optional(),
    agentType: z.string().min(1).max(64).optional(),
    assignee: z.string().uuid().optional(),
    automatable: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => (value === undefined ? undefined : value === 'true')),
    minScore: z.coerce.number().min(0).max(100).optional(),
    correlated: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type ListRecommendationsQuery = z.infer<typeof listRecommendationsQuerySchema>;

export const updateQuotaSchema = z.object({
    dailyLimit: z.number().int().min(0).nullable().optional(),
    monthlyLimit: z.number().int().min(0).nullable().optional(),
    perAgentLimits: z.record(z.string(), z.number().int().min(0)).optional(),
    enabled: z.boolean().optional(),
    dailyIntelligenceEnabled: z.boolean().optional(),
    notificationGroupIds: z.array(z.string().uuid()).optional(),
});

export type UpdateQuotaDto = z.infer<typeof updateQuotaSchema>;

export const dashboardQuerySchema = z.object({
    provider: z.string().min(1).max(20).optional(),
    account: z.string().uuid().optional(),
    region: z.string().min(1).max(40).optional(),
    period: z.string().min(1).max(40).optional(),
    category: z.string().min(1).max(100).optional(),
    severity: z.string().min(1).max(20).optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const dailySettingsSchema = z.object({
    dailyIntelligenceEnabled: z.boolean().optional(),
    notificationGroupIds: z.array(z.string().uuid()).optional(),
});

export type DailySettingsDto = z.infer<typeof dailySettingsSchema>;

export const upsertKnowledgeDocSchema = z
    .object({
        id: z.string().uuid().optional(),
        title: z.string().min(1).max(300),
        content: z.string().max(20000).optional().default(''),
        source: z.string().min(1).max(100).optional(),
        domain: knowledgeDomainSchema.optional().default('general'),
        role: knowledgeRoleSchema.optional().default('guidance'),
        rule: knowledgeStructuredRuleSchema.optional(),
        scope: z.enum(['organization', 'cloud_accounts']).optional().default('organization'),
        cloudAccountIds: z.array(z.string().uuid()).max(50).optional().default([]),
    })
    .superRefine((value, ctx) => {
        const hasContent = value.content.trim().length > 0;
        const hasTagRule =
            value.role === 'tags' &&
            value.rule?.type === 'required_tags' &&
            value.rule.keys.length > 0;
        const hasNamingRule =
            value.role === 'naming' &&
            value.rule?.type === 'naming_pattern' &&
            value.rule.pattern.trim().length > 0;
        if (!hasContent && !hasTagRule && !hasNamingRule) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['content'],
                message: 'content is required unless role is tags/naming with a structured rule',
            });
        }
        if ((value.role === 'tags' || value.role === 'naming') && value.domain !== 'governance') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['role'],
                message: 'role tags/naming requires domain governance',
            });
        }
        if (value.role === 'tags' && !hasTagRule) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['rule'],
                message: 'role tags requires required_tags keys',
            });
        }
        if (value.role === 'naming' && !hasNamingRule) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['rule'],
                message: 'role naming requires naming_pattern',
            });
        }
        if (value.scope === 'cloud_accounts' && value.cloudAccountIds.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['cloudAccountIds'],
                message: 'scope cloud_accounts requires at least one cloudAccountId',
            });
        }
    });

export type UpsertKnowledgeDocDto = z.infer<typeof upsertKnowledgeDocSchema>;
