import { AnthropicFinopsAdapter } from './anthropic.adapter';

describe('AnthropicFinopsAdapter', () => {
    const adapter = new AnthropicFinopsAdapter();

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('exposes usage by user capabilities', () => {
        expect(adapter.capabilities.fetchUsage).toBe(true);
        expect(adapter.capabilities.fetchCosts).toBe(true);
        expect(adapter.capabilities.usageByUser).toBe(true);
    });

    it('validates credentials against models endpoint', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ data: [] }),
        } as Response);

        const result = await adapter.validateCredentials({ apiKey: 'sk-ant-api03-test' });
        expect(result.ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.anthropic.com/v1/models?limit=1',
            expect.objectContaining({
                headers: expect.objectContaining({ 'x-api-key': 'sk-ant-api03-test' }),
            }),
        );
    });

    it('fetches analytics costs with actor identity', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    {
                        starting_at: '2025-01-01T00:00:00Z',
                        group: {
                            model: 'claude-sonnet-4',
                            actor: {
                                type: 'user_actor',
                                user_id: 'user_01ABC',
                                email: 'dev@example.com',
                                name: 'Dev',
                            },
                        },
                        cost: { amount: '250.00', currency: 'USD' },
                    },
                ],
                has_more: false,
                next_page: null,
            }),
        } as Response);

        const costs = await adapter.fetchCosts(
            { apiKey: 'sk-ant-api03-test', adminApiKey: 'sk-ant-admin01-test' },
            '2025-01-01',
            '2025-01-02',
        );

        expect(costs).toEqual([
            expect.objectContaining({
                date: '2025-01-01',
                model: 'claude-sonnet-4',
                cost: 2.5,
                userExternalId: 'user_01ABC',
            }),
        ]);
        expect(String(global.fetch).length).toBeGreaterThan(0);
        const firstUrl = String((global.fetch as jest.Mock).mock.calls[0][0]);
        expect(firstUrl).toContain('/organizations/analytics/cost');
        expect(firstUrl).toContain('group_by[]=actor');
    });

    it('fetches analytics usage merged with actor cost', async () => {
        jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/organizations/analytics/usage')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: [
                            {
                                starting_at: '2025-01-01T00:00:00Z',
                                group: {
                                    model: 'claude-sonnet-4',
                                    actor: {
                                        type: 'user_actor',
                                        user_id: 'user_01ABC',
                                        email: 'dev@example.com',
                                    },
                                },
                                usage: {
                                    uncached_input_tokens: 1000,
                                    cache_read_input_tokens: 200,
                                    cache_creation: {
                                        ephemeral_1h_input_tokens: 0,
                                        ephemeral_5m_input_tokens: 100,
                                    },
                                    output_tokens: 500,
                                    total_tokens: 1800,
                                },
                            },
                        ],
                        has_more: false,
                        next_page: null,
                    }),
                } as Response;
            }
            return {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            starting_at: '2025-01-01T00:00:00Z',
                            group: {
                                model: 'claude-sonnet-4',
                                actor: { type: 'user_actor', user_id: 'user_01ABC' },
                            },
                            cost: { amount: '100.00', currency: 'USD' },
                        },
                    ],
                    has_more: false,
                    next_page: null,
                }),
            } as Response;
        });

        const usage = await adapter.fetchUsage(
            { apiKey: 'sk-ant-api03-test', adminApiKey: 'sk-ant-admin01-test' },
            '2025-01-01',
            '2025-01-02',
        );

        expect(usage).toHaveLength(1);
        expect(usage[0]).toEqual(
            expect.objectContaining({
                model: 'claude-sonnet-4',
                userExternalId: 'user_01ABC',
                inputTokens: 1100,
                outputTokens: 500,
                cachedInputTokens: 200,
                totalTokens: 1800,
                officialCost: 1,
            }),
        );
        expect(usage[0].metadata).toEqual(
            expect.objectContaining({
                actorEmail: 'dev@example.com',
                source: 'anthropic_analytics_usage',
            }),
        );
    });

    it('returns empty usage when admin key is unauthorized', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: false,
            status: 403,
            json: async () => ({}),
        } as Response);

        const usage = await adapter.fetchUsage({ apiKey: 'sk-ant-api03-test' }, '2025-01-01', '2025-01-02');
        expect(usage).toEqual([]);
    });
});
