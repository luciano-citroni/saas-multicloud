import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';

import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';

import { GovernanceService } from '../services/governance.service';
import type { GovernanceScoreResult } from '../services/governance.service';

import {
    GovernanceScanResponseDto,
    GovernanceJobStatusDto,
    GovernanceJobsPaginatedResponseDto,
    GovernanceFindingDto,
    GovernanceScoreDto,
    GovernancePolicyDto,
    GovernanceSuppressionDto,
    CreateGovernanceSuppressionDto,
    GovernanceScoreHistoryDto,
} from '../dto/swagger.dto';

@ApiTags('Governance')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa (contexto de tenant)',
    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('governance')
export class GovernanceController {
    constructor(private readonly governanceService: GovernanceService) {}

    // =========================================================================
    // Políticas disponíveis
    // =========================================================================

    @Get('policies')
    @ApiOperation({
        summary: 'Listar políticas de governança disponíveis',
        description: 'Retorna todas as políticas registradas. Suporta filtro por provider (aws, gcp) e framework de compliance (CIS_AWS_1_4, PCI_DSS_3_2_1, SOC2, NIST_800_53, ISO_27001).',
    })
    @ApiQuery({ name: 'provider', required: false, example: 'aws', description: 'Filtrar por provider' })
    @ApiQuery({ name: 'framework', required: false, example: 'CIS_AWS_1_4', description: 'Filtrar por framework de compliance' })
    @ApiResponse({ status: 200, description: 'Lista de políticas', type: [GovernancePolicyDto] })
    listPolicies(@Query('provider') provider?: string, @Query('framework') framework?: string) {
        return this.governanceService.listPolicies(provider, framework);
    }

    // =========================================================================
    // Scan
    // =========================================================================

    @Post('accounts/:cloudAccountId/scan')
    @HttpCode(202)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Iniciar scan de governança',
        description:
            'Inicia um scan assíncrono que avalia todos os recursos sincronizados da conta contra as políticas de governança. O provider é detectado automaticamente da conta. Retorna o jobId para acompanhamento.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 202, description: 'Scan enfileirado com sucesso', type: GovernanceScanResponseDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 403, description: 'Sem permissão (requer ADMIN ou OWNER)' })
    async startScan(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GovernanceScanResponseDto> {
        return this.governanceService.startScan(cloudAccountId, org.id);
    }

    // =========================================================================
    // Jobs
    // =========================================================================

    @Get('accounts/:cloudAccountId/jobs')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar jobs de governança',
        description: 'Retorna os jobs de governança para a conta com paginação.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Lista de jobs paginada', type: GovernanceJobsPaginatedResponseDto })
    async listJobs(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ): Promise<GovernanceJobsPaginatedResponseDto> {
        const parsedPage = page ? Number.parseInt(page, 10) : undefined;
        const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;

        return this.governanceService.listJobs(cloudAccountId, org.id, parsedPage, parsedLimit);
    }

    @Get('accounts/:cloudAccountId/jobs/:jobId')
    @ApiOperation({ summary: 'Consultar status de um job de governança' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Status do job', type: GovernanceJobStatusDto })
    @ApiResponse({ status: 400, description: 'Job não encontrado' })
    async getJob(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('jobId', ParseUUIDPipe) jobId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GovernanceJobStatusDto> {
        const job = await this.governanceService.getJob(jobId, cloudAccountId, org.id);

        return {
            id: job.id,
            provider: job.provider,
            status: job.status,
            score: job.score,
            totalFindings: job.totalFindings,
            totalChecks: job.totalChecks,
            error: job.error,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
        };
    }

    // =========================================================================
    // Findings
    // =========================================================================

    @Get('accounts/:cloudAccountId/jobs/:jobId/findings')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar achados (findings) de um job',
        description: 'Retorna todos os achados não-conformes e warnings gerados pelo scan. Ordenados por severidade (crítico primeiro).',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Lista de achados', type: [GovernanceFindingDto] })
    @ApiResponse({ status: 400, description: 'Job não encontrado' })
    async getJobFindings(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('jobId', ParseUUIDPipe) jobId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GovernanceFindingDto[]> {
        return this.governanceService.getJobFindings(jobId, cloudAccountId, org.id);
    }

    // =========================================================================
    // Score
    // =========================================================================

    @Get('accounts/:cloudAccountId/score')
    @ApiOperation({
        summary: 'Obter score de governança mais recente',
        description: 'Retorna o score, totais e breakdown por categoria do último scan concluído. Inclui contagem de achados críticos e altos.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Score do último scan completo', type: GovernanceScoreDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 404, description: 'Nenhum scan concluído encontrado' })
    async getLatestScore(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GovernanceScoreDto> {
        const result = await this.governanceService.getLatestScore(cloudAccountId, org.id);

        if (!result) {
            throw new NotFoundException('Nenhum scan de governança concluído encontrado para esta conta.');
        }

        return result;
    }

    @Get('accounts/:cloudAccountId/score/history')
    @ApiOperation({
        summary: 'Histórico de scores de governança',
        description: 'Retorna os últimos N scores de scans concluídos para a conta, do mais recente ao mais antigo. Permite visualizar a evolução da conformidade ao longo do tempo.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'limit', required: false, example: 10, description: 'Quantidade de registros (máx 50, padrão 10)' })
    @ApiResponse({ status: 200, description: 'Histórico de scores', type: [GovernanceScoreHistoryDto] })
    async getScoreHistory(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
        @Query('limit') limit?: string
    ): Promise<GovernanceScoreHistoryDto[]> {
        const parsedLimit = limit ? Number.parseInt(limit, 10) : 10;
        return this.governanceService.getScoreHistory(cloudAccountId, org.id, parsedLimit);
    }

    // =========================================================================
    // Suppressions (false positive management)
    // =========================================================================

    @Get('accounts/:cloudAccountId/suppressions')
    @ApiOperation({
        summary: 'Listar supressões de findings',
        description: 'Retorna todas as supressões ativas para a conta. Supressões excluem achados específicos do score e dos relatórios.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Lista de supressões', type: [GovernanceSuppressionDto] })
    async listSuppressions(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GovernanceSuppressionDto[]> {
        return this.governanceService.listSuppressions(org.id, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/suppressions')
    @HttpCode(201)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Criar supressão de finding',
        description:
            'Cria uma supressão que exclui um achado específico do score de governança. Use para gerenciar false positives ou exceções aprovadas. Requer justificativa obrigatória.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiBody({ type: CreateGovernanceSuppressionDto })
    @ApiResponse({ status: 201, description: 'Supressão criada com sucesso', type: GovernanceSuppressionDto })
    @ApiResponse({ status: 400, description: 'Dados inválidos ou CloudAccount não encontrada' })
    @ApiResponse({ status: 403, description: 'Sem permissão (requer ADMIN ou OWNER)' })
    async createSuppression(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Body() body: CreateGovernanceSuppressionDto,
        @CurrentOrganization() org: Organization
    ): Promise<GovernanceSuppressionDto> {
        return this.governanceService.createSuppression(org.id, {
            cloudAccountId,
            policyId: body.policyId,
            resourceId: body.resourceId ?? null,
            reason: body.reason,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        });
    }

    @Delete('suppressions/:suppressionId')
    @HttpCode(204)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Remover supressão de finding',
        description: 'Remove uma supressão existente. O achado voltará a impactar o score no próximo scan.',
    })
    @ApiParam({ name: 'suppressionId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 204, description: 'Supressão removida com sucesso' })
    @ApiResponse({ status: 404, description: 'Supressão não encontrada' })
    @ApiResponse({ status: 403, description: 'Sem permissão (requer ADMIN ou OWNER)' })
    async deleteSuppression(
        @Param('suppressionId', ParseUUIDPipe) suppressionId: string,
        @CurrentOrganization() org: Organization
    ): Promise<void> {
        return this.governanceService.deleteSuppression(suppressionId, org.id);
    }
}
