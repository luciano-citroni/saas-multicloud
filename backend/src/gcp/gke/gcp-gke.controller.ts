import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CloudAccountAccessGuard } from '../../cloud/cloud-account-access.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Tenant } from '../../db/entites/tenant.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';
import { parsePaginationQuery } from '../../common/pagination/parse-pagination-query';

import { GcpGkeService } from './gcp-gke.service';
import { GcpGkeClusterResponseDto } from './swagger.dto';

@ApiTags('GCP GKE')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, CloudAccountAccessGuard, RolesGuard)
@Controller('gcp/gke')
export class GcpGkeController {
    constructor(private readonly service: GcpGkeService) {}

    @Get('accounts/:cloudAccountId/clusters')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar clusters GKE' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpGkeClusterResponseDto] })
    async listClusters(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Tenant,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        return this.service.listClustersFromDatabase(cloudAccountId, parsePaginationQuery(page, limit));
    }

    @Post('accounts/:cloudAccountId/clusters/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar clusters GKE' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpGkeClusterResponseDto] })
    async syncClusters(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncClustersFromGcp(cloudAccountId, org.id);
    }
}
