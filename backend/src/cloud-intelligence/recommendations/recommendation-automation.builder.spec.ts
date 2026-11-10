import { AUTOMATION_ACTION_TYPES } from '../../automation/constants';
import type { AiRecommendation } from '../../db/entites/ai-recommendation.entity';
import { buildRecommendationAutomationDraft } from './recommendation-automation.builder';

describe('buildRecommendationAutomationDraft', () => {
    it('builds a draft with S3 encryption remediation for encryption findings', () => {
        const recommendation = {
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Governance: S3 Bucket Must Have Server-Side Encryption Enabled',
            description:
                'S3 bucket "cloud3-nops-nops-746872773540" does not have server-side encryption enabled.',
            category: 'security',
            severity: 'high',
            resourceReference: {
                cloudAccountId: '22222222-2222-4222-8222-222222222222',
                resourceId: 'cloud3-nops-nops-746872773540',
                resourceType: 'S3Bucket',
                region: 'us-east-1',
            },
        } as AiRecommendation;

        const draft = buildRecommendationAutomationDraft(recommendation);
        expect(draft.cloudAccountId).toBe('22222222-2222-4222-8222-222222222222');
        expect(draft.nodes.map((n) => n.type)).toEqual([
            AUTOMATION_ACTION_TYPES.AWS_DATA_INPUT,
            AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE,
            AUTOMATION_ACTION_TYPES.AWS_CALLER_IDENTITY,
        ]);
        expect(draft.nodes[1]).toEqual(
            expect.objectContaining({
                name: 'Enable S3 server-side encryption',
                config: expect.objectContaining({
                    bucketName: 'cloud3-nops-nops-746872773540',
                    encryption: true,
                    publicAccessBlock: false,
                    versioning: false,
                }),
            }),
        );
        expect(draft.plannedActions).toEqual([
            'read_context',
            'remediate_s3_encryption',
            'validate_account',
        ]);
        expect(draft.edges).toHaveLength(2);
    });

    it('builds a draft with Block Public Access remediation', () => {
        const recommendation = {
            id: '11111111-1111-4111-8111-111111111112',
            title: 'Governance: S3 Bucket Must Not Be Publicly Accessible',
            description:
                'S3 bucket "cloud3-nops-nops-746872773540" does not have Block Public Access enabled and may be publicly accessible.',
            category: 'security',
            severity: 'critical',
            resourceReference: {
                cloudAccountId: '22222222-2222-4222-8222-222222222222',
                resourceId: 'cloud3-nops-nops-746872773540',
                resourceType: 'S3Bucket',
                region: 'us-east-1',
            },
        } as AiRecommendation;

        const draft = buildRecommendationAutomationDraft(recommendation);
        expect(draft.nodes[1]).toEqual(
            expect.objectContaining({
                type: AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE,
                name: 'Enable S3 Block Public Access',
                config: expect.objectContaining({
                    bucketName: 'cloud3-nops-nops-746872773540',
                    encryption: false,
                    publicAccessBlock: true,
                }),
            }),
        );
        expect(draft.plannedActions).toContain('remediate_s3_public_access');
    });

    it('builds snapshot + terminate flow for stopped-ec2-ebs-cost', () => {
        const recommendation = {
            id: '11111111-1111-4111-8111-111111111114',
            title: 'Optimization: stopped-ec2-ebs-cost',
            description:
                'Considere terminar a instância e criar snapshot do EBS se os dados forem necessários',
            category: 'finops',
            severity: 'medium',
            evidence: { type: 'stopped-ec2-ebs-cost' },
            resourceReference: {
                cloudAccountId: '22222222-2222-4222-8222-222222222222',
                resourceId: 'i-02605aa9181de90ee',
                resourceType: 'EC2 Instance',
                region: 'us-east-1',
            },
        } as AiRecommendation;

        const draft = buildRecommendationAutomationDraft(recommendation);
        expect(draft.nodes.map((n) => n.type)).toEqual([
            AUTOMATION_ACTION_TYPES.AWS_DATA_INPUT,
            AUTOMATION_ACTION_TYPES.AWS_EC2_CREATE_VOLUME_SNAPSHOTS,
            AUTOMATION_ACTION_TYPES.AWS_EC2_TERMINATE_INSTANCE,
            AUTOMATION_ACTION_TYPES.AWS_CALLER_IDENTITY,
        ]);
        expect(draft.nodes[1].config).toEqual(
            expect.objectContaining({
                instanceId: 'i-02605aa9181de90ee',
                region: 'us-east-1',
            }),
        );
        expect(draft.nodes[2].config).toEqual(
            expect.objectContaining({
                instanceId: 'i-02605aa9181de90ee',
                deleteVolumes: true,
            }),
        );
        expect(draft.plannedActions).toEqual([
            'read_context',
            'remediate_ec2_snapshot_ebs',
            'remediate_ec2_terminate_delete_ebs',
            'validate_account',
        ]);
    });

    it('falls back to manual remediation when no mapping exists', () => {
        const recommendation = {
            id: '11111111-1111-4111-8111-111111111113',
            title: 'Governance: Security Group Must Not Allow SSH From Any IP',
            description: 'Security group allows 0.0.0.0/0 on port 22',
            category: 'security',
            severity: 'high',
            resourceReference: {
                cloudAccountId: '22222222-2222-4222-8222-222222222222',
                resourceId: 'sg-123',
                resourceType: 'SecurityGroup',
                region: 'us-east-1',
            },
        } as AiRecommendation;

        const draft = buildRecommendationAutomationDraft(recommendation);
        expect(draft.nodes.map((n) => n.type)).toEqual([
            AUTOMATION_ACTION_TYPES.AWS_DATA_INPUT,
            AUTOMATION_ACTION_TYPES.AWS_CALLER_IDENTITY,
        ]);
        expect(draft.plannedActions).toEqual([
            'read_context',
            'manual_remediation',
            'validate_account',
        ]);
    });
});
