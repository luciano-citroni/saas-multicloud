import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ErrorMessages } from '../../common/messages/error-messages';
import { AiQuotasService } from './ai-quotas.service';

describe('AiQuotasService', () => {
    const quotaRepository = {
        findOne: jest.fn(),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => ({ id: 'quota-1', ...value })),
    };
    const usageService = {
        totalTokensBetween: jest.fn(),
        sumTokensInRange: jest.fn(),
    };
    const configService = {
        get: jest.fn((key: string) => {
            if (key === 'AI_DEFAULT_DAILY_LIMIT') return '1000';
            if (key === 'AI_DEFAULT_MONTHLY_LIMIT') return '10000';
            return undefined;
        }),
    };

    const service = new AiQuotasService(
        quotaRepository as never,
        usageService as never,
        configService as never,
    );

    beforeEach(() => {
        jest.clearAllMocks();
        quotaRepository.findOne.mockResolvedValue({
            organizationId: 'org-1',
            dailyLimit: 1000,
            monthlyLimit: 10000,
            perAgentLimits: {},
            enabled: true,
        });
        usageService.totalTokensBetween.mockResolvedValue(0);
        usageService.sumTokensInRange.mockResolvedValue({
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: 0,
            requests: 0,
        });
    });

    it('blocks when AI is disabled for the organization', async () => {
        quotaRepository.findOne.mockResolvedValue({
            organizationId: 'org-1',
            dailyLimit: null,
            monthlyLimit: null,
            perAgentLimits: {},
            enabled: false,
        });
        await expect(service.assertWithinQuota('org-1')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.assertWithinQuota('org-1')).rejects.toThrow(
            ErrorMessages.CLOUD_INTELLIGENCE.QUOTA_DISABLED,
        );
    });

    it('blocks when daily quota is exceeded', async () => {
        usageService.totalTokensBetween.mockResolvedValueOnce(1000).mockResolvedValueOnce(1000);
        await expect(service.assertWithinQuota('org-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('allows requests under quota', async () => {
        usageService.totalTokensBetween.mockResolvedValue(10);
        await expect(service.assertWithinQuota('org-1')).resolves.toBeUndefined();
    });
});
