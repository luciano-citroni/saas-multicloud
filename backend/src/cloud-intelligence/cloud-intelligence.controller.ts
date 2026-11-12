import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiHeader,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { PlanModuleGuard, RequirePlanModule } from '../common/guards/plan-module.guard';
import { SystemModule } from '../common/modules/system-modules';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { RolesGuard } from '../rbac/roles.guard';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import { TenantGuard } from '../tenant/tenant.guard';
import { Tenant } from '../db/entites/tenant.entity';
import { CloudIntelligenceDashboardService } from './dashboard/dashboard.service';
import { DailyIntelligenceService } from './daily-intelligence/daily-intelligence.service';
import {
    dailySettingsSchema,
    dashboardQuerySchema,
    listRecommendationsQuerySchema,
    recommendationIdParamSchema,
    updateQuotaSchema,
    updateRecommendationSchema,
    upsertKnowledgeDocSchema,
    type DailySettingsDto,
    type DashboardQuery,
    type ListRecommendationsQuery,
    type RecommendationIdParam,
    type UpdateQuotaDto,
    type UpdateRecommendationDto,
    type UpsertKnowledgeDocDto,
} from './dto';
import { KnowledgeBaseService } from './knowledge/knowledge-base.service';
import { RecommendationAutomationService } from './recommendations/recommendation-automation.service';
import { RecommendationsService } from './recommendations/recommendations.service';
import {
    AiDailyReportResponseDto,
    AiQuotaResponseDto,
    AiRecommendationResponseDto,
    AiUsageOverviewResponseDto,
    CiDashboardResponseDto,
    DailySettingsRequestDto,
    DailySettingsResponseDto,
    ExecuteRecommendationResponseDto,
    PrepareAutomationResponseDto,
    UpdateQuotaRequestDto,
    UpdateRecommendationRequestDto,
    UpsertKnowledgeRequestDto,
    UpsertKnowledgeResponseDto,
} from './swagger.dto';
import { listCapabilities } from './usage/ai-tier.policy';
import { AiQuotasService } from './usage/ai-quotas.service';
import { AiUsageService } from './usage/ai-usage.service';
import { AiRoiService } from './roi/ai-roi.service';

type AuthUser = { sub: string; sessionId: string };

@ApiTags('Cloud Intelligence')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'Organization UUID',
    required: true,
})
@RequirePlanModule(SystemModule.CLOUD_INTELLIGENCE)
@UseGuards(TenantGuard, RolesGuard, PlanModuleGuard)
@Controller('cloud-intelligence')
export class CloudIntelligenceController {
    constructor(
        private readonly usageService: AiUsageService,
        private readonly quotasService: AiQuotasService,
        private readonly recommendationsService: RecommendationsService,
        private readonly recommendationAutomationService: RecommendationAutomationService,
        private readonly dashboardService: CloudIntelligenceDashboardService,
        private readonly dailyIntelligenceService: DailyIntelligenceService,
        private readonly knowledgeBaseService: KnowledgeBaseService,
        private readonly roiService: AiRoiService,
    ) {}

    @Get('roi')
    @ApiOperation({ summary: 'List Cloud Intelligence ROI snapshots' })
    @ApiResponse({ status: 200 })
    async listRoi(@CurrentOrganization() org: Tenant) {
        const [latest, items] = await Promise.all([
            this.roiService.getLatest(org.id),
            this.roiService.listSnapshots(org.id),
        ]);
        return { latest, items };
    }

    @Post('roi/capture')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Capture a weekly ROI snapshot now' })
    @ApiResponse({ status: 200 })
    async captureRoi(@CurrentOrganization() org: Tenant) {
        return this.roiService.captureWeeklySnapshot(org.id);
    }

    @Get('dashboard')
    @ApiOperation({ summary: 'Cloud Intelligence dashboard payload' })
    @ApiResponse({ status: 200, type: CiDashboardResponseDto })
    async getDashboard(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
    ) {
        return this.dashboardService.getDashboard(org.id, query);
    }

    @Get('usage')
    @ApiOperation({ summary: 'Get AI usage overview for the organization' })
    @ApiResponse({ status: 200, type: AiUsageOverviewResponseDto })
    async getUsage(@CurrentOrganization() org: Tenant) {
        return this.usageService.getUsageOverview(org.id);
    }

    @Get('quotas')
    @ApiOperation({ summary: 'Get AI quotas and remaining allowance' })
    @ApiResponse({ status: 200, type: AiQuotaResponseDto })
    async getQuotas(@CurrentOrganization() org: Tenant) {
        const snapshot = await this.quotasService.getSnapshot(org.id);
        return { ...snapshot, capabilities: listCapabilities(snapshot.tier) };
    }

    @Patch('quotas')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Update AI quotas for the organization' })
    @ApiBody({ type: UpdateQuotaRequestDto })
    @ApiResponse({ status: 200, type: AiQuotaResponseDto })
    async updateQuotas(
        @CurrentOrganization() org: Tenant,
        @Body(new ZodValidationPipe(updateQuotaSchema)) dto: UpdateQuotaDto,
    ) {
        await this.quotasService.updateQuota(org.id, dto);
        const snapshot = await this.quotasService.getSnapshot(org.id);
        return { ...snapshot, capabilities: listCapabilities(snapshot.tier) };
    }

    @Get('daily-settings')
    @ApiOperation({ summary: 'Get Daily Intelligence settings' })
    @ApiResponse({ status: 200, type: DailySettingsResponseDto })
    async getDailySettings(@CurrentOrganization() org: Tenant) {
        const snapshot = await this.quotasService.getSnapshot(org.id);
        return {
            dailyIntelligenceEnabled: snapshot.dailyIntelligenceEnabled,
            notificationGroupIds: snapshot.notificationGroupIds,
            tier: snapshot.tier,
        };
    }

    @Patch('daily-settings')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Update Daily Intelligence settings' })
    @ApiBody({ type: DailySettingsRequestDto })
    @ApiResponse({ status: 200, type: DailySettingsResponseDto })
    async updateDailySettings(
        @CurrentOrganization() org: Tenant,
        @Body(new ZodValidationPipe(dailySettingsSchema)) dto: DailySettingsDto,
    ) {
        await this.quotasService.updateQuota(org.id, dto);
        return this.getDailySettings(org);
    }

    @Get('daily-reports')
    @ApiOperation({ summary: 'List Daily Cloud Intelligence reports' })
    @ApiResponse({ status: 200, type: [AiDailyReportResponseDto] })
    async listDailyReports(@CurrentOrganization() org: Tenant) {
        return this.dailyIntelligenceService.listReports(org.id);
    }

    @Get('daily-reports/:id')
    @ApiOperation({ summary: 'Get a Daily Cloud Intelligence report' })
    @ApiResponse({ status: 200, type: AiDailyReportResponseDto })
    @ApiResponse({ status: 404, description: 'Report not found' })
    async getDailyReport(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(recommendationIdParamSchema)) params: RecommendationIdParam,
    ) {
        return this.dailyIntelligenceService.getReport(params.id, org.id);
    }

    @Post('daily-reports/generate')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Manually generate today Daily Intelligence report' })
    @ApiResponse({ status: 200, type: AiDailyReportResponseDto })
    @ApiResponse({ status: 403, description: 'Tier does not allow Daily Intelligence' })
    async generateDailyReport(@CurrentOrganization() org: Tenant) {
        return this.dailyIntelligenceService.generateForOrganization(org.id);
    }

    @Get('recommendations')
    @ApiOperation({ summary: 'List AI recommendations' })
    @ApiResponse({ status: 200, type: [AiRecommendationResponseDto] })
    async listRecommendations(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(listRecommendationsQuerySchema))
        query: ListRecommendationsQuery,
    ) {
        return this.recommendationsService.list(org.id, {
            status: query.status,
            category: query.category,
            severity: query.severity,
            source: query.source,
            q: query.q,
            agentType: query.agentType,
            assignee: query.assignee,
            automatable: query.automatable,
            minScore: query.minScore,
            correlated: query.correlated,
        });
    }

    @Get('recommendations/:id')
    @ApiOperation({ summary: 'Get AI recommendation detail (records rec_viewed)' })
    @ApiResponse({ status: 200, type: AiRecommendationResponseDto })
    async getRecommendation(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param(new ZodValidationPipe(recommendationIdParamSchema)) params: RecommendationIdParam,
    ) {
        return this.recommendationsService.markViewed(params.id, org.id, user.sub);
    }

    @Patch('recommendations/:id')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER)
    @ApiOperation({ summary: 'Update AI recommendation status' })
    @ApiBody({ type: UpdateRecommendationRequestDto })
    @ApiResponse({ status: 200, type: AiRecommendationResponseDto })
    async updateRecommendation(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param(new ZodValidationPipe(recommendationIdParamSchema)) params: RecommendationIdParam,
        @Body(new ZodValidationPipe(updateRecommendationSchema)) dto: UpdateRecommendationDto,
    ) {
        return this.recommendationsService.patchRecommendation(params.id, org.id, dto, user.sub);
    }

    @Post('recommendations/:id/prepare-automation')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER)
    @ApiOperation({ summary: 'Create a DRAFT automation from a recommendation' })
    @ApiResponse({ status: 200, type: PrepareAutomationResponseDto })
    @ApiResponse({ status: 403, description: 'Insufficient AI tier or automation module' })
    async prepareAutomation(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param(new ZodValidationPipe(recommendationIdParamSchema)) params: RecommendationIdParam,
    ) {
        return this.recommendationAutomationService.prepareAutomation(params.id, org.id, user.sub);
    }

    @Post('recommendations/:id/acknowledge-anomaly')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER)
    @ApiOperation({ summary: 'Acknowledge the FinOps cost anomaly linked to a recommendation' })
    @ApiResponse({ status: 200, description: 'Anomaly acknowledged and recommendation dismissed' })
    @ApiResponse({ status: 400, description: 'Recommendation is not a cost anomaly' })
    async acknowledgeAnomalyRecommendation(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param(new ZodValidationPipe(recommendationIdParamSchema)) params: RecommendationIdParam,
    ) {
        return this.recommendationAutomationService.acknowledgeAnomaly(params.id, org.id, user.sub);
    }

    @Post('recommendations/:id/execute')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Execute the published automation linked to a recommendation' })
    @ApiResponse({ status: 200, type: ExecuteRecommendationResponseDto })
    @ApiResponse({ status: 400, description: 'Automation missing or not ACTIVE' })
    async executeRecommendation(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param(new ZodValidationPipe(recommendationIdParamSchema)) params: RecommendationIdParam,
    ) {
        return this.recommendationAutomationService.executeAutomation(params.id, org.id, user.sub);
    }

    @Get('knowledge')
    @ApiOperation({ summary: 'List organization private knowledge documents (Enterprise)' })
    @ApiResponse({ status: 200 })
    @ApiResponse({ status: 403, description: 'Enterprise AI tier required' })
    async listKnowledge(@CurrentOrganization() org: Tenant) {
        return this.knowledgeBaseService.listOrgDocuments(org.id);
    }

    @Post('knowledge')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Upsert organization private knowledge (Enterprise)' })
    @ApiBody({ type: UpsertKnowledgeRequestDto })
    @ApiResponse({ status: 200, type: UpsertKnowledgeResponseDto })
    @ApiResponse({ status: 403, description: 'Enterprise AI tier required' })
    async upsertKnowledge(
        @CurrentOrganization() org: Tenant,
        @Body(new ZodValidationPipe(upsertKnowledgeDocSchema)) dto: UpsertKnowledgeDocDto,
    ) {
        return this.knowledgeBaseService.upsertOrgDocument(org.id, dto);
    }

    @Delete('knowledge/:id')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(204)
    @ApiOperation({ summary: 'Delete organization private knowledge document' })
    @ApiResponse({ status: 204 })
    @ApiResponse({ status: 404, description: 'Document not found' })
    async deleteKnowledge(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(recommendationIdParamSchema)) params: RecommendationIdParam,
    ) {
        await this.knowledgeBaseService.deleteOrgDocument(org.id, params.id);
    }
}
