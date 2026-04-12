import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { GcpIamService } from './gcp-iam.service';
import { GcpServiceAccountResponseDto } from './swagger.dto';

@ApiTags('GCP IAM')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('gcp/iam')
export class GcpIamController {
    constructor(private readonly service: GcpIamService) {}

    @Get('accounts/:cloudAccountId/service-accounts')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar Service Accounts GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpServiceAccountResponseDto] })
    async listServiceAccounts(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        void org;
        return this.service.listServiceAccountsFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/service-accounts/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar Service Accounts GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpServiceAccountResponseDto] })
    async syncServiceAccounts(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncServiceAccountsFromGcp(cloudAccountId, org.id);
    }
}
