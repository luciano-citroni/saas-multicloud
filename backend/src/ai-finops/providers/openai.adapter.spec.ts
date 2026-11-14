import { OpenAiFinopsAdapter } from './openai.adapter';

describe('OpenAiFinopsAdapter', () => {
    const adapter = new OpenAiFinopsAdapter();

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
            text: async () => '',
            json: async () => ({ data: [] }),
        } as Response);

        const result = await adapter.validateCredentials({ apiKey: 'sk-test' });
        expect(result.ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.openai.com/v1/models?limit=1',
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
            }),
        );
    });

    it('lists models without inventing data', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: 'gpt-4o-mini', owned_by: 'openai' }] }),
        } as Response);

        const models = await adapter.listModels({ apiKey: 'sk-test' });
        expect(models).toEqual([
            expect.objectContaining({
                modelIdentifier: 'gpt-4o-mini',
                displayName: 'gpt-4o-mini',
            }),
        ]);
    });

    it('fetches usage grouped by user and model', async () => {
        jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/organization/usage/completions')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: [
                            {
                                start_time: 1735689600,
                                results: [
                                    {
                                        model: 'gpt-4o-mini',
                                        user_id: 'user_abc',
                                        input_tokens: 100,
                                        output_tokens: 50,
                                        input_cached_tokens: 10,
                                        num_model_requests: 2,
                                    },
                                ],
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
                            start_time: 1735689600,
                            results: [
                                {
                                    amount: { value: 0.42, currency: 'usd' },
                                    line_item: 'gpt-4o-mini, input_tokens',
                                    user_id: 'user_abc',
                                },
                            ],
                        },
                    ],
                    has_more: false,
                    next_page: null,
                }),
            } as Response;
        });

        const usage = await adapter.fetchUsage(
            { apiKey: 'sk-test', adminApiKey: 'sk-admin' },
            '2025-01-01',
            '2025-01-02',
        );

        expect(usage).toHaveLength(1);
        expect(usage[0]).toEqual(
            expect.objectContaining({
                model: 'gpt-4o-mini',
                userExternalId: 'user_abc',
                inputTokens: 100,
                outputTokens: 50,
                totalTokens: 150,
                officialCost: 0.42,
            }),
        );
    });

    it('uses adminApiKey for organization costs', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ data: [], has_more: false }),
        } as Response);

        await adapter.fetchCosts(
            { apiKey: 'sk-project', adminApiKey: 'sk-admin' },
            '2025-01-01',
            '2025-01-02',
        );

        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('/organization/costs'),
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer sk-admin' }),
            }),
        );
        expect(fetchSpy.mock.calls[0][0]).toEqual(expect.stringContaining('group_by[]=user_id'));
    });
});
