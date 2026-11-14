import { AiFinopsPricingService } from './ai-finops-pricing.service';

describe('AiFinopsPricingService.estimateCost', () => {
    it('returns null when no versioned price exists for the usage date', async () => {
        const pricingRepository = {
            findOne: jest.fn().mockResolvedValue(null),
        };
        const service = new AiFinopsPricingService(
            {} as never,
            pricingRepository as never,
        );

        const result = await service.estimateCost({
            modelId: 'model-1',
            occurredAt: new Date('2026-01-15T00:00:00.000Z'),
            inputTokens: 1000,
            outputTokens: 500,
        });

        expect(result).toBeNull();
    });

    it('uses effective pricing at the consumption date', async () => {
        const pricingRepository = {
            findOne: jest
                .fn()
                .mockResolvedValueOnce({ price: '2', currency: 'USD' }) // input
                .mockResolvedValueOnce({ price: '8', currency: 'USD' }), // output
        };
        const service = new AiFinopsPricingService(
            {} as never,
            pricingRepository as never,
        );

        const result = await service.estimateCost({
            modelId: 'model-1',
            occurredAt: new Date('2026-01-15T00:00:00.000Z'),
            inputTokens: 1_000_000,
            outputTokens: 500_000,
        });

        expect(result).toEqual({ estimatedCost: 2 + 4, currency: 'USD' });
    });
});
