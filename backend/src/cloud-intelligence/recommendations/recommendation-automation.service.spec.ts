import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AutomationWorkflowStatus } from '../../db/entites/automation.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import { RecommendationAutomationService } from './recommendation-automation.service';

describe('RecommendationAutomationService', () => {
    const recommendationsService = {
        findOrFail: jest.fn(),
        updateStatus: jest.fn(),
        patchResourceReference: jest.fn(),
    };
    const automationsCrudService = {
        create: jest.fn(),
        update: jest.fn(),
        findById: jest.fn(),
        publish: jest.fn(),
        revise: jest.fn(),
        execute: jest.fn(),
    };
    const quotasService = {
        getTier: jest.fn(),
    };
    const billingService = {
        assertModuleEnabled: jest.fn(),
    };
    const auditService = {
        record: jest.fn(),
    };
    const anomalyRepository = {
        findOne: jest.fn(),
        save: jest.fn(),
    };
    const finopsRecommendationRepository = {
        findOne: jest.fn(),
    };
    const ec2Repository = {
        findOne: jest.fn(),
    };

    let service: RecommendationAutomationService;

    const recommendation = {
        id: 'rec-1',
        status: 'NEW',
        title: 'Governance: S3 Bucket Must Have Server-Side Encryption Enabled',
        description: 'S3 bucket "demo-bucket" does not have server-side encryption enabled.',
        category: 'security',
        severity: 'high',
        resourceReference: {
            cloudAccountId: 'acc-1',
            resourceId: 'demo-bucket',
            resourceType: 'S3Bucket',
            region: 'us-east-1',
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        quotasService.getTier.mockResolvedValue('professional');
        billingService.assertModuleEnabled.mockResolvedValue(undefined);
        recommendationsService.findOrFail.mockResolvedValue({ ...recommendation });
        recommendationsService.updateStatus.mockImplementation(async (_id, _org, status) => ({
            ...recommendation,
            status,
            resourceReference: recommendation.resourceReference,
        }));
        recommendationsService.patchResourceReference.mockImplementation(async (_id, _org, ref) => ({
            ...recommendation,
            status: 'APPROVED',
            resourceReference: ref,
        }));
        automationsCrudService.create.mockResolvedValue({
            id: 'auto-1',
            status: AutomationWorkflowStatus.DRAFT,
        });
        automationsCrudService.update.mockResolvedValue({ id: 'auto-1' });
        automationsCrudService.publish.mockResolvedValue({
            id: 'auto-1',
            status: AutomationWorkflowStatus.ACTIVE,
            version: 1,
        });
        automationsCrudService.execute.mockResolvedValue({ id: 'exec-1' });
        auditService.record.mockResolvedValue(undefined);
        anomalyRepository.findOne.mockResolvedValue(null);
        anomalyRepository.save.mockImplementation(async (row) => row);
        finopsRecommendationRepository.findOne.mockResolvedValue(null);
        ec2Repository.findOne.mockResolvedValue(null);

        service = new RecommendationAutomationService(
            recommendationsService as never,
            automationsCrudService as never,
            quotasService as never,
            billingService as never,
            auditService as never,
            anomalyRepository as never,
            finopsRecommendationRepository as never,
            ec2Repository as never,
        );
    });

    it('rejects prepare for cost anomalies (acknowledge instead)', async () => {
        const anomalyRec = {
            ...recommendation,
            title: 'Cost anomaly: Amazon WorkSpaces',
            description: 'WorkSpaces cost is 99% above baseline',
            category: 'finops',
            resourceReference: { cloudAccountId: 'acc-1' },
            evidence: { anomalyId: 'anom-1' },
        };
        recommendationsService.findOrFail.mockResolvedValue(anomalyRec);

        await expect(service.prepareAutomation('rec-1', 'org-1', 'user-1')).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(service.prepareAutomation('rec-1', 'org-1', 'user-1')).rejects.toMatchObject({
            response: expect.objectContaining({
                message: ErrorMessages.CLOUD_INTELLIGENCE.AUTOMATION_NOT_MAPPED,
            }),
        });
        expect(automationsCrudService.create).not.toHaveBeenCalled();
    });

    it('acknowledges FinOps anomaly and dismisses recommendation', async () => {
        const anomalyRec = {
            ...recommendation,
            status: 'NEW',
            title: 'Cost anomaly: Amazon WorkSpaces',
            description: 'WorkSpaces cost is 99% above baseline',
            category: 'finops',
            resourceReference: { cloudAccountId: 'acc-1' },
            evidence: { anomalyId: 'anom-1' },
        };
        recommendationsService.findOrFail.mockResolvedValue(anomalyRec);
        recommendationsService.updateStatus.mockResolvedValue({
            ...anomalyRec,
            status: 'DISMISSED',
        });
        anomalyRepository.findOne.mockResolvedValue({
            id: 'anom-1',
            status: 'open',
            cloudAccountId: 'acc-1',
        });

        const result = await service.acknowledgeAnomaly('rec-1', 'org-1', 'user-1');

        expect(anomalyRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'anom-1', status: 'acknowledged' }),
        );
        expect(recommendationsService.updateStatus).toHaveBeenCalledWith('rec-1', 'org-1', 'DISMISSED');
        expect(result).toEqual(
            expect.objectContaining({
                anomalyId: 'anom-1',
                anomalyStatus: 'acknowledged',
            }),
        );
    });

    it('rejects prepare-automation for basic tier', async () => {
        quotasService.getTier.mockResolvedValue('basic');

        await expect(service.prepareAutomation('rec-1', 'org-1', 'user-1')).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(automationsCrudService.create).not.toHaveBeenCalled();
    });

    it('creates, publishes, and leaves automation ready to execute', async () => {
        const result = await service.prepareAutomation('rec-1', 'org-1', 'user-1');

        expect(recommendationsService.updateStatus).toHaveBeenCalledWith('rec-1', 'org-1', 'REVIEWING');
        expect(recommendationsService.updateStatus).toHaveBeenCalledWith('rec-1', 'org-1', 'APPROVED');
        expect(automationsCrudService.create).toHaveBeenCalled();
        expect(automationsCrudService.update).toHaveBeenCalledWith(
            'auto-1',
            'org-1',
            'user-1',
            expect.objectContaining({
                nodes: expect.arrayContaining([
                    expect.objectContaining({ type: 'AWS_S3_BUCKET_CREATE' }),
                ]),
            }),
        );
        expect(automationsCrudService.publish).toHaveBeenCalledWith('auto-1', 'org-1', 'user-1');
        expect(result).toEqual(
            expect.objectContaining({
                automationId: 'auto-1',
                editorUrl: '/automations/auto-1',
                executeUrl: '/automations/auto-1?execute=1',
                readyToExecute: true,
                alreadyPrepared: false,
                plannedActions: expect.arrayContaining([
                    'remediate_s3_encryption',
                    'ready_to_execute',
                ]),
            }),
        );
        expect(automationsCrudService.execute).not.toHaveBeenCalled();
    });

    it('recreates automation when stored automationId is missing', async () => {
        recommendationsService.findOrFail.mockResolvedValue({
            ...recommendation,
            status: 'REVIEWING',
            resourceReference: {
                ...recommendation.resourceReference,
                automationId: 'missing-auto',
            },
        });
        automationsCrudService.findById.mockRejectedValue(
            new NotFoundException(ErrorMessages.AUTOMATION.WORKFLOW_NOT_FOUND),
        );

        const result = await service.prepareAutomation('rec-1', 'org-1', 'user-1');

        expect(automationsCrudService.create).toHaveBeenCalled();
        expect(automationsCrudService.publish).toHaveBeenCalledWith('auto-1', 'org-1', 'user-1');
        expect(result.automationId).toBe('auto-1');
        expect(result.alreadyPrepared).toBe(false);
        expect(result.readyToExecute).toBe(true);
    });

    it('refreshes and republishes an existing automation', async () => {
        recommendationsService.findOrFail.mockResolvedValue({
            ...recommendation,
            status: 'REVIEWING',
            resourceReference: {
                ...recommendation.resourceReference,
                automationId: 'auto-1',
                plannedActions: ['no_auto_mutation'],
            },
        });
        automationsCrudService.findById.mockResolvedValue({
            id: 'auto-1',
            status: AutomationWorkflowStatus.ACTIVE,
            version: 1,
        });

        const result = await service.prepareAutomation('rec-1', 'org-1', 'user-1');

        expect(automationsCrudService.create).not.toHaveBeenCalled();
        expect(automationsCrudService.revise).toHaveBeenCalledWith('auto-1', 'org-1', 'user-1');
        expect(automationsCrudService.update).toHaveBeenCalled();
        expect(automationsCrudService.publish).toHaveBeenCalledWith('auto-1', 'org-1', 'user-1');
        expect(result.readyToExecute).toBe(true);
        expect(result.alreadyPrepared).toBe(true);
    });

    it('executes published automation after user confirmation', async () => {
        recommendationsService.findOrFail.mockResolvedValue({
            ...recommendation,
            status: 'APPROVED',
            resourceReference: {
                ...recommendation.resourceReference,
                automationId: 'auto-1',
                readyToExecute: true,
            },
        });
        automationsCrudService.findById.mockResolvedValue({
            id: 'auto-1',
            status: AutomationWorkflowStatus.ACTIVE,
            version: 1,
        });

        const result = await service.executeAutomation('rec-1', 'org-1', 'user-1');

        expect(recommendationsService.updateStatus).toHaveBeenCalledWith('rec-1', 'org-1', 'EXECUTING');
        expect(automationsCrudService.execute).toHaveBeenCalledWith('auto-1', 'org-1', 'user-1', {
            confirm: true,
        });
        expect(result).toEqual(
            expect.objectContaining({
                automationId: 'auto-1',
                executionId: 'exec-1',
                executionUrl: '/automations/auto-1/executions/exec-1',
            }),
        );
    });

    it('blocks execute when automation is still draft', async () => {
        recommendationsService.findOrFail.mockResolvedValue({
            ...recommendation,
            status: 'APPROVED',
            resourceReference: { ...recommendation.resourceReference, automationId: 'auto-1' },
        });
        automationsCrudService.findById.mockResolvedValue({
            id: 'auto-1',
            status: AutomationWorkflowStatus.DRAFT,
            version: 0,
        });

        await expect(service.executeAutomation('rec-1', 'org-1', 'user-1')).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(service.executeAutomation('rec-1', 'org-1', 'user-1')).rejects.toMatchObject({
            response: expect.objectContaining({
                message: ErrorMessages.CLOUD_INTELLIGENCE.HUMAN_REVIEW_REQUIRED,
                readyToExecute: false,
            }),
        });
        expect(automationsCrudService.execute).not.toHaveBeenCalled();
    });
});
