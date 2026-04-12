import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';
import type { Response } from 'express';
import * as fs from 'fs';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';

import { GcpAssessmentService } from './gcp-assessment.service';
import { GcpAssessmentExcelService } from './gcp-assessment-excel.service';
import { GcpAssessmentJobResponseDto, GcpGeneralSyncJobResponseDto, GcpGeneralSyncJobStatusResponseDto } from './dto/swagger.dto';

@ApiTags('GCP Assessment')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('gcp/assessment')
export class GcpAssessmentController {
    constructor(
        private readonly service: GcpAssessmentService,
        private readonly excelService: GcpAssessmentExcelService
    ) {}

    @Post('accounts/:cloudAccountId/sync')
    @HttpCode(202)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Enfileirar sync geral da conta GCP',
        description: 'Enfileira um job de sync geral de todos os recursos GCP para a conta (VMs, redes, storage, SQL, GKE, IAM).',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 202, description: 'Sync geral enfileirado com sucesso', type: GcpGeneralSyncJobResponseDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 403, description: 'Módulo assessment não habilitado ou papel insuficiente' })
    async enqueueGeneralSync(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GcpGeneralSyncJobResponseDto> {
        return this.service.enqueueGeneralSync(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/jobs/:jobId')
    @ApiOperation({
        summary: 'Consultar status do job de sync geral GCP',
        description: 'Retorna o estado atual de um job da fila de sync geral GCP.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string' })
    @ApiResponse({ status: 200, description: 'Status do job de sync', type: GcpGeneralSyncJobStatusResponseDto })
    async getGeneralSyncJobStatus(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('jobId') jobId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GcpGeneralSyncJobStatusResponseDto> {
        return this.service.getGeneralSyncJobStatus(jobId, cloudAccountId, org.id);
    }

    @Post('accounts/:cloudAccountId')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Gerar arquitetura GCP da conta',
        description: 'Usa os recursos já sincronizados no banco como fonte de verdade e retorna um grafo de arquitetura pronto para React Flow.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Arquitetura gerada com sucesso', type: GcpAssessmentJobResponseDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 403, description: 'Módulo assessment não habilitado ou papel insuficiente' })
    async startAssessment(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.buildAssessmentArchitecture(cloudAccountId, org.id);
    }

    @Post('accounts/:cloudAccountId/report')
    @HttpCode(202)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Gerar relatório Excel GCP',
        description: 'Enfileira um job assíncrono que gera o relatório Excel a partir dos dados sincronizados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 202, description: 'Job de geração de relatório enfileirado', type: GcpAssessmentJobResponseDto })
    async generateReport(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GcpAssessmentJobResponseDto> {
        const job = await this.service.startAssessment(cloudAccountId, org.id, false);
        return { id: job.id, cloudAccountId: job.cloudAccountId, organizationId: job.organizationId, status: job.status, error: job.error, createdAt: job.createdAt };
    }

    @Get('accounts/:cloudAccountId/assessment-jobs/:jobId')
    @ApiOperation({ summary: 'Consultar status do job de assessment GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: GcpAssessmentJobResponseDto })
    async getJobStatus(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('jobId', ParseUUIDPipe) jobId: string,
        @CurrentOrganization() org: Organization
    ): Promise<GcpAssessmentJobResponseDto> {
        const job = await this.service.getJobStatus(jobId, cloudAccountId, org.id);
        return {
            id: job.id,
            cloudAccountId: job.cloudAccountId,
            organizationId: job.organizationId,
            status: job.status,
            error: job.error,
            excelDownloadUrl: job.excelFileName ? `/gcp/assessment/accounts/${cloudAccountId}/assessment-jobs/${job.id}/download` : undefined,
            createdAt: job.createdAt,
            completedAt: job.completedAt ?? undefined,
        };
    }

    @Get('accounts/:cloudAccountId/assessment-jobs')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar jobs de assessment GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpAssessmentJobResponseDto] })
    async listJobs(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        const jobs = await this.service.listJobs(cloudAccountId, org.id);
        return jobs.map((job) => ({
            id: job.id,
            cloudAccountId: job.cloudAccountId,
            organizationId: job.organizationId,
            status: job.status,
            error: job.error,
            excelDownloadUrl: job.excelFileName ? `/gcp/assessment/accounts/${cloudAccountId}/assessment-jobs/${job.id}/download` : undefined,
            createdAt: job.createdAt,
            completedAt: job.completedAt ?? undefined,
        }));
    }

    @Get('accounts/:cloudAccountId/assessment-jobs/:jobId/download')
    @ApiOperation({ summary: 'Download do relatório Excel GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Arquivo Excel (.xlsx)' })
    async downloadExcel(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('jobId', ParseUUIDPipe) jobId: string,
        @CurrentOrganization() org: Organization,
        @Res({ passthrough: true }) res: Response
    ): Promise<StreamableFile> {
        const job = await this.service.getJobStatus(jobId, cloudAccountId, org.id);

        if (!job.excelFileName || job.status !== 'completed') {
            res.status(400);
            throw new Error('Relatório Excel GCP ainda não disponível.');
        }

        const filePath = this.excelService.getExcelFilePath(job.excelFileName);

        if (!fs.existsSync(filePath)) {
            res.status(404);
            throw new Error('Arquivo Excel não encontrado.');
        }

        const stream = fs.createReadStream(filePath);
        let cleanedUp = false;

        const cleanup = async (): Promise<void> => {
            if (cleanedUp) return;
            cleanedUp = true;
            await this.excelService.deleteExcel(job.excelFileName as string);
            await this.service.clearJobExcelFile(jobId, cloudAccountId, org.id);
        };

        res.once('finish', () => { void cleanup(); });
        res.once('close', () => { void cleanup(); });
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${job.excelFileName}"`,
        });

        return new StreamableFile(stream);
    }
}
