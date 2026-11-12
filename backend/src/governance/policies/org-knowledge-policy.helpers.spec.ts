import { namingPatternToRegExp } from '../../cloud-intelligence/knowledge/knowledge-rule.schema';
import {
    evaluateNamingFinding,
    evaluateRequiredTagsFinding,
    resolveApplicableNamingPatterns,
    resolveApplicableRequiredTags,
} from './org-knowledge-policy.helpers';
import type { PolicyContext } from './policy.interface';

describe('org-knowledge-policy.helpers', () => {
    const baseContext: PolicyContext = {
        cloudAccountId: 'acc',
        organizationId: 'org',
        orgRules: {
            requiredTags: ['Ambiente', 'Criador'],
            requiredTagProviders: ['aws'],
            requiredTagResourceTypes: [],
            namingPatterns: [
                {
                    pattern: 'prod-*-web',
                    example: 'prod-api-web',
                    providers: ['aws'],
                    scope: 'organization',
                    cloudAccountIds: [],
                },
            ],
        },
    };

    it('resolves required tags for matching provider', () => {
        expect(resolveApplicableRequiredTags(baseContext, 'aws', 'S3Bucket')).toEqual([
            'Ambiente',
            'Criador',
        ]);
        expect(resolveApplicableRequiredTags(baseContext, 'gcp', 'GcpVmInstance')).toBeNull();
    });

    it('evaluates missing tags', () => {
        const finding = evaluateRequiredTagsFinding({
            resourceId: 'bucket-1',
            resourceType: 'S3Bucket',
            resourceLabel: 'S3 bucket "bucket-1"',
            tags: { Ambiente: 'prod' },
            requiredTags: ['Ambiente', 'Criador'],
        });
        expect(finding.status).toBe('non_compliant');
        expect(finding.metadata?.missingTags).toEqual(['Criador']);
    });

    it('evaluates naming mismatches', () => {
        const patterns = resolveApplicableNamingPatterns(baseContext, 'aws', 'EC2Instance');
        const finding = evaluateNamingFinding({
            resourceId: 'i-1',
            resourceType: 'EC2Instance',
            resourceLabel: 'EC2 instance "i-1"',
            nameValue: 'dev-api-web',
            patterns,
        });
        expect(finding?.status).toBe('non_compliant');
        expect(finding?.metadata?.expectedPattern).toBe('prod-*-web');
        expect(namingPatternToRegExp('prod-*-web')?.test('prod-api-web')).toBe(true);
    });
});
