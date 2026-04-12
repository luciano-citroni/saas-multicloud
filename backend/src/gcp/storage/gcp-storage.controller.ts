import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { GcpStorageService } from './gcp-storage.service';
import { GcpStorageBucketResponseDto } from './swagger.dto';

@ApiTags('GCP Storage')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('gcp/storage')
export class GcpStorageController {
    constructor(private readonly service: GcpStorageService) {}

    @Get('accounts/:cloudAccountId/buckets')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar buckets GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpStorageBucketResponseDto] })
    async listBuckets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        void org;
        return this.service.listBucketsFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/buckets/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar buckets GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpStorageBucketResponseDto] })
    async syncBuckets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncBucketsFromGcp(cloudAccountId, org.id);
    }
}
