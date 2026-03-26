import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { RolesGuard } from '../../rbac/roles.guard';

import { Roles } from '../../rbac/roles.decorator';

import { OrgRole } from '../../rbac/roles.enum';

import { GovernanceService } from '../services/governance.service';

import {
    GovernanceScanResponseDto,
    GovernanceJobStatusDto,
    GovernanceFindingDto,
    GovernanceScoreDto,
    GovernancePolicyDto,
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
        description: 'Retorna todas as políticas registradas no motor de governança, com severidade, tipo de recurso e provider.',
    })
    @ApiResponse({ status: 200, description: 'Lista de políticas', type: [GovernancePolicyDto] })
    listPolicies() {
        return this.governanceService.listPolicies();
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
            'Inicia um scan assíncrono que avalia todos os recursos sincronizados da conta contra as políticas de governança registradas. Retorna o jobId para acompanhamento.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 202, description: 'Scan enfileirado com sucesso', type: GovernanceScanResponseDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
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
        description: 'Retorna os jobs de governança para a conta, incluindo status, score e totais. Suporta paginação via page e limit.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Lista de jobs', type: [GovernanceJobStatusDto] })
    async listJobs(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GovernanceJobStatusDto[]> {
        return this.governanceService.listJobs(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/jobs/:jobId')
    @ApiOperation({
        summary: 'Consultar status de um job de governança',
        description: 'Retorna o status atual do job, incluindo score, totais e erro (se falhou).',
    })
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
        description:
            'Retorna todos os achados não-conformes e warnings gerados pelo scan. Ordenados por severidade (crítico primeiro).',
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
        description:
            'Retorna o score, totais e data do último scan de governança concluído com sucesso para a conta. Retorna 404 se nenhum scan foi concluído ainda.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Score do último scan completo', type: GovernanceScoreDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 404, description: 'Nenhum scan concluído encontrado para esta conta' })
    async getLatestScore(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GovernanceScoreDto> {
        const job = await this.governanceService.getLatestScore(cloudAccountId, org.id);

        if (!job) {
            return {
                jobId: '',
                score: 0,
                totalFindings: 0,
                totalChecks: 0,
                evaluatedAt: new Date(0),
            };
        }

        return {
            jobId: job.id,
            score: job.score ?? 0,
            totalFindings: job.totalFindings ?? 0,
            totalChecks: job.totalChecks ?? 0,
            evaluatedAt: job.completedAt ?? job.createdAt,
        };
    }
}
