import { NotFoundException } from '@nestjs/common';
import { ChatHistoryService } from './chat-history.service';
import { ErrorMessages } from '../common/messages/error-messages';

describe('ChatHistoryService isolation', () => {
    const conversationRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => ({ id: 'conv-1', ...value })),
        update: jest.fn(),
        remove: jest.fn(),
    };
    const messageRepository = {
        find: jest.fn(),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => ({ id: 'msg-1', ...value })),
    };

    const service = new ChatHistoryService(conversationRepository as never, messageRepository as never);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('lists only conversations for the authenticated user and organization', async () => {
        conversationRepository.find.mockResolvedValue([{ id: 'conv-1' }]);
        await service.listConversations('org-1', 'user-1');
        expect(conversationRepository.find).toHaveBeenCalledWith({
            where: { organizationId: 'org-1', userId: 'user-1' },
            order: { updatedAt: 'DESC' },
            take: 50,
        });
    });

    it('rejects conversation access for another user', async () => {
        conversationRepository.findOne.mockResolvedValue(null);
        await expect(service.getConversationOrFail('conv-1', 'org-1', 'user-2')).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.getConversationOrFail('conv-1', 'org-1', 'user-2')).rejects.toThrow(
            ErrorMessages.AI_CHAT.CONVERSATION_NOT_FOUND,
        );
    });

    it('rejects conversation access for another tenant', async () => {
        conversationRepository.findOne.mockResolvedValue(null);
        await expect(service.getConversationOrFail('conv-1', 'org-other', 'user-1')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
