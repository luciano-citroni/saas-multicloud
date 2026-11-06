import { buildCommercialReport, isCommercialAutoSendDay, previousClosedMonth, saoPauloToday } from './commercial-report.aggregate';

describe('commercial report aggregate', () => {
    const today = '2026-11-06';

    it('uses the previous month as the closed reference', () => {
        expect(previousClosedMonth(today)).toBe('2026-10');
        expect(saoPauloToday(new Date('2026-11-06T15:00:00Z'))).toBe('2026-11-06');
    });

    it('sends the commercial report automatically only on day 7', () => {
        expect(isCommercialAutoSendDay('2026-11-07')).toBe(true);
        expect(isCommercialAutoSendDay('2026-11-06')).toBe(false);
        expect(isCommercialAutoSendDay('2026-11-08')).toBe(false);
        expect(isCommercialAutoSendDay('2026-11-10')).toBe(false);
    });

    it('converts USD with the invoice rate and projects the open month without the last two days', () => {
        const report = buildCommercialReport({
            referenceMonth: '2026-10',
            todayIso: today,
            accounts: [
                { id: 'a', alias: 'PRD', provider: 'azure' },
                { id: 'b', alias: 'DEV', provider: 'azure' },
            ],
            exchangeRate: 5,
            previousExchangeRate: 4,
            serviceRows: [
                { accountId: 'a', provider: 'azure', service: 'Virtual Machines', day: '2026-10-01', month: '2026-10', currency: 'USD', granularity: 'daily', cost: 10 },
                { accountId: 'a', provider: 'azure', service: 'Storage', day: '2026-09-01', month: '2026-09', currency: 'USD', granularity: 'daily', cost: 20 },
                { accountId: 'b', provider: 'azure', service: 'Virtual Machines', day: '2026-11-01', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 3 },
                { accountId: 'b', provider: 'azure', service: 'Virtual Machines', day: '2026-11-02', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 3 },
                { accountId: 'b', provider: 'azure', service: 'Virtual Machines', day: '2026-11-03', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 3 },
                { accountId: 'b', provider: 'azure', service: 'Virtual Machines', day: '2026-11-04', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 3 },
                { accountId: 'b', provider: 'azure', service: 'Virtual Machines', day: '2026-11-05', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 100 },
            ],
            resourceRows: [
                { name: 'vm-a', service: 'Virtual Machines', month: '2026-10', currency: 'USD', granularity: 'daily', cost: 4 },
                { name: 'vm-a', service: 'Virtual Machines', month: '2026-09', currency: 'USD', granularity: 'daily', cost: 10 },
                { name: 'disk-b', service: 'Storage', month: '2026-10', currency: 'USD', granularity: 'daily', cost: 8 },
                { name: 'disk-b', service: 'Storage', month: '2026-09', currency: 'USD', granularity: 'daily', cost: 2 },
            ],
        });

        expect(report.displayCurrency).toBe('BRL');
        expect(report.kpis.totalCost).toBe(50);
        expect(report.kpis.daysInMonth).toBe(31);
        expect(report.kpis.avgDailyCost).toBeCloseTo(50 / 31);
        expect(report.kpis.accountsWithSpend).toBe(1);
        expect(report.kpis.projectionBaseDays).toBe(4);
        expect(report.kpis.projectionSource).toBe('linear');
        expect(report.kpis.projection).toBeCloseTo((60 / 4) * 30);
        expect(report.inProgress.points).toHaveLength(4);
        expect(report.reductions[0]).toEqual({ name: 'vm-a', amount: 30 });
        expect(report.increases[0]).toEqual({ name: 'disk-b', amount: 30 });
        expect(report.topServices[0].service).toBe('Virtual Machines');
        expect(report.exchangeRateChangePct).toBeCloseTo(25);
    });

    it('ranks the closed month by usage type and ignores the partial resource window', () => {
        const report = buildCommercialReport({
            referenceMonth: '2026-10',
            todayIso: today,
            accounts: [{ id: 'a', alias: 'PRD', provider: 'aws' }],
            exchangeRate: null,
            previousExchangeRate: null,
            serviceRows: [
                { accountId: 'a', provider: 'aws', service: 'Amazon Elastic Compute Cloud - Compute', day: '2026-10-01', month: '2026-10', currency: 'USD', granularity: 'monthly', cost: 100 },
            ],
            resourceRows: [
                { name: 'i-partial', service: 'Amazon Elastic Compute Cloud - Compute', month: '2026-10', currency: 'USD', granularity: 'daily', source: 'resource', cost: 900 },
                { name: 'BoxUsage:t3.micro', service: 'Amazon Elastic Compute Cloud - Compute', month: '2026-10', currency: 'USD', granularity: 'monthly', source: 'usage', cost: 70 },
                { name: 'BoxUsage:t3.micro', service: 'Amazon Elastic Compute Cloud - Compute', month: '2026-09', currency: 'USD', granularity: 'monthly', source: 'usage', cost: 20 },
                { name: 'VolumeUsage.gp3', service: 'Amazon Elastic Block Store', month: '2026-10', currency: 'USD', granularity: 'monthly', source: 'usage', cost: 5 },
                { name: 'VolumeUsage.gp3', service: 'Amazon Elastic Block Store', month: '2026-09', currency: 'USD', granularity: 'monthly', source: 'usage', cost: 40 },
            ],
        });

        expect(report.topResources.map((item) => item.name)).toEqual(['BoxUsage:t3.micro', 'VolumeUsage.gp3']);
        expect(report.increases[0]).toEqual({ name: 'BoxUsage:t3.micro', amount: 50 });
        expect(report.reductions[0]).toEqual({ name: 'VolumeUsage.gp3', amount: 35 });
    });

    it('uses the AwesomeAPI daily change when it is provided', () => {
        const report = buildCommercialReport({
            referenceMonth: '2026-10',
            todayIso: '2026-11-06',
            accounts: [],
            exchangeRate: 5.2,
            previousExchangeRate: null,
            exchangeRateChangePct: -0.42,
            serviceRows: [],
            resourceRows: [],
        });
        expect(report.exchangeRate).toBe(5.2);
        expect(report.exchangeRateChangePct).toBeCloseTo(-0.42);
    });

    it('uses the provider month-end forecast instead of the linear run rate', () => {
        const report = buildCommercialReport({
            referenceMonth: '2026-10',
            todayIso: today,
            accounts: [{ id: 'b', alias: 'DEV', provider: 'aws' }],
            exchangeRate: 5,
            previousExchangeRate: 4,
            accountForecasts: [{ accountId: 'b', amount: 1199.11, currency: 'USD' }],
            serviceRows: [
                { accountId: 'b', provider: 'aws', service: 'Amazon Elastic Compute Cloud', day: '2026-10-01', month: '2026-10', currency: 'USD', granularity: 'daily', cost: 10 },
                { accountId: 'b', provider: 'aws', service: 'Amazon Elastic Compute Cloud', day: '2026-11-01', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 40 },
                { accountId: 'b', provider: 'aws', service: 'Amazon Elastic Compute Cloud', day: '2026-11-02', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 40 },
                { accountId: 'b', provider: 'aws', service: 'Amazon Elastic Compute Cloud', day: '2026-11-03', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 40 },
                { accountId: 'b', provider: 'aws', service: 'Amazon Elastic Compute Cloud', day: '2026-11-04', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 40 },
            ],
            resourceRows: [],
        });

        expect(report.kpis.projectionSource).toBe('provider');
        expect(report.kpis.projection).toBeCloseTo(1199.11 * 5);
        expect(report.inProgress.projection).toBeCloseTo(1199.11 * 5);
    });

    it('keeps a linear slice for accounts the provider did not forecast', () => {
        const report = buildCommercialReport({
            referenceMonth: '2026-10',
            todayIso: today,
            accounts: [
                { id: 'aws', alias: 'AWS', provider: 'aws' },
                { id: 'gcp', alias: 'GCP', provider: 'gcp' },
            ],
            exchangeRate: null,
            previousExchangeRate: null,
            accountForecasts: [{ accountId: 'aws', amount: 1000, currency: 'USD' }],
            serviceRows: [
                { accountId: 'aws', provider: 'aws', service: 'EC2', day: '2026-10-01', month: '2026-10', currency: 'USD', granularity: 'daily', cost: 10 },
                { accountId: 'gcp', provider: 'gcp', service: 'Compute', day: '2026-11-01', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 3 },
                { accountId: 'gcp', provider: 'gcp', service: 'Compute', day: '2026-11-02', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 3 },
                { accountId: 'gcp', provider: 'gcp', service: 'Compute', day: '2026-11-03', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 3 },
                { accountId: 'gcp', provider: 'gcp', service: 'Compute', day: '2026-11-04', month: '2026-11', currency: 'USD', granularity: 'daily', cost: 3 },
            ],
            resourceRows: [],
        });

        expect(report.kpis.projectionSource).toBe('mixed');
        expect(report.kpis.projection).toBeCloseTo(1000 + (12 / 4) * 30);
    });
});
