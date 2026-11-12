import type { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import {
    governanceFindingDedupeKey,
    mapGovernanceFindingToRecommendation,
} from './governance-finding-recommendation.mapper';

function finding(partial: Partial<GovernanceFinding>): GovernanceFinding {
    return {
        id: 'finding-1',
        jobId: 'job-1',
        cloudAccountId: 'acc-1',
        organizationId: 'org-1',
        resourceId: 'i-abc',
        resourceType: 'EC2Instance',
        policyId: 'aws-ec2-required-tags',
        policyName: 'EC2 Instance Must Have Required Tags',
        severity: 'medium',
        status: 'non_compliant',
        description: 'EC2 instance "i-abc" is missing required tags: Ambiente.',
        recommendation: 'Add the following required tags: Ambiente.',
        metadata: {
            missingTags: ['Ambiente'],
            requiredTags: ['Ambiente'],
            source: 'org_knowledge_rule',
            knowledgeRuleType: 'required_tags',
        },
        category: 'compute',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        ...partial,
    } as GovernanceFinding;
}

describe('governance-finding-recommendation.mapper', () => {
    it('builds a stable dedupe key', () => {
        expect(
            governanceFindingDedupeKey({
                cloudAccountId: 'acc-1',
                policyId: 'aws-ec2-required-tags',
                resourceId: 'i-abc',
            }),
        ).toBe('gov-policy:acc-1:aws-ec2-required-tags:i-abc');
    });

    it('maps finding to recommendation payload with automation for EC2 tags', () => {
        const payload = mapGovernanceFindingToRecommendation(finding({}));
        expect(payload.dedupeKey).toBe('gov-policy:acc-1:aws-ec2-required-tags:i-abc');
        expect(payload.title).toContain('Governance:');
        expect(payload.automatable).toBe(true);
        expect(payload.evidence.missingTags).toEqual(['Ambiente']);
    });

    it('marks naming findings as not automatable', () => {
        const payload = mapGovernanceFindingToRecommendation(
            finding({
                policyId: 'aws-ec2-naming',
                policyName: 'EC2 Instance Must Match Naming Pattern',
                description: 'name "dev-api" does not match required naming pattern(s): prod-*-web',
                recommendation: 'Rename the resource',
                metadata: {
                    expectedPattern: 'prod-*-web',
                    source: 'org_knowledge_rule',
                    knowledgeRuleType: 'naming_pattern',
                },
            }),
        );
        expect(payload.automatable).toBe(false);
    });
});
