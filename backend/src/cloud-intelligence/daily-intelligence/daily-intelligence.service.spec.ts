import { DailyIntelligenceService } from './daily-intelligence.service';

describe('DailyIntelligenceService', () => {
    const reportRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn((v) => v),
        save: jest.fn(async (v) => ({ id: 'report-1', ...v })),
    };
    const recommendationRepository = { find: jest.fn() };
    const anomalyRepository = { find: jest.fn() };
    const findingRepository = { find: jest.fn() };
    const finopsRecommendationRepository = { find: jest.fn() };
    const cloudService = { findByOrganization: jest.fn() };
    const quotasService = {
        getSnapshot: jest.fn(),
    };
    const recommendationsService = { upsertRecommendation: jest.fn() };
    const notificationsService = {
        findGroupsByIds: jest.fn(),
        listActiveEmailsFromGroups: jest.fn(),
        sendWhatsappAlertToGroups: jest.fn(),
    };
    const mailerService = { sendCloudIntelligenceDigest: jest.fn() };
    const briefingComposer = {
        compose: jest.fn(async () => ({
            headline: 'Briefing',
            actions: [],
            llmUsed: false,
        })),
    };
    const auditService = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new DailyIntelligenceService(
        reportRepository as never,
        recommendationRepository as never,
        anomalyRepository as never,
        findingRepository as never,
        finopsRecommendationRepository as never,
        cloudService as never,
        quotasService as never,
        recommendationsService as never,
        notificationsService as never,
        mailerService as never,
        briefingComposer as never,
        auditService as never,
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('skips generation when tier lacks daily_intelligence', async () => {
        quotasService.getSnapshot.mockResolvedValue({
            enabled: true,
            dailyIntelligenceEnabled: true,
            tier: 'basic',
            notificationGroupIds: [],
        });
        const result = await service.generateForOrganization('org-1');
        expect(result).toBeNull();
        expect(cloudService.findByOrganization).not.toHaveBeenCalled();
    });

    it('persists a no-sources report when only sync exists', async () => {
        quotasService.getSnapshot.mockResolvedValue({
            enabled: true,
            dailyIntelligenceEnabled: true,
            tier: 'enterprise',
            notificationGroupIds: [],
        });
        cloudService.findByOrganization.mockResolvedValue([
            { id: 'acc-1', lastGeneralSyncAt: new Date() },
        ]);
        recommendationRepository.find.mockResolvedValue([]);
        anomalyRepository.find.mockResolvedValue([]);
        findingRepository.find.mockResolvedValue([]);
        finopsRecommendationRepository.find.mockResolvedValue([]);
        reportRepository.findOne.mockResolvedValue(null);

        const result = await service.generateForOrganization('org-1');
        expect(result?.metadata).toEqual(
            expect.objectContaining({ skipped: true, reason: 'no_actionable_sources' }),
        );
        expect(recommendationsService.upsertRecommendation).not.toHaveBeenCalled();
        expect(mailerService.sendCloudIntelligenceDigest).not.toHaveBeenCalled();
        expect(String(result?.summary)).toContain('No recommendations were created');
        expect(auditService.record).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'daily_generated' }),
        );
    });

    it('ranks and upserts open finops savings with rankingScore', async () => {
        quotasService.getSnapshot.mockResolvedValue({
            enabled: true,
            dailyIntelligenceEnabled: true,
            tier: 'enterprise',
            notificationGroupIds: [],
        });
        cloudService.findByOrganization.mockResolvedValue([]);
        recommendationRepository.find.mockResolvedValue([]);
        anomalyRepository.find.mockResolvedValue([]);
        findingRepository.find.mockResolvedValue([]);
        finopsRecommendationRepository.find.mockResolvedValue([
            {
                id: 'sav-1',
                type: 'unused_ebs',
                description: 'Unused volume',
                recommendation: 'Delete unused EBS',
                potentialSaving: 42,
                currency: 'USD',
                priority: 'high',
                cloudAccountId: 'acc-1',
                resourceId: 'vol-1',
                resourceType: 'ebs',
                createdAt: new Date(),
            },
        ]);
        reportRepository.findOne.mockResolvedValue(null);
        recommendationsService.upsertRecommendation.mockResolvedValue({
            recommendation: { id: 'rec-1' },
            created: true,
        });

        const result = await service.generateForOrganization('org-1');
        expect(recommendationsService.upsertRecommendation).toHaveBeenCalledWith(
            expect.objectContaining({
                dedupeKey: 'finops-saving:sav-1',
                category: 'finops',
                title: 'Unused volume',
                description: 'Delete unused EBS',
                estimatedImpact: expect.objectContaining({
                    potentialSaving: 42,
                    rankingScore: expect.any(Number),
                }),
            }),
        );
        expect(briefingComposer.compose).toHaveBeenCalled();
        expect(result?.metadata).toEqual(
            expect.objectContaining({ skipped: false, reason: 'recommendations_generated' }),
        );
    });

    it('correlates finding + saving on same resource into corr dedupeKey', async () => {
        quotasService.getSnapshot.mockResolvedValue({
            enabled: true,
            dailyIntelligenceEnabled: true,
            tier: 'enterprise',
            notificationGroupIds: [],
        });
        cloudService.findByOrganization.mockResolvedValue([]);
        recommendationRepository.find.mockResolvedValue([]);
        anomalyRepository.find.mockResolvedValue([]);
        findingRepository.find.mockResolvedValue([
            {
                id: 'f-1',
                policyName: 'S3 encryption',
                policyId: 'p-1',
                description: 'Bucket missing encryption',
                recommendation: 'Enable SSE',
                severity: 'high',
                cloudAccountId: 'acc-1',
                resourceId: 'bucket-1',
                resourceType: 's3',
                createdAt: new Date(),
            },
        ]);
        finopsRecommendationRepository.find.mockResolvedValue([
            {
                id: 'sav-1',
                type: 'unused_ebs',
                description: 'Orphan cost on bucket-related storage',
                recommendation: 'Review storage',
                potentialSaving: 10,
                currency: 'USD',
                priority: 'medium',
                cloudAccountId: 'acc-1',
                resourceId: 'bucket-1',
                resourceType: 's3',
                createdAt: new Date(),
            },
        ]);
        reportRepository.findOne.mockResolvedValue(null);
        recommendationsService.upsertRecommendation.mockResolvedValue({
            recommendation: { id: 'rec-corr' },
            created: true,
        });

        await service.generateForOrganization('org-1');
        expect(recommendationsService.upsertRecommendation).toHaveBeenCalledWith(
            expect.objectContaining({
                dedupeKey: 'corr:acc-1:bucket-1',
                evidence: expect.objectContaining({
                    sources: expect.arrayContaining([
                        expect.objectContaining({ type: 'governance_finding', id: 'f-1' }),
                        expect.objectContaining({ type: 'finops_saving', id: 'sav-1' }),
                    ]),
                }),
            }),
        );
    });
});
