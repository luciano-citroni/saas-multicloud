import {
    BadRequestException,
    Controller,
    Get,
    GoneException,
    HttpCode,
    NotFoundException,
    Param,
    ParseUUIDPipe,
    Post,
    Res,
    StreamableFile,
    UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import type { Response } from 'express';

import * as fs from 'fs';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Tenant } from '../../db/entites/tenant.entity';

import { RolesGuard } from '../../rbac/roles.guard';

import { Roles } from '../../rbac/roles.decorator';

import { OrgRole } from '../../rbac/roles.enum';

import { AwsAssessmentService } from './aws-assessment.service';

import { AwsAssessmentExcelService } from './aws-assessment-excel.service';
import { AwsAssessmentReportService } from './aws-assessment-report.service';

import {
    AssessmentArchitectureResponseDto,
    AssessmentStatusResponseDto,
    GeneralSyncJobResponseDto,
    GeneralSyncJobStatusResponseDto,
} from './dto/swagger.dto';

@ApiTags('AWS Assessment')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa (contexto de tenant)',

    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('aws/assessment')
export class AwsAssessmentController {
    private static readonly EXCEL_RETENTION_MS = 24 * 60 * 60 * 1000;

    constructor(
        private readonly service: AwsAssessmentService,

        private readonly excelService: AwsAssessmentExcelService,

        private readonly reportService: AwsAssessmentReportService
    ) {}

    // =========================================================================

    // Assessment - Gerenciamento de Jobs e Geração de Arquitetura

    // =========================================================================

    @Post('accounts/:cloudAccountId/sync')
    @HttpCode(202)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER)
    @ApiOperation({
        summary: 'Enfileirar sync geral da conta AWS',

        description: 'Enfileira um job de sync geral de todos os endpoints de recursos AWS para a conta.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 202, description: 'Sync geral enfileirado com sucesso', type: GeneralSyncJobResponseDto })
    async enqueueGeneralSync(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @CurrentOrganization() org: Tenant
    ): Promise<GeneralSyncJobResponseDto> {
        return this.service.enqueueGeneralSync(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/jobs/:jobId')
    @ApiOperation({
        summary: 'Consultar status do job de sync geral',

        description: 'Retorna o status atual de um job da fila de sync geral da conta.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string' })
    @ApiResponse({ status: 200, description: 'Status do job de sync', type: GeneralSyncJobStatusResponseDto })
    async getQueuedJobStatus(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('jobId') jobId: string,

        @CurrentOrganization() org: Tenant
    ): Promise<GeneralSyncJobStatusResponseDto> {
        return this.service.getGeneralSyncJobStatus(jobId, cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/jobs')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar jobs da fila de sync geral',

        description: 'Retorna os jobs recentes da fila de sync geral para a conta, incluindo pendentes, em execução, concluídos e com falha.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Lista de jobs da fila', type: [GeneralSyncJobStatusResponseDto] })
    async listQueuedJobs(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @CurrentOrganization() org: Tenant
    ): Promise<GeneralSyncJobStatusResponseDto[]> {
        return this.service.listGeneralSyncJobs(cloudAccountId, org.id);
    }

    // =========================================================================

    // Assessment - Gerenciamento de Jobs e Geração de Arquitetura

    // =========================================================================

    @Post('accounts/:cloudAccountId')
    @HttpCode(200)
    @Roles(OrgRole.VIEWER)
    @ApiOperation({
        summary: 'Gerar arquitetura AWS da conta',

        description: 'Usa as tabelas já sincronizadas como fonte de verdade e retorna um grafo de arquitetura pronto para React Flow.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Arquitetura gerada com sucesso', type: AssessmentArchitectureResponseDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    async startAssessment(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @CurrentOrganization() org: Tenant
    ): Promise<AssessmentArchitectureResponseDto> {
        return this.service.buildAssessmentArchitecture(cloudAccountId, org.id);
    }

    @Post('accounts/:cloudAccountId/report')
    @HttpCode(202)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Gerar relatório Excel AWS',

        description: 'Enfileira um job assíncrono para sincronizar recursos e gerar o relatório Excel da conta AWS.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 202, description: 'Job de geração de relatório enfileirado', type: AssessmentStatusResponseDto })
    async generateReport(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @CurrentOrganization() org: Tenant
    ): Promise<AssessmentStatusResponseDto> {
        const job = await this.service.startAssessment(cloudAccountId, org.id, false);

        const excelExpiresAt = this.getExcelExpiresAt(job.completedAt);

        return {
            id: job.id,

            status: job.status,

            error: job.error ?? undefined,

            excelDownloadUrl: undefined,

            excelExpiresAt,

            createdAt: job.createdAt,

            completedAt: job.completedAt ?? undefined,
        };
    }

    // =========================================================================

    // Assessment - Status do Job

    // =========================================================================

    @Get('accounts/:cloudAccountId/assessment-jobs/:jobId')
    @ApiOperation({
        summary: 'Consultar status do assessment',

        description: 'Retorna o status atual do job de assessment, incluindo o resultado ao concluir.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Status do job', type: AssessmentStatusResponseDto })
    @ApiResponse({ status: 400, description: 'Job não encontrado' })
    async getJobStatus(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('jobId', ParseUUIDPipe) jobId: string,

        @CurrentOrganization() org: Tenant
    ): Promise<AssessmentStatusResponseDto> {
        const job = await this.service.getJobStatus(jobId, cloudAccountId, org.id);

        const excelExpiresAt = this.getExcelExpiresAt(job.completedAt);
        const canDownloadExcel = this.canDownloadExcel(job.status, job.excelFileName, excelExpiresAt);

        return {
            id: job.id,

            status: job.status,

            error: job.error ?? undefined,

            excelDownloadUrl: canDownloadExcel ? `/aws/assessment/accounts/${cloudAccountId}/assessment-jobs/${job.id}/download` : undefined,

            excelExpiresAt,

            createdAt: job.createdAt,

            completedAt: job.completedAt ?? undefined,
        };
    }

    // =========================================================================
    // Assessment - Listar Jobs
    // =========================================================================

    @Get('accounts/:cloudAccountId/assessment-jobs')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar jobs de assessment',

        description: 'Retorna os últimos 20 jobs de assessment para a conta.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Lista de jobs', type: [AssessmentStatusResponseDto] })
    async listJobs(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Tenant
    ): Promise<AssessmentStatusResponseDto[]> {
        const jobs = await this.service.listJobs(cloudAccountId, org.id);

        return jobs.map((job) => {
            const excelExpiresAt = this.getExcelExpiresAt(job.completedAt);
            const canDownloadExcel = this.canDownloadExcel(job.status, job.excelFileName, excelExpiresAt);

            return {
                id: job.id,
                status: job.status,
                error: job.error ?? undefined,
                excelDownloadUrl: canDownloadExcel ? `/aws/assessment/accounts/${cloudAccountId}/assessment-jobs/${job.id}/download` : undefined,
                excelExpiresAt,
                createdAt: job.createdAt,
                completedAt: job.completedAt ?? undefined,
            };
        });
    }

    // =========================================================================
    // Assessment - Download do Relatório Excel
    // =========================================================================

    @Get('accounts/:cloudAccountId/assessment-jobs/:jobId/download')
    @ApiOperation({
        summary: 'Download do relatório Excel',

        description: 'Faz o download do arquivo Excel gerado pelo assessment.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Arquivo Excel (.xlsx)' })
    @ApiResponse({ status: 400, description: 'Job não encontrado ou ainda em processamento' })
    async downloadExcel(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('jobId', ParseUUIDPipe) jobId: string,

        @CurrentOrganization() org: Tenant,

        @Res({ passthrough: true }) res: Response
    ): Promise<StreamableFile> {
        const job = await this.service.getJobStatus(jobId, cloudAccountId, org.id);
        const excelExpiresAt = this.getExcelExpiresAt(job.completedAt);

        if (this.isExcelExpired(excelExpiresAt)) {
            if (job.excelFileName) {
                await this.excelService.deleteExcel(job.excelFileName);
                await this.service.clearJobExcelFile(jobId, cloudAccountId, org.id);
            }

            throw new GoneException('O relatório Excel expirou. Gere um novo relatório para baixar novamente.');
        }

        if (job.status !== 'completed') {
            throw new BadRequestException('Relatório Excel ainda não disponível.');
        }

        let excelFileName = job.excelFileName;
        let filePath = excelFileName ? this.excelService.resolveExistingExcelFilePath(excelFileName) : null;

        if (!filePath) {
            const data = await this.reportService.collectAllData(cloudAccountId);
            excelFileName = await this.excelService.generateExcel(job.id, data);
            await this.service.setJobExcelFile(job.id, cloudAccountId, org.id, excelFileName);
            filePath = this.excelService.resolveExistingExcelFilePath(excelFileName);
        }

        if (!filePath) {
            await this.service.clearJobExcelFile(jobId, cloudAccountId, org.id);
            throw new NotFoundException('Arquivo Excel não encontrado.');
        }

        const stream = fs.createReadStream(filePath);

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

            'Content-Disposition': `attachment; filename="${excelFileName}"`,
        });

        return new StreamableFile(stream);
    }

    private getExcelExpiresAt(completedAt: Date | null | undefined): Date | undefined {
        if (!completedAt) {
            return undefined;
        }

        return new Date(completedAt.getTime() + AwsAssessmentController.EXCEL_RETENTION_MS);
    }

    private canDownloadExcel(status: string, excelFileName: string | null, excelExpiresAt?: Date): boolean {
        return status === 'completed' && Boolean(excelFileName) && !this.isExcelExpired(excelExpiresAt);
    }

    private isExcelExpired(excelExpiresAt?: Date): boolean {
        if (!excelExpiresAt) {
            return false;
        }

        return excelExpiresAt.getTime() <= Date.now();
    }
}
