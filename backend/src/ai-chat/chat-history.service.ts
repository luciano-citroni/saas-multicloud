import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiChatConversation } from '../db/entites/ai-chat-conversation.entity';
import { AiChatMessage, type AiChatMessageRole, type AiChatSource } from '../db/entites/ai-chat-message.entity';
import { ErrorMessages } from '../common/messages/error-messages';

@Injectable()
export class ChatHistoryService {
    constructor(
        @InjectRepository(AiChatConversation)
        private readonly conversationRepository: Repository<AiChatConversation>,
        @InjectRepository(AiChatMessage)
        private readonly messageRepository: Repository<AiChatMessage>,
    ) {}

    async listConversations(organizationId: string, userId: string): Promise<AiChatConversation[]> {
        return this.conversationRepository.find({
            where: { organizationId, userId },
            order: { updatedAt: 'DESC' },
            take: 50,
        });
    }

    async createConversation(organizationId: string, userId: string, title = 'Nova conversa'): Promise<AiChatConversation> {
        const conversation = this.conversationRepository.create({
            organizationId,
            userId,
            title: title.slice(0, 200),
        });
        return this.conversationRepository.save(conversation);
    }

    async getConversationOrFail(conversationId: string, organizationId: string, userId: string): Promise<AiChatConversation> {
        const conversation = await this.conversationRepository.findOne({
            where: { id: conversationId, organizationId, userId },
        });
        if (!conversation) {
            throw new NotFoundException(ErrorMessages.AI_CHAT.CONVERSATION_NOT_FOUND);
        }
        return conversation;
    }

    async getConversationWithMessages(
        conversationId: string,
        organizationId: string,
        userId: string,
    ): Promise<{ conversation: AiChatConversation; messages: AiChatMessage[] }> {
        const conversation = await this.getConversationOrFail(conversationId, organizationId, userId);
        const messages = await this.messageRepository.find({
            where: { conversationId: conversation.id },
            order: { createdAt: 'ASC' },
        });
        return { conversation, messages };
    }

    async deleteConversation(conversationId: string, organizationId: string, userId: string): Promise<void> {
        const conversation = await this.getConversationOrFail(conversationId, organizationId, userId);
        await this.conversationRepository.remove(conversation);
    }

    async addMessage(input: {
        conversationId: string;
        role: AiChatMessageRole;
        content: string;
        sources?: AiChatSource[] | null;
        toolName?: string | null;
        tokenUsage?: Record<string, unknown> | null;
    }): Promise<AiChatMessage> {
        const message = this.messageRepository.create({
            conversationId: input.conversationId,
            role: input.role,
            content: input.content,
            sources: input.sources ?? null,
            toolName: input.toolName ?? null,
            tokenUsage: input.tokenUsage ?? null,
        });
        const saved = await this.messageRepository.save(message);
        await this.conversationRepository.update(input.conversationId, { updatedAt: new Date() });
        return saved;
    }

    async updateTitle(conversationId: string, organizationId: string, userId: string, title: string): Promise<void> {
        await this.getConversationOrFail(conversationId, organizationId, userId);
        await this.conversationRepository.update(conversationId, { title: title.slice(0, 200) });
    }

    async getRecentMessagesForContext(
        conversationId: string,
        organizationId: string,
        userId: string,
        limit: number,
    ): Promise<AiChatMessage[]> {
        await this.getConversationOrFail(conversationId, organizationId, userId);
        const messages = await this.messageRepository.find({
            where: { conversationId },
            order: { createdAt: 'DESC' },
            take: limit,
        });
        return messages.reverse();
    }
}
