import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Response } from 'express';

import * as fs from 'fs';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { RolesGuard } from '../../rbac/roles.guard';

import { Roles } from '../../rbac/roles.decorator';

import { OrgRole } from '../../rbac/roles.enum';

import { AzureAssessmentService } from './azure-assessment.service';

import { AzureAssessmentExcelService } from './azure-assessment-excel.service';

import { AzureAssessmentJob } from '../../db/entites/azure-assessment-job.entity';

import { AzureAssessmentJobResponseDto } from './dto/swagger.dto';

@ApiTags('Azure Assessment')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa',

    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('azure/assessment')
export class AzureAssessmentController {
    constructor(
        private readonly service: AzureAssessmentService,

        private readonly excelService: AzureAssessmentExcelService
    ) {}

    // =========================================================================
    // POST /azure/assessment/accounts/:cloudAccountId — Iniciar assessment
    // =========================================================================

    @Post('accounts/:cloudAccountId')
    @HttpCode(202)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Iniciar assessment Azure da conta',

        description:
            'Enfileira um job de assessment Azure. Sincroniza todos os recursos via ARG e gera um relatório Excel.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 202, description: 'Assessment enfileirado com sucesso', type: AzureAssessmentJobResponseDto })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    async startAssessment(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @CurrentOrganization() org: Organization
    ): Promise<AzureAssessmentJobResponseDto> {
        const job = await this.service.startAssessment(cloudAccountId, org.id, true);

        return this.mapToDto(job, cloudAccountId);
    }

    // =========================================================================
    // GET /azure/assessment/accounts/:cloudAccountId/jobs/:jobId — Status
    // =========================================================================

    @Get('accounts/:cloudAccountId/jobs/:jobId')
    @ApiOperation({ summary: 'Consultar status do assessment Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Status do job de assessment', type: AzureAssessmentJobResponseDto })
    @ApiResponse({ status: 400, description: 'Job não encontrado' })
    async getJobStatus(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('jobId', ParseUUIDPipe) jobId: string,

        @CurrentOrganization() org: Organization
    ): Promise<AzureAssessmentJobResponseDto> {
        const job = await this.service.getJobStatus(jobId, cloudAccountId, org.id);

        return this.mapToDto(job, cloudAccountId);
    }

    // =========================================================================
    // GET /azure/assessment/accounts/:cloudAccountId/jobs — Listar jobs
    // =========================================================================

    @Get('accounts/:cloudAccountId/jobs')
    @ApiOperation({ summary: 'Listar jobs de assessment Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Lista de jobs', type: [AzureAssessmentJobResponseDto] })
    async listJobs(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @CurrentOrganization() org: Organization
    ): Promise<AzureAssessmentJobResponseDto[]> {
        const jobs = await this.service.listJobs(cloudAccountId, org.id);

        return jobs.map((job) => this.mapToDto(job, cloudAccountId));
    }

    // =========================================================================
    // GET /azure/assessment/accounts/:cloudAccountId/jobs/:jobId/download
    // =========================================================================

    @Get('accounts/:cloudAccountId/jobs/:jobId/download')
    @ApiOperation({ summary: 'Download do relatório Excel Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Arquivo Excel (.xlsx)' })
    @ApiResponse({ status: 400, description: 'Job não encontrado ou ainda em processamento' })
    @ApiResponse({ status: 404, description: 'Arquivo Excel não encontrado no servidor' })
    async downloadExcel(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('jobId', ParseUUIDPipe) jobId: string,

        @CurrentOrganization() org: Organization,

        @Res({ passthrough: true }) res: Response
    ): Promise<StreamableFile> {
        const job = await this.service.getJobStatus(jobId, cloudAccountId, org.id);

        if (!job.excelFileName || job.status !== 'completed') {
            res.status(400);

            throw new Error('Relatório Excel ainda não disponível.');
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

        res.once('finish', () => {
            void cleanup();
        });

        res.once('close', () => {
            void cleanup();
        });

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

            'Content-Disposition': `attachment; filename="${job.excelFileName}"`,
        });

        return new StreamableFile(stream);
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private mapToDto(job: AzureAssessmentJob, cloudAccountId: string): AzureAssessmentJobResponseDto {
        const dto = new AzureAssessmentJobResponseDto();

        dto.id = job.id;

        dto.cloudAccountId = job.cloudAccountId;

        dto.organizationId = job.organizationId;

        dto.status = job.status;

        dto.error = job.error;

        dto.completedAt = job.completedAt;

        dto.createdAt = job.createdAt;

        dto.updatedAt = job.updatedAt;

        if (job.excelFileName && job.status === 'completed') {
            dto.excelDownloadUrl = `/azure/assessment/accounts/${cloudAccountId}/jobs/${job.id}/download`;
        }

        return dto;
    }
}
