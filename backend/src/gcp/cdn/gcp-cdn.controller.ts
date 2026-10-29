import { CloudAccountAccessGuard } from '../../cloud/cloud-account-access.guard';
import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Tenant } from '../../db/entites/tenant.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { GcpCdnService } from './gcp-cdn.service';
import { GcpCdnBackendServiceResponseDto } from './swagger.dto';

@ApiTags('GCP CDN')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, CloudAccountAccessGuard, RolesGuard)
@Controller('gcp/cdn')
export class GcpCdnController {
    constructor(private readonly service: GcpCdnService) {}

    @Get('accounts/:cloudAccountId/backend-services')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar backend services com CDN (Cloud CDN)' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpCdnBackendServiceResponseDto] })
    async list(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.listFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/backend-services/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar backend services (Cloud CDN) do GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpCdnBackendServiceResponseDto] })
    async sync(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncFromGcp(cloudAccountId, org.id);
    }
}
