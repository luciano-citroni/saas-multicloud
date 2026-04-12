import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { GcpCloudRunService } from './gcp-cloudrun.service';
import { GcpCloudRunJobResponseDto, GcpCloudRunServiceResponseDto } from './swagger.dto';

@ApiTags('GCP Cloud Run')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('gcp/cloudrun')
export class GcpCloudRunController {
    constructor(private readonly service: GcpCloudRunService) {}

    @Get('accounts/:cloudAccountId/services')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar Cloud Run services' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpCloudRunServiceResponseDto] })
    async list(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        void org;
        return this.service.listFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/services/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar Cloud Run services do GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpCloudRunServiceResponseDto] })
    async sync(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncFromGcp(cloudAccountId, org.id);
    }

    // ── Jobs ──────────────────────────────────────────────────────────────────

    @Get('accounts/:cloudAccountId/jobs')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar Cloud Run jobs' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpCloudRunJobResponseDto] })
    async listJobs(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        void org;
        return this.service.listJobsFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/jobs/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar Cloud Run jobs do GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpCloudRunJobResponseDto] })
    async syncJobs(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncJobsFromGcp(cloudAccountId, org.id);
    }
}
