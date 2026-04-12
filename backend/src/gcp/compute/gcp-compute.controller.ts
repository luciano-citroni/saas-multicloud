import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { GcpComputeService } from './gcp-compute.service';
import { GcpVmInstanceResponseDto } from './swagger.dto';

@ApiTags('GCP Compute')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('gcp/compute')
export class GcpComputeController {
    constructor(private readonly service: GcpComputeService) {}

    @Get('accounts/:cloudAccountId/instances')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar VM instances GCP do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpVmInstanceResponseDto] })
    async listInstances(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        void org;
        return this.service.listInstancesFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/instances/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar VM instances GCP da API' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpVmInstanceResponseDto] })
    async syncInstances(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncInstancesFromGcp(cloudAccountId, org.id);
    }
}
