import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';

import {
    ApiBearerAuth,
    ApiBody,
    ApiHeader,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { z } from 'zod';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { RolesGuard } from '../../rbac/roles.guard';

import { Roles } from '../../rbac/roles.decorator';

import { OrgRole } from '../../rbac/roles.enum';

import { FinopsService } from '../services/finops.service';
import { FinopsAnalysisService } from '../services/finops-analysis.service';
import { FinopsBudgetService } from '../services/finops-budget.service';

import {
    FinopsConsentResponseDto,
    AcceptConsentRequestDto,
    FinopsSyncRequestDto,
    FinopsSyncResponseDto,
    FinopsJobStatusDto,
    CostSummaryDto,
    CostHistoryItemDto,
    CostByServiceItemDto,
    FinopsScoreDto,
    FinopsRecommendationDto,
    SavingOpportunityDto,
    PricingRequestDto,
    PricingResponseDto,
    MarginRequestDto,
    MarginResponseDto,
    CreateBudgetRequestDto,
    BudgetDto,
    BudgetStatusDto,
} from '../dto/swagger.dto';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const cloudProviderSchema = z.enum(['aws', 'azure']);

const consentSchema = z.object({
    cloudProvider: cloudProviderSchema,
});

const syncSchema = z.object({
    cloudProvider: cloudProviderSchema,
    granularity: z.enum(['daily', 'monthly']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use formato YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use formato YYYY-MM-DD'),
});

const pricingSchema = z.object({ markupPercentage: z.number().min(0).max(1000) });

const marginSchema = z.object({
    realCost: z.number().min(0),
    revenue: z.number().min(0),
    currency: z.string().length(3).optional(),
});

const budgetSchema = z.object({
    name: z.string().min(1).max(255),
    amount: z.number().positive(),
    currency: z.string().length(3).optional(),
    period: z.enum(['monthly']).optional(),
    service: z.string().max(255).optional(),
    alertThresholds: z.array(z.number().min(1).max(200)).optional(),
});

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('FinOps')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa (contexto de tenant)',
    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('finops')
export class FinopsController {
    constructor(
        private readonly finopsService: FinopsService,
        private readonly analysisService: FinopsAnalysisService,
        private readonly budgetService: FinopsBudgetService,
    ) {}

    // =========================================================================
    // Consentimento
    // =========================================================================

    @Get('accounts/:cloudAccountId/consent')
    @ApiOperation({
        summary: 'Consultar estado de consentimento FinOps',
        description:
            'Retorna se o usuário aceitou o termo de consentimento para coleta de custos via AWS Cost Explorer ou Azure Cost Management.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: FinopsConsentResponseDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    async getConsent(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Query('cloudProvider') cloudProvider: string,
        @CurrentOrganization() org: Organization,
    ): Promise<FinopsConsentResponseDto> {
        const provider = cloudProviderSchema.parse(cloudProvider);
        return this.finopsService.getConsent(cloudAccountId, org.id, provider);
    }

    @Post('accounts/:cloudAccountId/consent')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Aceitar termo de consentimento FinOps',
        description:
            'Registra a aceitação explícita do usuário para que o sistema colete dados de custo via APIs de terceiros (AWS Cost Explorer, Azure Cost Management). A aceitação é obrigatória antes de qualquer coleta.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiBody({ type: AcceptConsentRequestDto })
    @ApiResponse({ status: 200, type: FinopsConsentResponseDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 403, description: 'Sem permissão (requer ADMIN ou OWNER)' })
    async acceptConsent(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Body(new ZodValidationPipe(consentSchema)) body: { cloudProvider: 'aws' | 'azure' },
        @CurrentOrganization() org: Organization,
    ): Promise<FinopsConsentResponseDto> {
        return this.finopsService.acceptConsent(cloudAccountId, org.id, body.cloudProvider);
    }

    @Delete('accounts/:cloudAccountId/consent')
    @HttpCode(204)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Revogar consentimento FinOps',
        description: 'Revoga o consentimento para coleta de custos. Dados históricos já coletados são preservados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 204, description: 'Consentimento revogado com sucesso' })
    @ApiResponse({ status: 400, description: 'Consentimento não encontrado ou já revogado' })
    async revokeConsent(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Query('cloudProvider') cloudProvider: string,
        @CurrentOrganization() org: Organization,
    ): Promise<void> {
        const provider = cloudProviderSchema.parse(cloudProvider);
        return this.finopsService.revokeConsent(cloudAccountId, org.id, provider);
    }

    // =========================================================================
    // Sync / Coleta de custos
    // =========================================================================

    @Post('accounts/:cloudAccountId/sync')
    @HttpCode(202)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Iniciar coleta de custos (FinOps Sync)',
        description:
            'Inicia de forma assíncrona a coleta de dados de custo do provedor configurado. Requer consentimento prévio. Retorna o jobId para acompanhamento.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiBody({ type: FinopsSyncRequestDto })
    @ApiResponse({ status: 202, type: FinopsSyncResponseDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 409, description: 'Consentimento não aceito para este provider' })
    async startSync(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Body(new ZodValidationPipe(syncSchema)) body: z.infer<typeof syncSchema>,
        @CurrentOrganization() org: Organization,
    ): Promise<FinopsSyncResponseDto> {
        return this.finopsService.startSync(
            cloudAccountId,
            org.id,
            body.cloudProvider,
            body.granularity,
            body.startDate,
            body.endDate,
        );
    }

    @Get('accounts/:cloudAccountId/jobs')
    @ApiOperation({
        summary: 'Listar jobs de coleta de custos',
        description: 'Lista os jobs de coleta de custos para a conta, mais recentes primeiro.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [FinopsJobStatusDto] })
    async listJobs(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<FinopsJobStatusDto[]> {
        return this.finopsService.listJobs(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/jobs/:jobId')
    @ApiOperation({ summary: 'Consultar status de um job de coleta de custos' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: FinopsJobStatusDto })
    @ApiResponse({ status: 404, description: 'Job não encontrado' })
    async getJob(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('jobId', ParseUUIDPipe) jobId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<FinopsJobStatusDto> {
        const job = await this.finopsService.getJob(jobId, cloudAccountId, org.id);
        return {
            id: job.id,
            status: job.status,
            cloudProvider: job.cloudProvider,
            granularity: job.granularity,
            periodStart: job.periodStart,
            periodEnd: job.periodEnd,
            recordsCollected: job.recordsCollected,
            error: job.error,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
        };
    }

    // =========================================================================
    // Dashboard / Análise de Custos
    // =========================================================================

    @Get('accounts/:cloudAccountId/dashboard')
    @ApiOperation({
        summary: 'Obter dados do dashboard FinOps',
        description: 'Retorna resumo de custos dos últimos 30 dias: total, top serviços, breakdown por cloud e tendência.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: CostSummaryDto })
    async getDashboard(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<CostSummaryDto> {
        return this.analysisService.getDashboardSummary(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/cost-history')
    @ApiOperation({
        summary: 'Histórico de custos por período',
        description: 'Retorna série temporal de custos agregados por data.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [CostHistoryItemDto] })
    async getCostHistory(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Query('granularity') granularity: string,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @CurrentOrganization() org: Organization,
    ): Promise<CostHistoryItemDto[]> {
        const gran = (granularity === 'monthly' ? 'monthly' : 'daily') as 'daily' | 'monthly';
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        return this.analysisService.getCostHistory(cloudAccountId, org.id, gran, start, end);
    }

    @Get('accounts/:cloudAccountId/cost-by-service')
    @ApiOperation({
        summary: 'Custo por serviço no mês',
        description: 'Retorna custo agrupado por serviço para o mês especificado, com comparação ao mês anterior e indicador de tendência.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [CostByServiceItemDto] })
    async getCostByService(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Query('year') year: string,
        @Query('month') month: string,
        @CurrentOrganization() org: Organization,
    ): Promise<CostByServiceItemDto[]> {
        const now = new Date();
        const y = year ? parseInt(year, 10) : now.getFullYear();
        const m = month ? parseInt(month, 10) : now.getMonth() + 1;
        return this.analysisService.getCostByService(cloudAccountId, org.id, y, m);
    }

    @Get('accounts/:cloudAccountId/score')
    @ApiOperation({
        summary: 'Obter score FinOps da conta',
        description:
            'Calcula e retorna o score FinOps (0–100) com base em eficiência, desperdício e tendência de crescimento. Inclui insights acionáveis.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: FinopsScoreDto })
    async getScore(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<FinopsScoreDto> {
        return this.analysisService.computeFinopsScore(cloudAccountId, org.id);
    }

    // =========================================================================
    // Recomendações
    // =========================================================================

    @Get('accounts/:cloudAccountId/recommendations')
    @ApiOperation({
        summary: 'Listar recomendações de otimização de custos',
        description: 'Retorna recomendações abertas geradas pelo Optimization Engine, ordenadas por prioridade e economia potencial.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [FinopsRecommendationDto] })
    async listRecommendations(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<FinopsRecommendationDto[]> {
        return this.analysisService.listRecommendations(cloudAccountId, org.id);
    }

    @Delete('accounts/:cloudAccountId/recommendations/:id')
    @HttpCode(204)
    @ApiOperation({ summary: 'Descartar uma recomendação' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 204, description: 'Recomendação descartada com sucesso' })
    async dismissRecommendation(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentOrganization() org: Organization,
    ): Promise<void> {
        return this.analysisService.dismissRecommendation(id, cloudAccountId, org.id);
    }

    // =========================================================================
    // Economia potencial
    // =========================================================================

    @Get('accounts/:cloudAccountId/savings')
    @ApiOperation({
        summary: 'Calcular economia potencial',
        description: 'Retorna a economia total estimada com base nas recomendações abertas, incluindo as 3 melhores oportunidades.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: SavingOpportunityDto })
    async getSavings(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<SavingOpportunityDto> {
        return this.analysisService.computeSavingOpportunity(cloudAccountId, org.id);
    }

    // =========================================================================
    // Monetização
    // =========================================================================

    @Post('accounts/:cloudAccountId/pricing')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Calcular preço com markup',
        description: 'Aplica um percentual de markup sobre o custo real da conta e retorna o preço final sugerido para o cliente.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiBody({ type: PricingRequestDto })
    @ApiResponse({ status: 200, type: PricingResponseDto })
    async computePricing(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Body(new ZodValidationPipe(pricingSchema)) body: z.infer<typeof pricingSchema>,
        @CurrentOrganization() org: Organization,
    ): Promise<PricingResponseDto> {
        return this.analysisService.computePricing(cloudAccountId, org.id, body.markupPercentage);
    }

    @Post('accounts/:cloudAccountId/margin')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Calcular margem do cliente',
        description: 'Compara o custo real de nuvem com a receita gerada pelo cliente e calcula a margem em valor e percentual.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiBody({ type: MarginRequestDto })
    @ApiResponse({ status: 200, type: MarginResponseDto })
    computeMargin(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Body(new ZodValidationPipe(marginSchema)) body: z.infer<typeof marginSchema>,
    ): MarginResponseDto {
        return this.analysisService.computeMargin(cloudAccountId, body.realCost, body.revenue, body.currency);
    }

    // =========================================================================
    // Budgets
    // =========================================================================

    @Post('accounts/:cloudAccountId/budgets')
    @HttpCode(201)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Criar budget de custos' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiBody({ type: CreateBudgetRequestDto })
    @ApiResponse({ status: 201, type: BudgetDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada ou dados inválidos' })
    async createBudget(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Body(new ZodValidationPipe(budgetSchema)) body: z.infer<typeof budgetSchema>,
        @CurrentOrganization() org: Organization,
    ): Promise<BudgetDto> {
        return this.budgetService.create(cloudAccountId, org.id, body);
    }

    @Get('accounts/:cloudAccountId/budgets')
    @ApiOperation({ summary: 'Listar budgets da conta' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [BudgetDto] })
    async listBudgets(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<BudgetDto[]> {
        return this.budgetService.list(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/budgets/status')
    @ApiOperation({
        summary: 'Status de todos os budgets ativos',
        description: 'Retorna o gasto atual vs limite para cada budget ativo, com alertas disparados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [BudgetStatusDto] })
    async listBudgetStatuses(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<BudgetStatusDto[]> {
        return this.budgetService.listBudgetStatuses(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/budgets/:budgetId')
    @ApiOperation({ summary: 'Consultar status de um budget específico' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'budgetId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: BudgetStatusDto })
    @ApiResponse({ status: 404, description: 'Budget não encontrado' })
    async getBudgetStatus(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('budgetId', ParseUUIDPipe) budgetId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<BudgetStatusDto> {
        return this.budgetService.getBudgetStatus(budgetId, cloudAccountId, org.id);
    }

    @Put('accounts/:cloudAccountId/budgets/:budgetId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Atualizar budget' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'budgetId', type: 'string', format: 'uuid' })
    @ApiBody({ type: CreateBudgetRequestDto })
    @ApiResponse({ status: 200, type: BudgetDto })
    @ApiResponse({ status: 404, description: 'Budget não encontrado' })
    async updateBudget(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('budgetId', ParseUUIDPipe) budgetId: string,
        @Body(new ZodValidationPipe(budgetSchema.partial())) body: Partial<z.infer<typeof budgetSchema>>,
        @CurrentOrganization() org: Organization,
    ): Promise<BudgetDto> {
        return this.budgetService.update(budgetId, cloudAccountId, org.id, body);
    }

    @Delete('accounts/:cloudAccountId/budgets/:budgetId')
    @HttpCode(204)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Remover budget' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'budgetId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 204, description: 'Budget removido com sucesso' })
    @ApiResponse({ status: 404, description: 'Budget não encontrado' })
    async removeBudget(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('budgetId', ParseUUIDPipe) budgetId: string,
        @CurrentOrganization() org: Organization,
    ): Promise<void> {
        return this.budgetService.remove(budgetId, cloudAccountId, org.id);
    }
}
