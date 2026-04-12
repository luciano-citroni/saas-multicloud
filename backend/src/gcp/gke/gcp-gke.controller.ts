import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { GcpGkeService } from './gcp-gke.service';
import { GcpGkeClusterResponseDto } from './swagger.dto';

@ApiTags('GCP GKE')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('gcp/gke')
export class GcpGkeController {
    constructor(private readonly service: GcpGkeService) {}

    @Get('accounts/:cloudAccountId/clusters')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar clusters GKE' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpGkeClusterResponseDto] })
    async listClusters(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        void org;
        return this.service.listClustersFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/clusters/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar clusters GKE' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpGkeClusterResponseDto] })
    async syncClusters(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncClustersFromGcp(cloudAccountId, org.id);
    }
}
