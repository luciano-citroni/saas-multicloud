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

import { GcpStorageService } from './gcp-storage.service';
import { GcpStorageBucketResponseDto } from './swagger.dto';

@ApiTags('GCP Storage')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, CloudAccountAccessGuard, RolesGuard)
@Controller('gcp/storage')
export class GcpStorageController {
    constructor(private readonly service: GcpStorageService) {}

    @Get('accounts/:cloudAccountId/buckets')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar buckets GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpStorageBucketResponseDto] })
    async listBuckets(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Tenant,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        return this.service.listBucketsFromDatabase(cloudAccountId, parsePaginationQuery(page, limit));
    }

    @Post('accounts/:cloudAccountId/buckets/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar buckets GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpStorageBucketResponseDto] })
    async syncBuckets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncBucketsFromGcp(cloudAccountId, org.id);
    }
}
