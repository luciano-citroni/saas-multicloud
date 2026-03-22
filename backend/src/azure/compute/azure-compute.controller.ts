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
import { AzureComputeService } from './azure-compute.service';

@ApiTags('Azure - Compute')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', required: true, description: 'UUID da organização ativa' })
@UseGuards(TenantGuard, RolesGuard)
@Controller('azure/accounts/:cloudAccountId')
export class AzureComputeController {
    constructor(private readonly computeService: AzureComputeService) {}

    @Get('virtual-machines')
    @ApiOperation({ summary: 'Listar Virtual Machines Azure sincronizadas' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Virtual Machines' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listVirtualMachines(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.computeService.listVirtualMachines(cloudAccountId, org.id);
    }

    @Get('virtual-machines/:resourceId')
    @ApiOperation({ summary: 'Detalhe de uma Virtual Machine Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno da Virtual Machine' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe da Virtual Machine' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getVirtualMachine(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.computeService.getVirtualMachine(resourceId, cloudAccountId, org.id);
    }

    @Get('vmss')
    @ApiOperation({ summary: 'Listar Virtual Machine Scale Sets Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Virtual Machine Scale Sets' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listVmss(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.computeService.listVmss(cloudAccountId, org.id);
    }

    @Get('vmss/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um Virtual Machine Scale Set Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do VMSS' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do Virtual Machine Scale Set' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getVmss(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.computeService.getVmss(resourceId, cloudAccountId, org.id);
    }

    @Get('disks')
    @ApiOperation({ summary: 'Listar Discos Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Discos Azure' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listDisks(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.computeService.listDisks(cloudAccountId, org.id);
    }

    @Get('disks/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um Disco Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do Disco' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do Disco Azure' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getDisk(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.computeService.getDisk(resourceId, cloudAccountId, org.id);
    }

    @Get('aks-clusters')
    @ApiOperation({ summary: 'Listar AKS Clusters Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de AKS Clusters' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listAksClusters(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.computeService.listAksClusters(cloudAccountId, org.id);
    }

    @Get('aks-clusters/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um AKS Cluster Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do AKS Cluster' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do AKS Cluster' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getAksCluster(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.computeService.getAksCluster(resourceId, cloudAccountId, org.id);
    }
}
