import { z } from 'zod';

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
