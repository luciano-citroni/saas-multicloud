import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsService', () => {
    const recommendationRepository = {
        createQueryBuilder: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => ({ id: value.id ?? 'rec-1', ...value })),
    };
    const auditService = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new RecommendationsService(
        recommendationRepository as never,
        auditService as never,
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('dedupes active recommendations by organization and dedupeKey', async () => {
        recommendationRepository.findOne.mockResolvedValue({
            id: 'rec-1',
            organizationId: 'org-1',
            dedupeKey: 'sg-public:acc-1',
            status: 'NEW',
            title: 'Old',
            description: 'Old desc',
            severity: 'high',
            priority: 'high',
            evidence: {},
            resourceReference: null,
            estimatedImpact: null,
            confidence: 0.5,
        });

        const result = await service.upsertRecommendation({
            organizationId: 'org-1',
            agentType: 'security_analyst',
            category: 'security',
            title: 'Updated title',
            description: 'Updated',
            dedupeKey: 'sg-public:acc-1',
        });

        expect(result.created).toBe(false);
        expect(recommendationRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'rec-1', title: 'Updated title' }),
        );
    });

    it('creates a new recommendation when no active duplicate exists', async () => {
        recommendationRepository.findOne.mockResolvedValue(null);
        const result = await service.upsertRecommendation({
            organizationId: 'org-1',
            agentType: 'cloud_advisor',
            category: 'finops',
            title: 'Resize RDS',
            description: 'Instance oversized',
            dedupeKey: 'rds-oversize:db-1',
        });
        expect(result.created).toBe(true);
        expect(recommendationRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'org-1',
                dedupeKey: 'rds-oversize:db-1',
                status: 'NEW',
            }),
        );
    });

    it('rejects invalid status transitions', async () => {
        recommendationRepository.findOne.mockResolvedValue({
            id: 'rec-1',
            organizationId: 'org-1',
            status: 'COMPLETED',
        });
        await expect(service.updateStatus('rec-1', 'org-1', 'APPROVED')).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('scopes findOrFail to organization', async () => {
        recommendationRepository.findOne.mockResolvedValue(null);
        await expect(service.findOrFail('rec-1', 'org-other')).rejects.toBeInstanceOf(NotFoundException);
    });
});
