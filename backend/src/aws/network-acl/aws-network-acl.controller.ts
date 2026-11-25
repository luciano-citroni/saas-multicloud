import { RolesGuard } from '../../rbac/roles.guard';
import { CloudAccountAccessGuard } from '../../cloud/cloud-account-access.guard';
import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Tenant } from '../../db/entites/tenant.entity';
import { AwsNetworkAclService } from './aws-network-acl.service';
import { NetworkAclResponseDto, NetworkAclSyncResponseDto } from './swagger.dto';

@ApiTags('AWS Network ACL')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard, CloudAccountAccessGuard, RolesGuard)
@Controller('aws/network-acls')
export class AwsNetworkAclController {
    constructor(private readonly service: AwsNetworkAclService) {}

    @Get('accounts/:cloudAccountId')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar Network ACLs do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [NetworkAclResponseDto] })
    list(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() _org: Tenant) {
        return this.service.listNetworkAclsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/:networkAclId')
    @ApiOperation({ summary: 'Buscar Network ACL por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'networkAclId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: NetworkAclResponseDto })
    @ApiResponse({ status: 400, description: 'Network ACL não encontrada' })
    get(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('networkAclId', ParseUUIDPipe) networkAclId: string,
        @CurrentOrganization() _org: Tenant,
    ) {
        return this.service.getNetworkAclById(networkAclId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar Network ACLs da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [NetworkAclSyncResponseDto] })
    sync(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncNetworkAclsFromAws(cloudAccountId, org.id);
    }
}
