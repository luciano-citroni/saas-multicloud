import { MistralFinopsAdapter } from './mistral.adapter';

describe('MistralFinopsAdapter', () => {
    const adapter = new MistralFinopsAdapter();

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('exposes admin usage/cost capabilities', () => {
        expect(adapter.capabilities.fetchUsage).toBe(true);
        expect(adapter.capabilities.fetchCosts).toBe(true);
        expect(adapter.capabilities.usageByUser).toBe(true);
    });

    it('validates models and probes admin when adminApiKey is present', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ data: [] }),
        } as Response);

        const result = await adapter.validateCredentials({
            apiKey: 'sk-models',
            adminApiKey: 'sk-admin',
        });
        expect(result.ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.mistral.ai/v1/models',
            expect.any(Object),
        );
        expect(String((global.fetch as jest.Mock).mock.calls[1][0])).toContain('/v1/admin/usage');
    });

    it('queries usage with user grouping', async () => {
        jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes('/admin/usage/query')) {
                return {
                    ok: true,
                    json: async () => ({
                        groups: [
                            {
                                start: '2025-01-01T00:00:00Z',
                                user_id: 'user_1',
                                billing_display_name: 'mistral-small',
                                quantity: 1000,
                                nb_api_calls: 3,
                            },
                        ],
                    }),
                } as Response;
            }
            if (url.includes('/admin/usage?')) {
                return {
                    ok: true,
                    json: async () => ({
                        currency: 'USD',
                        start_date: '2025-01-01T00:00:00Z',
                        completion: { total_cost: 2.5 },
                    }),
                } as Response;
            }
            return { ok: true, json: async () => ({}) } as Response;
        });

        const usage = await adapter.fetchUsage(
            { apiKey: 'sk-models', adminApiKey: 'sk-admin' },
            '2025-01-01',
            '2025-01-02',
        );
        expect(usage).toHaveLength(1);
        expect(usage[0]).toEqual(
            expect.objectContaining({
                model: 'mistral-small',
                userExternalId: 'user_1',
                totalTokens: 1000,
                officialCost: 2.5,
            }),
        );
    });
});
