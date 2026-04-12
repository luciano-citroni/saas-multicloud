import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { RolesGuard } from '../../rbac/roles.guard';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { GcpNetworkingService } from './gcp-networking.service';
import { GcpVpcNetworkResponseDto, GcpSubnetworkResponseDto, GcpFirewallRuleResponseDto } from './swagger.dto';

@ApiTags('GCP Networking')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('gcp/networking')
export class GcpNetworkingController {
    constructor(private readonly service: GcpNetworkingService) {}

    @Get('accounts/:cloudAccountId/networks')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar VPC Networks GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpVpcNetworkResponseDto] })
    async listNetworks(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        void org;
        return this.service.listNetworksFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/networks/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar VPC Networks GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpVpcNetworkResponseDto] })
    async syncNetworks(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncNetworksFromGcp(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/subnetworks')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar Subnetworks GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpSubnetworkResponseDto] })
    async listSubnetworks(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        void org;
        return this.service.listSubnetworksFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/subnetworks/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar Subnetworks GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpSubnetworkResponseDto] })
    async syncSubnetworks(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncSubnetworksFromGcp(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/firewall-rules')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar Firewall Rules GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpFirewallRuleResponseDto] })
    async listFirewallRules(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        void org;
        return this.service.listFirewallRulesFromDatabase(cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/firewall-rules/sync')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar Firewall Rules GCP' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GcpFirewallRuleResponseDto] })
    async syncFirewallRules(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncFirewallRulesFromGcp(cloudAccountId, org.id);
    }
}
