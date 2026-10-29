import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatToolService } from './chat-tool.service';
import { SystemModule } from '../common/modules/system-modules';
import { ErrorMessages } from '../common/messages/error-messages';

describe('ChatToolService', () => {
    const cloudService = {
        findByOrganization: jest.fn(),
        findByIdAndTenant: jest.fn(),
    };
    const finopsOrgOverviewService = {
        getOverview: jest.fn(),
        getOptimize: jest.fn(),
    };
    const governanceService = {
        getLatestScore: jest.fn(),
        getJobFindings: jest.fn(),
    };
    const automationsCrudService = {
        list: jest.fn(),
        listExecutions: jest.fn(),
    };
    const automationService = {
        listExecutions: jest.fn(),
    };
    const billingService = {
        getActivePlanForOrganization: jest.fn(),
    };
    const awsAssessmentReportService = {
        collectAllData: jest.fn(),
        buildSummary: jest.fn(),
    };
    const awsAssessmentService = { listJobs: jest.fn() };
    const azureAssessmentReportService = {
        collectAllData: jest.fn(),
        buildSummary: jest.fn(),
    };
    const azureAssessmentService = { listJobs: jest.fn() };
    const gcpAssessmentReportService = {
        collectAllData: jest.fn(),
        buildSummary: jest.fn(),
    };
    const gcpAssessmentService = { listJobs: jest.fn() };
    const auditService = { record: jest.fn() };

    const service = new ChatToolService(
        cloudService as never,
        finopsOrgOverviewService as never,
        governanceService as never,
        automationsCrudService as never,
        automationService as never,
        billingService as never,
        awsAssessmentReportService as never,
        awsAssessmentService as never,
        azureAssessmentReportService as never,
        azureAssessmentService as never,
        gcpAssessmentReportService as never,
        gcpAssessmentService as never,
        auditService as never,
    );

    const ctx = {
        organizationId: 'org-1',
        userId: 'user-1',
        enabledModules: new Set([SystemModule.FINOPS, SystemModule.GOVERNANCE, SystemModule.AUTOMATION]),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('filters tools by enabled plan modules', () => {
        const tools = service.listToolsForContext(new Set([SystemModule.FINOPS]));
        const names = tools.map((tool) => tool.name);
        expect(names).toContain('get_cost_summary');
        expect(names).toContain('get_cloud_accounts');
        expect(names).toContain('get_saas_documentation');
        expect(names).not.toContain('get_governance_score');
        expect(names).not.toContain('get_automations');
    });

    it('injects organization context and ignores model-supplied organizationId', async () => {
        cloudService.findByOrganization.mockResolvedValue([
            { id: 'acc-1', alias: 'prod', provider: 'aws', isActive: true },
        ]);

        await service.executeTool(
            'get_cloud_accounts',
            { organizationId: 'org-other', tenantId: 'org-other', userId: 'attacker' },
            ctx,
        );

        expect(cloudService.findByOrganization).toHaveBeenCalledWith('org-1', expect.any(Object));
        expect(cloudService.findByOrganization).not.toHaveBeenCalledWith('org-other', expect.anything());
    });

    it('rejects cloudAccountId that does not belong to the organization', async () => {
        cloudService.findByIdAndTenant.mockResolvedValue(null);
        await expect(
            service.executeTool('get_cost_summary', { cloudAccountId: '00000000-0000-4000-8000-000000000099' }, ctx),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(finopsOrgOverviewService.getOverview).not.toHaveBeenCalled();
    });

    it('rejects tools when module is not enabled', async () => {
        await expect(
            service.executeTool('get_governance_score', { cloudAccountId: '00000000-0000-4000-8000-000000000001' }, {
                ...ctx,
                enabledModules: new Set([SystemModule.FINOPS]),
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects invalid tool parameters', async () => {
        await expect(service.executeTool('get_cost_summary', { cloudAccountId: 'not-a-uuid' }, ctx)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('returns wrapped untrusted documentation without inventing modules', async () => {
        const result = await service.executeTool('get_saas_documentation', { topic: 'finops' }, {
            ...ctx,
            enabledModules: new Set(),
        });
        expect(result.content).toContain('UNTRUSTED_DATA');
        expect(result.sources[0]?.module).toBe('docs');
    });

    it('calls finops overview with backend organization id only', async () => {
        finopsOrgOverviewService.getOverview.mockResolvedValue({
            totals: { cost: 10, currency: 'USD' },
            accounts: [],
        });
        await service.executeTool('get_cost_summary', { period: 'last30days', organizationId: 'org-evil' }, ctx);
        expect(finopsOrgOverviewService.getOverview).toHaveBeenCalledWith('org-1', expect.objectContaining({ period: 'last30days' }));
    });

    it('surfaces explicit empty governance data', async () => {
        cloudService.findByIdAndTenant.mockResolvedValue({ id: 'acc-1', alias: 'a', provider: 'aws' });
        governanceService.getLatestScore.mockResolvedValue(null);
        const result = await service.executeTool(
            'get_governance_findings',
            { cloudAccountId: '00000000-0000-4000-8000-000000000001' },
            ctx,
        );
        expect(result.content).toContain(ErrorMessages.AI_CHAT.NO_DATA);
    });
});
