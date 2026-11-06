import { describeAwsUsageType } from './aws-usage-type';
import { dedupeCostEntries, type FinopsCostEntry } from './finops-provider.interface';

describe('aws usage type for closed months', () => {
    it('keeps the region prefix out of the resource name', () => {
        expect(describeAwsUsageType('USE1-BoxUsage:t3.micro')).toEqual({
            resourceId: 'BoxUsage:t3.micro',
            region: 'USE1',
        });
        expect(describeAwsUsageType('SAE1-DataTransfer-Out-Bytes')).toEqual({
            resourceId: 'DataTransfer-Out-Bytes',
            region: 'SAE1',
        });
        expect(describeAwsUsageType('EBS:VolumeUsage.gp3')).toEqual({
            resourceId: 'EBS:VolumeUsage.gp3',
            region: '',
        });
    });

    it('sums usage types that share the cost-record key', () => {
        const left = entry({ cost: 10, region: 'USE1' });
        const right = entry({ cost: 4, region: 'USE1', usageType: 'USE1-BoxUsage:t3.micro' });
        const otherRegion = entry({ cost: 7, region: 'SAE1' });
        const merged = dedupeCostEntries([left, right, otherRegion]);

        expect(merged).toHaveLength(2);
        expect(merged.find((item) => item.region === 'USE1')?.cost).toBe(14);
        expect(merged.find((item) => item.region === 'SAE1')?.cost).toBe(7);
    });
});

function entry(overrides: Partial<FinopsCostEntry>): FinopsCostEntry {
    return {
        service: 'Amazon Elastic Compute Cloud - Compute',
        resourceId: 'BoxUsage:t3.micro',
        region: null,
        usageType: 'BoxUsage:t3.micro',
        operation: '',
        cost: 1,
        currency: 'USD',
        usageQuantity: 0,
        usageUnit: '',
        date: '2026-10-01',
        ...overrides,
    };
}
