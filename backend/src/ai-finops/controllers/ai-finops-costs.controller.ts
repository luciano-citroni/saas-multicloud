import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    StreamableFile,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiHeader,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlanModuleGuard, RequirePlanModule } from '../../common/guards/plan-module.guard';
import { SystemModule } from '../../common/modules/system-modules';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { RolesGuard } from '../../rbac/roles.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { TenantGuard } from '../../tenant/tenant.guard';
import { Tenant } from '../../db/entites/tenant.entity';
import {
    createBudgetSchema,
    dashboardQuerySchema,
    explorerQuerySchema,
    updateBudgetSchema,
    usageQuerySchema,
    type CreateBudgetDto,
    type DashboardQueryDto,
    type ExplorerQueryDto,
    type UpdateBudgetDto,
    type UsageQueryDto,
} from '../dto';
import { AiFinopsUsageService } from '../services/ai-finops-usage.service';
import { AiFinopsPricingService } from '../services/ai-finops-pricing.service';
import { AiFinopsBudgetService } from '../services/ai-finops-budget.service';
import { AiFinopsRecommendationService } from '../services/ai-finops-recommendation.service';
import { AiFinopsLicenseService } from '../services/ai-finops-license.service';
import {
    aiFinopsExecutivePdfFileName,
    buildAiFinopsExecutivePdf,
} from '../ai-finops-executive-report.pdf';

type AuthUser = { id: string };

@ApiTags('AI FinOps Costs')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', required: true })
@RequirePlanModule(SystemModule.AI_FINOPS)
@UseGuards(TenantGuard, RolesGuard, PlanModuleGuard)
@Controller('ai-finops/costs')
export class AiFinopsCostsController {
    constructor(
        private readonly usage: AiFinopsUsageService,
        private readonly pricing: AiFinopsPricingService,
        private readonly budgets: AiFinopsBudgetService,
        private readonly recommendations: AiFinopsRecommendationService,
        private readonly licenses: AiFinopsLicenseService,
    ) {}

    @Get('dashboard')
    @ApiOperation({ summary: 'AI cost dashboard (official vs gateway estimated separated)' })
    dashboard(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto,
    ) {
        return this.usage.dashboard(org.id, query);
    }

    @Get('executive')
    @ApiOperation({ summary: 'Executive overview: top consumers/models/providers' })
    executive(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto,
    ) {
        return this.usage.executiveOverview(org.id, query);
    }

    @Get('mom')
    @ApiOperation({ summary: 'Month-over-month comparison for AI KPIs' })
    mom(
        @CurrentOrganization() org: Tenant,
        @Query('midOrganizationId') midOrganizationId?: string,
    ) {
        return this.usage.monthOverMonth(org.id, midOrganizationId);
    }

    @Get('reconciliation')
    @ApiOperation({ summary: 'Compare provider_admin official vs gateway estimated by day/provider/model' })
    reconciliation(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto,
    ) {
        return this.usage.reconciliation(org.id, query);
    }

    @Get('heatmap')
    @ApiOperation({ summary: 'User × model heatmap aggregation' })
    heatmap(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto,
    ) {
        return this.usage.heatmap(org.id, query);
    }

    @Get('users')
    @ApiOperation({ summary: 'List provider users available for AI cost filters' })
    listUsers(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto,
    ) {
        return this.usage.listUsersForFilter(org.id, query);
    }

    @Get('usage')
    listUsage(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(usageQuerySchema)) query: UsageQueryDto,
    ) {
        return this.usage.listUsage(org.id, query);
    }

    @Get('usage/export')
    exportUsage(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(usageQuerySchema)) query: UsageQueryDto,
    ) {
        return this.usage.listUsage(org.id, { ...query, page: 1, limit: 100 });
    }

    @Get('explorer')
    explorer(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(explorerQuerySchema)) query: ExplorerQueryDto,
    ) {
        return this.usage.explore(org.id, query);
    }

    @Get('models')
    listModels(@Query('providerId') providerId?: string) {
        return this.pricing.listModels(providerId);
    }

    @Get('budgets')
    listBudgets(
        @CurrentOrganization() org: Tenant,
        @Query('midOrganizationId') midOrganizationId?: string,
    ) {
        return this.budgets.list(org.id, midOrganizationId);
    }

    @Post('budgets')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER)
    @HttpCode(201)
    createBudget(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(createBudgetSchema)) dto: CreateBudgetDto,
    ) {
        return this.budgets.create(org.id, user.id, dto);
    }

    @Patch('budgets/:budgetId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER)
    updateBudget(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('budgetId', ParseUUIDPipe) budgetId: string,
        @Body(new ZodValidationPipe(updateBudgetSchema)) dto: UpdateBudgetDto,
    ) {
        return this.budgets.update(org.id, user.id, budgetId, dto);
    }

    @Delete('budgets/:budgetId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER)
    @HttpCode(204)
    async deleteBudget(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('budgetId', ParseUUIDPipe) budgetId: string,
    ) {
        await this.budgets.remove(org.id, user.id, budgetId);
    }

    @Get('budgets/:budgetId/status')
    budgetStatus(
        @CurrentOrganization() org: Tenant,
        @Param('budgetId', ParseUUIDPipe) budgetId: string,
    ) {
        return this.budgets.computeStatus(org.id, budgetId);
    }

    @Get('recommendations')
    listRecommendations(
        @CurrentOrganization() org: Tenant,
        @Query('midOrganizationId') midOrganizationId?: string,
    ) {
        return this.recommendations.list(org.id, midOrganizationId);
    }

    @Post('recommendations/generate')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER)
    generateRecommendations(
        @CurrentOrganization() org: Tenant,
        @Body() body: { organizationId: string },
    ) {
        return this.recommendations.generateFromUsage(org.id, body.organizationId);
    }

    @Get('export/executive.csv')
    @ApiOperation({ summary: 'Executive CSV export (official vs estimated kept separate)' })
    async exportExecutiveCsv(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto,
    ) {
        const [executive, mom, licenseSummary] = await Promise.all([
            this.usage.executiveOverview(org.id, query),
            this.usage.monthOverMonth(org.id, query.midOrganizationId),
            this.licenses.summary(org.id, query.midOrganizationId),
        ]);
        const lines = [
            ['section', 'key', 'officialCost', 'estimatedCost', 'tokens', 'momOfficialPct'].join(','),
            [
                'totals',
                'official',
                executive.totals.officialCost,
                '',
                executive.totals.totalTokens,
                mom.deltas.officialCost ?? '',
            ].join(','),
            [
                'totals',
                'gateway_estimated',
                '',
                executive.totals.estimatedGatewayCost,
                '',
                mom.deltas.estimatedGatewayCost ?? '',
            ].join(','),
            [
                'licenses',
                'seats_quantity',
                licenseSummary.seats.monthlyCost,
                '',
                licenseSummary.seats.quantity,
                '',
            ].join(','),
            [
                'licenses',
                'credits_remaining',
                '',
                '',
                licenseSummary.credits.remaining,
                '',
            ].join(','),
            ...executive.topProviders.map((row) =>
                ['provider', row.key, row.officialCost, row.estimatedCost, row.totalTokens ?? '', ''].join(','),
            ),
            ...executive.topModels.map((row) =>
                ['model', row.key, row.officialCost, row.estimatedCost, row.totalTokens ?? '', ''].join(','),
            ),
        ];
        return {
            filename: `ai-finops-executive-${executive.period.end}.csv`,
            contentType: 'text/csv',
            csv: lines.join('\n'),
            note: executive.note,
        };
    }

    @Get('export/executive.pdf')
    @ApiOperation({ summary: 'Executive PDF report' })
    @Header('Content-Type', 'application/pdf')
    async exportExecutivePdf(
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto,
    ): Promise<StreamableFile> {
        const [executive, mom, licenseSummary] = await Promise.all([
            this.usage.executiveOverview(org.id, query),
            this.usage.monthOverMonth(org.id, query.midOrganizationId),
            this.licenses.summary(org.id, query.midOrganizationId),
        ]);
        const buffer = buildAiFinopsExecutivePdf({
            organizationLabel: query.midOrganizationId ?? org.id,
            period: executive.period,
            totals: executive.totals,
            momDeltas: mom.deltas,
            topProviders: executive.topProviders,
            topModels: executive.topModels,
            licenseBurn: {
                seats: licenseSummary.seats.quantity,
                creditRemaining: licenseSummary.credits.remaining,
            },
            note: executive.note,
        });
        const filename = aiFinopsExecutivePdfFileName(
            query.midOrganizationId ?? org.id,
            executive.period.end,
        );
        return new StreamableFile(buffer, {
            type: 'application/pdf',
            disposition: `attachment; filename="${filename}"`,
        });
    }
}
