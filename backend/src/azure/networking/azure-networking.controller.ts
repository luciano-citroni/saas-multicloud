import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiHeader,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../rbac/roles.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AzureNetworkingService } from './azure-networking.service';

@ApiTags('Azure - Networking')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', required: true, description: 'UUID da organização ativa' })
@UseGuards(TenantGuard, RolesGuard)
@Controller('azure/accounts/:cloudAccountId')
export class AzureNetworkingController {
    constructor(private readonly networkingService: AzureNetworkingService) {}

    @Get('virtual-networks')
    @ApiOperation({ summary: 'Listar Virtual Networks Azure sincronizadas' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Virtual Networks' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listVirtualNetworks(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.networkingService.listVirtualNetworks(cloudAccountId, org.id);
    }

    @Get('virtual-networks/:resourceId')
    @ApiOperation({ summary: 'Detalhe de uma Virtual Network Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno da Virtual Network' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe da Virtual Network' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getVirtualNetwork(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.networkingService.getVirtualNetwork(resourceId, cloudAccountId, org.id);
    }

    @Get('network-interfaces')
    @ApiOperation({ summary: 'Listar Network Interfaces Azure sincronizadas' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Network Interfaces' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listNetworkInterfaces(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.networkingService.listNetworkInterfaces(cloudAccountId, org.id);
    }

    @Get('network-interfaces/:resourceId')
    @ApiOperation({ summary: 'Detalhe de uma Network Interface Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno da Network Interface' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe da Network Interface' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getNetworkInterface(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.networkingService.getNetworkInterface(resourceId, cloudAccountId, org.id);
    }

    @Get('public-ips')
    @ApiOperation({ summary: 'Listar Public IPs Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Public IPs' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listPublicIps(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.networkingService.listPublicIps(cloudAccountId, org.id);
    }

    @Get('public-ips/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um Public IP Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do Public IP' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do Public IP' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getPublicIp(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.networkingService.getPublicIp(resourceId, cloudAccountId, org.id);
    }

    @Get('nsgs')
    @ApiOperation({ summary: 'Listar Network Security Groups Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Network Security Groups' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listNsgs(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.networkingService.listNsgs(cloudAccountId, org.id);
    }

    @Get('nsgs/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um Network Security Group Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do NSG' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do Network Security Group' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getNsg(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.networkingService.getNsg(resourceId, cloudAccountId, org.id);
    }

    @Get('load-balancers')
    @ApiOperation({ summary: 'Listar Load Balancers Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Load Balancers' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listLoadBalancers(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.networkingService.listLoadBalancers(cloudAccountId, org.id);
    }

    @Get('load-balancers/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um Load Balancer Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do Load Balancer' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do Load Balancer' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getLoadBalancer(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.networkingService.getLoadBalancer(resourceId, cloudAccountId, org.id);
    }

    @Get('application-gateways')
    @ApiOperation({ summary: 'Listar Application Gateways Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Application Gateways' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listApplicationGateways(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.networkingService.listApplicationGateways(cloudAccountId, org.id);
    }

    @Get('application-gateways/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um Application Gateway Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do Application Gateway' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do Application Gateway' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getApplicationGateway(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.networkingService.getApplicationGateway(resourceId, cloudAccountId, org.id);
    }
}
