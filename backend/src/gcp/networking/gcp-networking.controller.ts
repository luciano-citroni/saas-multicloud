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

import { GcpNetworkingService } from './gcp-networking.service';
import { GcpVpcNetworkResponseDto, GcpSubnetworkResponseDto, GcpFirewallRuleResponseDto } from './swagger.dto';

@ApiTags('GCP Networking')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, CloudAccountAccessGuard, RolesGuard)
@Controller('gcp/networking')
export class GcpNetworkingController {
    constructor(private readonly service: GcpNetworkingService) {}

    @Get('accounts/:cloudAccountId/networks')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar VPC Networks GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpVpcNetworkResponseDto] })
    async listNetworks(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Tenant,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        return this.service.listNetworksFromDatabase(cloudAccountId, parsePaginationQuery(page, limit));
    }

    @Post('accounts/:cloudAccountId/networks/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar VPC Networks GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpVpcNetworkResponseDto] })
    async syncNetworks(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncNetworksFromGcp(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/subnetworks')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar Subnetworks GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpSubnetworkResponseDto] })
    async listSubnetworks(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Tenant,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        return this.service.listSubnetworksFromDatabase(cloudAccountId, parsePaginationQuery(page, limit));
    }

    @Post('accounts/:cloudAccountId/subnetworks/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar Subnetworks GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpSubnetworkResponseDto] })
    async syncSubnetworks(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncSubnetworksFromGcp(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/firewall-rules')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar Firewall Rules GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpFirewallRuleResponseDto] })
    async listFirewallRules(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Tenant,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        return this.service.listFirewallRulesFromDatabase(cloudAccountId, parsePaginationQuery(page, limit));
    }

    @Post('accounts/:cloudAccountId/firewall-rules/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar Firewall Rules GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpFirewallRuleResponseDto] })
    async syncFirewallRules(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncFirewallRulesFromGcp(cloudAccountId, org.id);
    }
}
