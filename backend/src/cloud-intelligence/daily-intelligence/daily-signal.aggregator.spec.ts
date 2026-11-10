import { aggregateDailySignals } from './daily-signal.aggregator';

describe('aggregateDailySignals', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');

    it('ranks higher impact savings above low priority findings', () => {
        const ranked = aggregateDailySignals({
            now,
            findings: [
                {
                    id: 'f-low',
                    policyName: 'Tagging',
                    policyId: 'p-tag',
                    description: 'Missing tags',
                    severity: 'low',
                    cloudAccountId: 'acc-1',
                    resourceId: 'i-1',
                    resourceType: 'ec2',
                    createdAt: now,
                } as never,
            ],
            anomalies: [],
            savings: [
                {
                    id: 's-high',
                    type: 'unused_ebs',
                    description: 'Unused volume',
                    recommendation: 'Delete',
                    potentialSaving: 500,
                    currency: 'USD',
                    priority: 'high',
                    cloudAccountId: 'acc-1',
                    resourceId: 'vol-9',
                    resourceType: 'ebs',
                    createdAt: now,
                } as never,
            ],
        });

        expect(ranked[0].dedupeKey).toBe('finops-saving:s-high');
        expect(ranked[0].estimatedImpact.rankingScore).toBeGreaterThan(ranked[1].estimatedImpact.rankingScore);
    });

    it('creates corr key when finding and saving share resource', () => {
        const ranked = aggregateDailySignals({
            now,
            findings: [
                {
                    id: 'f-1',
                    policyName: 'S3 public',
                    policyId: 'p-1',
                    description: 'Public bucket',
                    severity: 'critical',
                    cloudAccountId: 'acc-1',
                    resourceId: 'bucket-a',
                    resourceType: 's3',
                    createdAt: now,
                } as never,
            ],
            anomalies: [],
            savings: [
                {
                    id: 's-1',
                    type: 'unused_ebs',
                    description: 'Cost on bucket',
                    recommendation: 'Review',
                    potentialSaving: 20,
                    currency: 'USD',
                    priority: 'medium',
                    cloudAccountId: 'acc-1',
                    resourceId: 'bucket-a',
                    resourceType: 's3',
                    createdAt: now,
                } as never,
            ],
        });

        expect(ranked).toHaveLength(1);
        expect(ranked[0].dedupeKey).toBe('corr:acc-1:bucket-a');
        expect(ranked[0].sources).toHaveLength(2);
    });
});
