import { buildCommercialReportPdf, commercialReportPdfFileName } from './commercial-report.pdf';
import type { CommercialReportResponse } from './services/finops-commercial-report.service';

describe('commercial report pdf', () => {
    it('builds a pdf attachment for the monthly email', async () => {
        const report = {
            organizationName: 'Cloud3',
            referenceMonth: '2026-10',
            generatedAt: '2026-11-07T12:00:00.000Z',
            displayCurrency: 'BRL',
            exchangeRate: 5.49,
            months: [
                { key: '2026-08', days: 31 },
                { key: '2026-09', days: 30 },
                { key: '2026-10', days: 31 },
            ],
            providers: ['aws'],
            kpis: {
                totalCost: 6154.02,
                totalChangePct: -0.2,
                avgDailyCost: 198.52,
                avgDailyChangePct: -3.5,
                previousAvgDaily: 205.64,
                accountsWithSpend: 1,
                accountsTotal: 1,
                projection: 6395.03,
                projectionMonth: '2026-11',
                projectionSource: 'provider',
                projectionBaseDays: 29,
            },
            anomalies: { total: 0, acknowledged: 0, items: [] },
            credits: { hasCredits: false, granted: 0, consumed: 0, remaining: 0 },
            totalEvolution: [
                { month: '2026-08', cost: 6497.21 },
                { month: '2026-09', cost: 6169.28 },
                { month: '2026-10', cost: 6154.02 },
            ],
            avgDailyEvolution: [
                { month: '2026-08', avg: 209.59 },
                { month: '2026-09', avg: 205.64 },
                { month: '2026-10', avg: 198.52 },
            ],
            accountEvolution: [{ alias: 'Cloud3 - Hospedagem', costs: [6497.21, 6169.28, 6154.02] }],
            subscriptionTable: [{ alias: 'Cloud3 - Hospedagem', costs: [6497.21, 6169.28, 6154.02], change12: -5, change23: -0.2 }],
            dailyPrevious: [{ date: '2026-09-01', cost: 100 }],
            dailyReference: [{ date: '2026-10-01', cost: 90 }],
            inProgress: { month: '2026-11', points: [{ date: '2026-11-01', cost: 80 }], projection: 6395.03 },
            reductions: [],
            reductionSum: 0,
            increases: [{ name: 'EC2', amount: 10 }],
            increaseSum: 10,
            topServices: [{ service: 'Amazon Elastic Compute Cloud - Compute', cost: 100 }],
            topResources: [],
            costByAccount: [{ alias: 'Cloud3 - Hospedagem', cost: 6154.02 }],
            accountByService: { services: ['Amazon Elastic Compute Cloud - Compute'], rows: [{ alias: 'Cloud3 - Hospedagem', costs: [100] }] },
        } as CommercialReportResponse;

        const pdf = await buildCommercialReportPdf(report);

        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(pdf.length).toBeGreaterThan(500);
        expect(commercialReportPdfFileName('Cloud3', '2026-10')).toBe('finops-commercial-cloud3-2026-10.pdf');
    });
});
