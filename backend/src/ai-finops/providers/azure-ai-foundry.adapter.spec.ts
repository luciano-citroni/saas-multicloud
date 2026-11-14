import { AzureAiFoundryFinopsAdapter } from './azure-ai-foundry.adapter';

describe('AzureAiFoundryFinopsAdapter', () => {
    const adapter = new AzureAiFoundryFinopsAdapter();

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('exposes cost management capabilities', () => {
        expect(adapter.capabilities.fetchCosts).toBe(true);
        expect(adapter.capabilities.fetchUsage).toBe(true);
        expect(adapter.capabilities.usageByUser).toBe(false);
    });

    it('returns empty costs without SP credentials', async () => {
        const costs = await adapter.fetchCosts(
            { endpoint: 'https://example.openai.azure.com', apiKey: 'key' },
            '2025-01-01',
            '2025-01-02',
        );
        expect(costs).toEqual([]);
    });

    it('maps Cost Management rows into cost entries', async () => {
        jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('login.microsoftonline.com')) {
                return {
                    ok: true,
                    json: async () => ({ access_token: 'token' }),
                } as Response;
            }
            return {
                ok: true,
                json: async () => ({
                    properties: {
                        columns: [
                            { name: 'UsageDate' },
                            { name: 'Cost' },
                            { name: 'UsageQuantity' },
                            { name: 'Meter' },
                            { name: 'MeterSubCategory' },
                            { name: 'Currency' },
                        ],
                        rows: [[20250101, 1.25, 500, 'GPT-4o Input', 'Azure OpenAI', 'USD']],
                    },
                }),
            } as Response;
        });

        const costs = await adapter.fetchCosts(
            {
                endpoint: 'https://example.openai.azure.com',
                apiKey: 'key',
                tenantId: 'tid',
                clientId: 'cid',
                clientSecret: 'sec',
                subscriptionId: '00000000-0000-0000-0000-000000000001',
            },
            '2025-01-01',
            '2025-01-02',
        );

        expect(costs).toEqual([
            expect.objectContaining({
                date: '2025-01-01',
                model: 'GPT-4o Input',
                cost: 1.25,
                currency: 'USD',
            }),
        ]);
    });
});
